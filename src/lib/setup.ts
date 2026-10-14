import "server-only";
import { count, eq, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { hashPassword, passwordProblem } from "./crypto";

/** Settings the app cannot run without, by name only (values are never shown). */
export function missingSettings(): string[] {
  const need: [string, (v: string) => boolean][] = [
    ["DATABASE_URL", (v) => /^postgres(ql)?:\/\//.test(v)],
    ["SESSION_SECRET", (v) => v.length >= 32],
    ["MIKEE_ENCRYPTION_KEY", (v) => /^[0-9a-f]{64,}$/i.test(v)],
    ["APP_URL", (v) => /^https?:\/\//.test(v)],
    ["ANTHROPIC_API_KEY", (v) => v.length > 10],
    ["CRON_SECRET", (v) => v.length >= 24],
  ];
  return need.filter(([k, ok]) => !ok(process.env[k] ?? "")).map(([k]) => k);
}

/**
 * First run on a new server: if there are no users yet and the owner's details are in the environment
 * (MIKEE_OWNER_EMAIL, MIKEE_OWNER_PASSWORD, MIKEE_OWNER_NAME, MIKEE_BUSINESS_NAME), create the business and its
 * owner. After the first sign-in, delete MIKEE_OWNER_PASSWORD from the variables; it is never used again.
 */
export async function bootstrapOwner() {
  const email = process.env.MIKEE_OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.MIKEE_OWNER_PASSWORD ?? "";
  if (!email || !password) return;
  const d = await db();
  const [{ n }] = await d.select({ n: count() }).from(schema.users);
  if (Number(n) > 0) return;
  const problem = passwordProblem(password);
  if (problem) {
    console.error(`[setup] MIKEE_OWNER_PASSWORD is too weak (${problem}); no user was created.`);
    return;
  }
  const [ws] = await d.insert(schema.workspaces).values({ name: process.env.MIKEE_BUSINESS_NAME?.trim() || "העסק שלי" }).returning();
  await d.insert(schema.users).values({ workspaceId: ws.id, email, name: process.env.MIKEE_OWNER_NAME?.trim() || email.split("@")[0], passwordHash: hashPassword(password) });
  console.log(`[setup] Created the business and the owner ${email}. You can now remove MIKEE_OWNER_PASSWORD from the variables.`);
}

/**
 * Owner's password reset, for whoever controls the server's variables: set MIKEE_RESET_EMAIL and
 * MIKEE_RESET_PASSWORD, redeploy, sign in, then delete both. If no user has that email, one is created in the
 * first business (or a new one), so a lost or reset database can also be recovered. Every session of that
 * user is signed out. Nothing is logged except that it happened.
 */
export async function resetPasswordFromEnv() {
  const email = process.env.MIKEE_RESET_EMAIL?.trim().toLowerCase();
  const password = process.env.MIKEE_RESET_PASSWORD ?? "";
  if (!email || !password) return;
  const problem = passwordProblem(password);
  if (problem) {
    console.error(`[setup] MIKEE_RESET_PASSWORD is too weak (${problem}); nothing was changed.`);
    return;
  }
  const d = await db();
  const user = await d.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (user) {
    await d
      .update(schema.users)
      .set({ passwordHash: hashPassword(password), sessionVersion: sql`${schema.users.sessionVersion} + 1`, passwordChangedAt: new Date() })
      .where(eq(schema.users.id, user.id));
    console.log(`[setup] Password reset for ${email}. Remove MIKEE_RESET_EMAIL and MIKEE_RESET_PASSWORD from the variables.`);
    return;
  }
  const ws = (await d.query.workspaces.findFirst()) ?? (await d.insert(schema.workspaces).values({ name: process.env.MIKEE_BUSINESS_NAME?.trim() || "העסק שלי" }).returning())[0];
  await d.insert(schema.users).values({ workspaceId: ws.id, email, name: process.env.MIKEE_OWNER_NAME?.trim() || email.split("@")[0], passwordHash: hashPassword(password) });
  console.log(`[setup] No user had ${email}; created one in "${ws.name}". Remove MIKEE_RESET_EMAIL and MIKEE_RESET_PASSWORD from the variables.`);
}
