import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { hashPassword, passwordProblem } from "./crypto";
import { hit } from "./guard";
import { logActivity } from "./activity";
import { findUserByLogin } from "./username";

/**
 * Forgot password, pilot version: a username (or email) and a new password set it right away, with no email
 * and no code. Every other device is signed out, the reset is recorded in the account's activity, and
 * attempts are rate limited. Before opening Mikee to the public this must require proof again.
 */
export type ResetInput = { login: string; password: string; ip: string };
export type ResetResult = { ok: true; userId: string; sessionVersion: number } | { ok: false; error: string };

export async function resetPassword(input: ResetInput): Promise<ResetResult> {
  const login = input.login.trim().toLowerCase().slice(0, 200);
  const [byIp, byLogin] = await Promise.all([hit(`reset:ip:${input.ip}`, 20, 3600), hit(`reset:e:${login}`, 10, 3600)]);
  if (!byIp.ok || !byLogin.ok) return { ok: false, error: "יותר מדי ניסיונות. אפשר לנסות שוב בעוד שעה." };
  const weak = passwordProblem(input.password);
  if (weak) return { ok: false, error: weak };

  const user = await findUserByLogin(login);
  if (!user) return { ok: false, error: "לא מצאנו משתמש בשם הזה." };
  const d = await db();
  const [u] = await d
    .update(schema.users)
    .set({ passwordHash: hashPassword(input.password), passwordChangedAt: new Date(), sessionVersion: sql`${schema.users.sessionVersion} + 1` })
    .where(eq(schema.users.id, user.id))
    .returning({ v: schema.users.sessionVersion });
  await logActivity(user.workspaceId, "security", "הסיסמה אופסה ממסך הכניסה", { ip: input.ip });
  return { ok: true, userId: user.id, sessionVersion: u.v };
}
