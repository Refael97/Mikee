import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { enqueue } from "../jobs";

/**
 * Meta's webhook for Instagram messages. Every delivery is signed with the app secret
 * (X-Hub-Signature-256: sha256 HMAC of the raw body); anything unsigned or wrongly signed is refused.
 * A message is stored once per Meta message id and handed to the worker, so a repeated delivery is never
 * answered twice and the webhook answers Meta quickly.
 */
export function validSignature(raw: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(raw, "utf8").digest("hex"), "utf8");
  const given = Buffer.from(header.slice(7), "utf8");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

type Messaging = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean; is_deleted?: boolean; is_unsupported?: boolean; attachments?: unknown[] };
};
type Payload = { object?: string; entry?: { id?: string; time?: number; messaging?: Messaging[] }[] };

/** The one business whose chosen Instagram account this is. Two businesses claiming it means neither gets it. */
async function workspaceFor(igId: string): Promise<string | null> {
  const d = await db();
  const rows = await d
    .select({ workspaceId: schema.connections.workspaceId })
    .from(schema.connections)
    .where(and(eq(schema.connections.provider, "meta"), eq(schema.connections.status, "ok"), sql`${schema.connections.config}->>'igUserId' = ${igId}`));
  if (rows.length !== 1) {
    if (rows.length > 1) console.warn(`[instagram] account ${igId} is connected to ${rows.length} businesses; messages ignored`);
    return null;
  }
  return rows[0].workspaceId;
}

/** Stores the delivery's new messages and queues each for handling. Returns how many were new. */
export async function ingest(payload: Payload): Promise<number> {
  if (payload.object !== "instagram") return 0;
  const d = await db();
  let added = 0;
  for (const entry of payload.entry ?? []) {
    const igId = entry.id;
    if (!igId) continue;
    const workspaceId = await workspaceFor(igId);
    if (!workspaceId) continue;
    for (const m of entry.messaging ?? []) {
      const msg = m.message;
      // Only messages: reactions, reads, postbacks and deletions are not questions.
      if (!msg?.mid || msg.is_deleted || !m.sender?.id || !m.recipient?.id) continue;
      const echo: boolean = !!msg.is_echo || m.sender.id === igId;
      const customerId: string = echo ? m.recipient.id : m.sender.id;
      if (customerId === igId) continue;
      if (!echo && m.recipient.id !== igId) continue;
      const sentAt = new Date(m.timestamp && m.timestamp > 0 ? m.timestamp : Date.now());
      const [row] = await d
        .insert(schema.igMessages)
        .values({
          workspaceId,
          mid: msg.mid.slice(0, 300),
          customerId,
          direction: echo ? "echo" : "in",
          text: typeof msg.text === "string" ? msg.text.slice(0, 2000) : null,
          hasAttachment: !!msg.attachments?.length || !!msg.is_unsupported,
          sentAt,
        })
        .onConflictDoNothing({ target: schema.igMessages.mid })
        .returning({ id: schema.igMessages.id });
      if (!row) continue; // the same message delivered again
      if (!echo) {
        await d
          .insert(schema.igThreads)
          .values({ workspaceId, customerId, lastCustomerAt: sentAt })
          .onConflictDoUpdate({
            target: [schema.igThreads.workspaceId, schema.igThreads.customerId],
            set: { lastCustomerAt: sql`greatest(${schema.igThreads.lastCustomerAt}, ${sentAt.toISOString()}::timestamptz)`, updatedAt: new Date() },
          });
      }
      await enqueue(workspaceId, "igreply", { messageId: row.id });
      added++;
    }
  }
  return added;
}
