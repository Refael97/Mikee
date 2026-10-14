import "server-only";
import { randomBytes, timingSafeEqual } from "crypto";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { DUMMY_HASH, hashPassword, passwordProblem, verifyPassword } from "./crypto";
import { hit } from "./guard";
import { logActivity } from "./activity";
import { findUserByLogin } from "./username";

/**
 * Password reset without email, but never without proof. Proof is either the user's own one-time recovery
 * code (created in the profile and shown once), or the platform owner's code from the server's variables
 * (MIKEE_RESET_CODE), for people who have no code yet. Knowing an email alone is never enough: these
 * accounts can approve ad spend.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I

export const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function newRecoveryCode(): string {
  const bytes = randomBytes(16);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return chars.match(/.{4}/g)!.join("-");
}

export async function createRecoveryCode(userId: string): Promise<string> {
  const code = newRecoveryCode();
  const d = await db();
  await d.update(schema.users).set({ recoveryHash: hashPassword(normalizeCode(code)) }).where(eq(schema.users.id, userId));
  return code;
}

function ownerCodeMatches(code: string): boolean {
  const want = normalizeCode(process.env.MIKEE_RESET_CODE ?? "");
  if (want.length < 16) return false;
  const a = Buffer.from(normalizeCode(code));
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type ResetInput = { email: string; code: string; password: string; confirm: string; ip: string };
export type ResetResult = { ok: true; userId: string; sessionVersion: number } | { ok: false; error: string };

const WRONG = "הפרטים או קוד השחזור לא נכונים.";

export async function resetWithCode(input: ResetInput): Promise<ResetResult> {
  const email = input.email.trim().toLowerCase().slice(0, 200);
  const code = normalizeCode(input.code.slice(0, 100));
  const [byIp, byEmail] = await Promise.all([hit(`reset:ip:${input.ip}`, 10, 3600), hit(`reset:e:${email}`, 5, 3600)]);
  if (!byIp.ok || !byEmail.ok) return { ok: false, error: "יותר מדי ניסיונות. אפשר לנסות שוב בעוד שעה." };
  if (input.password !== input.confirm) return { ok: false, error: "הסיסמאות לא זהות." };
  const weak = passwordProblem(input.password);
  if (weak) return { ok: false, error: weak };

  const d = await db();
  const user = await findUserByLogin(email);
  // Same work whether or not the email exists, so the form does not reveal who has an account.
  const personal = verifyPassword(code, user?.recoveryHash ?? DUMMY_HASH);
  const owner = ownerCodeMatches(code);
  if (!user || (!personal && !owner)) {
    if (user) await logActivity(user.workspaceId, "security", "ניסיון איפוס סיסמה עם קוד שגוי", { ip: input.ip }, false);
    return { ok: false, error: WRONG };
  }
  const [u] = await d
    .update(schema.users)
    .set({
      passwordHash: hashPassword(input.password),
      passwordChangedAt: new Date(),
      sessionVersion: sql`${schema.users.sessionVersion} + 1`,
      // A personal code works once; the owner's code leaves the user's own code in place.
      ...(personal ? { recoveryHash: null } : {}),
    })
    .where(eq(schema.users.id, user.id))
    .returning({ v: schema.users.sessionVersion });
  await logActivity(user.workspaceId, "security", personal ? "הסיסמה אופסה עם קוד השחזור" : "הסיסמה אופסה על ידי מנהל המערכת", { ip: input.ip });
  return { ok: true, userId: user.id, sessionVersion: u.v };
}
