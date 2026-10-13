"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, schema } from "@/lib/db";
import { endSession, startSession } from "@/lib/auth";
import { DUMMY_HASH, verifyPassword } from "@/lib/crypto";
import { hit, LIMITS } from "@/lib/guard";
import { logActivity } from "@/lib/activity";

/**
 * Sign in. Limits per email and per network address stop password guessing; the answer is the same for a
 * wrong email and a wrong password, and takes the same time.
 */
export async function login(_: string | null, form: FormData): Promise<string | null> {
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const password = String(form.get("password") ?? "").slice(0, 256);
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const [byEmail, byIp] = await Promise.all([hit(`login:e:${email}`, LIMITS.loginPerEmail15m, 900), hit(`login:ip:${ip}`, LIMITS.loginPerIp15m, 900)]);
  if (!byEmail.ok || !byIp.ok) {
    return `יותר מדי ניסיונות. אפשר לנסות שוב בעוד ${Math.ceil(Math.max(byEmail.retryAfter, byIp.retryAfter) / 60)} דקות.`;
  }
  const d = await db();
  const user = email ? await d.query.users.findFirst({ where: eq(schema.users.email, email) }) : undefined;
  const ok = verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    if (user) await logActivity(user.workspaceId, "security", "ניסיון כניסה עם סיסמה שגויה", { ip }, false);
    return "האימייל או הסיסמה לא נכונים";
  }
  await startSession(user.id, user.sessionVersion);
  await logActivity(user.workspaceId, "security", "כניסה לחשבון", { ip });
  redirect("/");
}

export async function logout() {
  await endSession();
  redirect("/login");
}
