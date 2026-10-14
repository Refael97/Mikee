import "server-only";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { MetaError } from "../meta/graph";
import { messagingAccess } from "../meta/messages";
import { setAutoReply, type AutoReply } from "./facts";
import { sendInstagramMessage, type SendResult } from "./send";

/** What the client sees: messages waiting for her, what Mikee answered, and conversations a person took over. */
export async function inbox(workspaceId: string) {
  const d = await db();
  const rows = await d.query.igMessages.findMany({
    where: and(eq(schema.igMessages.workspaceId, workspaceId), eq(schema.igMessages.direction, "in"), inArray(schema.igMessages.status, ["pending", "sending", "answered", "handled", "human"])),
    orderBy: desc(schema.igMessages.sentAt),
    limit: 80,
  });
  const paused = await d.query.igThreads.findMany({ where: and(eq(schema.igThreads.workspaceId, workspaceId), isNotNull(schema.igThreads.humanAt)) });
  return {
    messages: rows.map((r) => ({
      id: r.id,
      customerId: r.customerId,
      text: r.text,
      hasAttachment: r.hasAttachment,
      sentAt: r.sentAt,
      status: r.status,
      reason: r.reason,
      reply: r.status === "answered" || r.status === "handled" || r.status === "sending" ? r.reply : null,
    })),
    paused: paused.map((t) => t.customerId),
  };
}

/** Switching it on also subscribes the business's page to message events, so Meta starts sending them. */
export async function switchAutoReply(workspaceId: string, enabled: boolean, topics: AutoReply["topics"]): Promise<AutoReply> {
  if (!enabled) return setAutoReply(workspaceId, { enabled, topics });
  const a = await messagingAccess(workspaceId);
  if (!a.ok) return setAutoReply(workspaceId, { enabled, topics, subscription: { ok: false, at: new Date().toISOString(), detail: a.error } });
  let subscription: AutoReply["subscription"];
  try {
    await a.page.post(`/${a.access.page!.id}/subscribed_apps`, { subscribed_fields: "messages" });
    subscription = { ok: true, at: new Date().toISOString(), detail: "subscribed" };
  } catch (err) {
    subscription = { ok: false, at: new Date().toISOString(), detail: err instanceof MetaError ? err.describe() : (err as Error).message };
  }
  return setAutoReply(workspaceId, { enabled, topics, subscription });
}

async function ownRow(workspaceId: string, id: string) {
  const d = await db();
  return d.query.igMessages.findFirst({ where: and(eq(schema.igMessages.id, id), eq(schema.igMessages.workspaceId, workspaceId), eq(schema.igMessages.direction, "in")) });
}

/** The client answers a waiting message herself: she has the conversation now, so automatic replies stop for it. */
export async function replyFromOwner(workspaceId: string, messageId: string, text: string): Promise<SendResult> {
  const row = await ownRow(workspaceId, messageId);
  if (!row) return { status: "error", reason: "not_this_business", error: "ההודעה לא נמצאה." };
  const d = await db();
  const reply = text.trim();
  // Stored before sending, so the echo Meta sends back is not mistaken for someone else answering.
  await d.update(schema.igMessages).set({ reply, updatedAt: new Date() }).where(eq(schema.igMessages.id, row.id));
  const sent = await sendInstagramMessage(workspaceId, row.customerId, reply);
  if (sent.status === "sent") {
    await d.update(schema.igMessages).set({ status: "handled", replyMid: sent.messageId, updatedAt: new Date() }).where(eq(schema.igMessages.id, row.id));
    await d
      .insert(schema.igThreads)
      .values({ workspaceId, customerId: row.customerId, humanAt: new Date() })
      .onConflictDoUpdate({ target: [schema.igThreads.workspaceId, schema.igThreads.customerId], set: { humanAt: new Date(), updatedAt: new Date() } });
  }
  return sent;
}

export async function markHandled(workspaceId: string, messageId: string) {
  const row = await ownRow(workspaceId, messageId);
  if (!row) return false;
  const d = await db();
  await d.update(schema.igMessages).set({ status: "handled", updatedAt: new Date() }).where(eq(schema.igMessages.id, row.id));
  return true;
}

/** Gives a conversation a person took over back to Mikee's automatic replies. */
export async function resumeThread(workspaceId: string, customerId: string) {
  const d = await db();
  await d.update(schema.igThreads).set({ humanAt: null, updatedAt: new Date() }).where(and(eq(schema.igThreads.workspaceId, workspaceId), eq(schema.igThreads.customerId, customerId)));
}

/** Messages waiting for the client (for the dot on the inbox link). */
export async function pendingCount(workspaceId: string): Promise<number> {
  const d = await db();
  const [{ n }] = await d
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.igMessages)
    .where(and(eq(schema.igMessages.workspaceId, workspaceId), eq(schema.igMessages.direction, "in"), eq(schema.igMessages.status, "pending")));
  return n;
}
