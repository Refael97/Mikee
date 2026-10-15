import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "../db";

/**
 * Meta's signed_request (sent to the data deletion and deauthorize callbacks): "<signature>.<payload>", both
 * base64url, the signature an HMAC-SHA256 of the payload with the app secret. Anything else is rejected.
 */
export function parseSignedRequest(signed: string | null | undefined, secret = process.env.META_APP_SECRET): { user_id?: string; algorithm?: string } | null {
  if (!signed || !secret || signed.length > 4096) return null;
  const [sig, body] = signed.split(".");
  if (!sig || !body) return null;
  const expected = createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof payload !== "object" || payload === null || String(payload.algorithm).toUpperCase() !== "HMAC-SHA256") return null;
    return { ...payload, user_id: payload.user_id != null ? String(payload.user_id) : undefined };
  } catch {
    return null;
  }
}

/** A short code the person can quote; the same request always gets the same code. */
export function confirmationCode(userId: string, secret = process.env.META_APP_SECRET ?? ""): string {
  return createHmac("sha256", `deletion:${secret}`).update(userId).digest("base64url").slice(0, 16);
}

/**
 * Deletes what Mikee holds from Meta for this Facebook user: the stored connection (token and asset choices)
 * and the Instagram conversations received through it. Matched by the user id saved when they connected.
 * Returns how many businesses were affected (0 when nothing was stored for that person).
 */
export async function deleteMetaData(userId: string): Promise<number> {
  const d = await db();
  const rows = await d
    .select({ workspaceId: schema.connections.workspaceId })
    .from(schema.connections)
    .where(
      and(
        eq(schema.connections.provider, "meta"),
        or(sql`${schema.connections.config}->>'metaUserId' = ${userId}`, sql`${schema.connections.config}->>'personId' = ${userId}`),
      ),
    );
  const ids = [...new Set(rows.map((r) => r.workspaceId))];
  if (!ids.length) return 0;
  await d.delete(schema.igMessages).where(inArray(schema.igMessages.workspaceId, ids));
  await d.delete(schema.igThreads).where(inArray(schema.igThreads.workspaceId, ids));
  await d.delete(schema.connections).where(and(eq(schema.connections.provider, "meta"), inArray(schema.connections.workspaceId, ids)));
  return ids.length;
}

/** The person removed the app: the token no longer works, so the connection is marked for reconnecting. */
export async function deauthorize(userId: string): Promise<number> {
  const d = await db();
  const res = await d
    .update(schema.connections)
    .set({ status: "broken", statusReason: "The app was removed from Facebook", secret: null, updatedAt: new Date() })
    .where(
      and(
        eq(schema.connections.provider, "meta"),
        or(sql`${schema.connections.config}->>'metaUserId' = ${userId}`, sql`${schema.connections.config}->>'personId' = ${userId}`),
      ),
    )
    .returning({ workspaceId: schema.connections.workspaceId });
  return res.length;
}
