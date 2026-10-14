import "server-only";
import { cache } from "react";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "./db";

const COOKIE = "mikee_session";
// Stay signed in for 60 days by default (SESSION_DAYS); "sign out everywhere" and a password change end it sooner.
const MAX_AGE = 60 * 60 * 24 * Math.min(365, Math.max(1, Number(process.env.SESSION_DAYS) || 60));

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return s;
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

/**
 * The session cookie carries the user id, the user's session version and an expiry, signed with HMAC.
 * Changing the password or "sign out everywhere" bumps the version, so every older cookie stops working.
 */
export async function startSession(userId: string, version: number) {
  const expires = Math.floor(Date.now() / 1000) + MAX_AGE;
  const value = `${userId}.${version}.${expires}`;
  (await cookies()).set(COOKIE, `${value}.${sign(value)}`, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

async function sessionClaim(): Promise<{ userId: string; version: number } | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw || raw.length > 300) return null;
  const [userId, version, expires, sig] = raw.split(".");
  if (!userId || !version || !expires || !sig || !/^[0-9a-f-]{36}$/i.test(userId)) return null;
  const expected = Buffer.from(sign(`${userId}.${version}.${expires}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (Number(expires) < Date.now() / 1000) return null;
  return { userId, version: Number(version) };
}

export type Session = {
  user: typeof schema.users.$inferSelect;
  workspace: typeof schema.workspaces.$inferSelect;
};

/** Read once per request: the layout and the page share it. */
export const getSession = cache(async (): Promise<Session | null> => {
  const claim = await sessionClaim();
  if (!claim) return null;
  const d = await db();
  const user = await d.query.users.findFirst({ where: eq(schema.users.id, claim.userId) });
  if (!user || user.sessionVersion !== claim.version) return null;
  const workspace = await d.query.workspaces.findFirst({
    where: eq(schema.workspaces.id, user.workspaceId),
  });
  if (!workspace) return null;
  return { user, workspace };
});

/** For pages: redirects to /login when signed out. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Ends every session of this user on every device. */
export async function revokeSessions(userId: string) {
  const d = await db();
  const [u] = await d
    .update(schema.users)
    .set({ sessionVersion: sql`${schema.users.sessionVersion} + 1` })
    .where(eq(schema.users.id, userId))
    .returning({ v: schema.users.sessionVersion });
  return u?.v ?? 1;
}
