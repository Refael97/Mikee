import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { MetaError } from "../meta/graph";
import { instagramConversation, messagingAccess } from "../meta/messages";

/** Meta lets a business answer an Instagram message within 24 hours of the customer's last message. */
export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_REPLY_CHARS = 1000;

export type SendResult =
  | { status: "sent"; messageId: string; recipient: string }
  | { status: "error"; reason: "not_ready" | "not_this_business" | "outside_window" | "empty" | "meta_error"; error: string };

/**
 * When the customer last wrote to this business: from our own records of messages received by webhook,
 * or (for a conversation from before) from the business's inbox at Meta. Null when the customer is not
 * in a conversation with this business's account.
 */
async function lastCustomerMessage(workspaceId: string, customerId: string, page: { get: <T>(p: string, q?: Record<string, unknown>) => Promise<T> }, pageId: string) {
  const d = await db();
  const thread = await d.query.igThreads.findFirst({ where: and(eq(schema.igThreads.workspaceId, workspaceId), eq(schema.igThreads.customerId, customerId)) });
  if (thread?.lastCustomerAt) return thread.lastCustomerAt;
  const res = await page.get<{ data?: { id: string }[] }>(`/${pageId}/conversations`, { platform: "instagram", user_id: customerId, fields: "id" });
  const conv = res.data?.[0];
  if (!conv) return null;
  const read = await instagramConversation(workspaceId, conv.id, 20);
  if (read.status === "error") throw new Error(read.error);
  const last = read.messages.filter((m) => m.from === "customer").at(-1);
  return last ? new Date(last.time) : null;
}

/**
 * send_instagram_message: one text reply to a customer of the current business, through its own
 * connection and page token. Refused unless the customer is in a conversation with this business's
 * Instagram account and wrote within the last 24 hours. Never retried here: a timeout may have sent it.
 */
export async function sendInstagramMessage(workspaceId: string, customerId: string, text: string): Promise<SendResult> {
  const body = text.trim();
  if (!body) return { status: "error", reason: "empty", error: "There is nothing to send." };
  if (body.length > MAX_REPLY_CHARS) return { status: "error", reason: "empty", error: `The reply is longer than ${MAX_REPLY_CHARS} characters.` };
  if (!/^\d{5,30}$/.test(customerId)) return { status: "error", reason: "not_this_business", error: "Not a valid Instagram recipient." };

  const a = await messagingAccess(workspaceId);
  if (!a.ok) return { status: "error", reason: "not_ready", error: a.error };
  if (customerId === a.igId) return { status: "error", reason: "not_this_business", error: "The recipient is the business's own account." };
  const pageId = a.access.page!.id;

  let last: Date | null;
  try {
    last = await lastCustomerMessage(workspaceId, customerId, a.page, pageId);
  } catch (err) {
    return { status: "error", reason: "meta_error", error: err instanceof MetaError ? err.describe() : (err as Error).message };
  }
  if (!last) return { status: "error", reason: "not_this_business", error: "This person has no conversation with the business's Instagram account." };
  if (Date.now() - last.getTime() > REPLY_WINDOW_MS) {
    return { status: "error", reason: "outside_window", error: "The customer's last message is more than 24 hours old, so Instagram does not allow a reply from here. Answer in the Instagram app." };
  }

  try {
    const res = await a.page.post<{ recipient_id?: string; message_id?: string }>(`/${pageId}/messages`, { recipient: { id: customerId }, message: { text: body } });
    if (!res.message_id) return { status: "error", reason: "meta_error", error: "Meta did not confirm the message." };
    return { status: "sent", messageId: res.message_id, recipient: customerId };
  } catch (err) {
    return { status: "error", reason: "meta_error", error: err instanceof MetaError ? err.describe() : (err as Error).message };
  }
}
