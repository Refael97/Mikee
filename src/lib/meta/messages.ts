import "server-only";
import { getConnection, type MetaConfig } from "../connections";
import { metaContext } from "./context";
import { type Graph, inspectToken, MetaError } from "./graph";

/**
 * Reading the business's Instagram direct messages (read only: nothing is sent or marked as read).
 *
 * Only the Instagram account linked to the page the client chose for this business is read, with this
 * business's own token and its page token. Every answer is ok, empty or error, and an error always says
 * which of these it is, so Mikee never answers "direct messages can't be read" in general:
 * - not_connected: Meta is not connected, the token is invalid, or access was lost (reconnect)
 * - no_page / no_instagram_account: the business has no page or no Instagram account chosen
 * - permission_missing: the token lacks a messaging permission, or Meta refused for lack of one
 * - no_asset_access: the token cannot act for the page, or the page is not linked to that Instagram account
 * - not_this_business: the conversation is not one of this business's Instagram conversations
 * - meta_error: Meta refused for another reason (its original fields are included)
 */
export type DmReason = "not_connected" | "no_page" | "no_instagram_account" | "permission_missing" | "no_asset_access" | "not_this_business" | "meta_error";

/** Permissions Instagram messaging needs on a Facebook Login token (instagram_manage_messages is the core one). */
export const MESSAGING_SCOPES = ["instagram_basic", "instagram_manage_messages", "pages_manage_metadata", "pages_show_list"];

export type DmAccess = {
  /** Where the permission list came from: Meta's live token inspection, the list saved at connection, or neither. */
  scopesFrom: "live" | "saved" | "unknown";
  missing: string[];
  tokenKind?: string;
  instagram?: { id: string; username?: string };
  page?: { id: string; name?: string };
};

export type DmError = { status: "error"; reason: DmReason; error: string; access?: DmAccess; meta?: ReturnType<MetaError["details"]> };

export type ConversationList = {
  status: "ok" | "empty";
  access: DmAccess;
  count: number;
  conversations?: { id: string; updated: string; with: { username?: string; id: string }[] }[];
  next?: string;
};

export type ConversationRead = {
  status: "ok" | "empty";
  access: DmAccess;
  conversationId: string;
  with: { username?: string; id: string }[];
  /** Oldest first. `from` is "business" for messages the business sent, otherwise "customer". */
  messages: { id: string; time: string; from: "business" | "customer"; sender?: string; text?: string }[];
  /** Messages Meta listed whose content could not be read (with the first reason). */
  unreadable?: { count: number; error: string };
  note: string;
};

function fromMeta(err: unknown, access?: DmAccess): DmError {
  if (!(err instanceof MetaError)) return { status: "error", reason: "meta_error", error: err instanceof Error ? err.message : String(err), access };
  const c = err.code ?? -1;
  const reason: DmReason = err.isAccessLost ? "not_connected" : c === 10 || (c >= 200 && c <= 299) ? "permission_missing" : "meta_error";
  return { status: "error", reason, error: err.describe(), access, meta: err.details() };
}

/**
 * The checks before any message is read: the connection, the token's permissions (inspected live with
 * the app's credentials when possible), the page token, and that the page is linked to the chosen
 * Instagram account. Returns the page Graph to read with, or the exact reason it cannot be read.
 */
export async function messagingAccess(workspaceId: string): Promise<{ ok: true; page: Graph; igId: string; access: DmAccess } | ({ ok: false } & DmError)> {
  const conn = await getConnection<MetaConfig>(workspaceId, "meta");
  if (!conn?.secret) return { ok: false, status: "error", reason: "not_connected", error: "Facebook and Instagram are not connected for this business. The client connects them in Settings." };
  const cfg = conn.config;
  const access: DmAccess = {
    scopesFrom: "unknown",
    missing: [],
    tokenKind: cfg.tokenType,
    instagram: cfg.igUserId ? { id: cfg.igUserId, username: cfg.igUsername } : undefined,
    page: cfg.pageId ? { id: cfg.pageId, name: cfg.pageName } : undefined,
  };
  if (conn.status === "broken") {
    return { ok: false, status: "error", reason: "not_connected", error: `Access to Facebook/Instagram was lost (${conn.statusReason ?? "unknown reason"}). The client reconnects in Settings.`, access };
  }
  if (!cfg.pageId) return { ok: false, status: "error", reason: "no_page", error: "No Facebook page is chosen for this business, and Instagram messages are read through the page linked to the account. The client picks one in Settings.", access };
  if (!cfg.igUserId) return { ok: false, status: "error", reason: "no_instagram_account", error: "No Instagram account is chosen for this business. The client picks one in Settings.", access };

  const live = await inspectToken(conn.secret).catch(() => null);
  if (live && !live.valid) return { ok: false, status: "error", reason: "not_connected", error: "Meta says this business's token is no longer valid. The client reconnects in Settings.", access };
  const scopes = live?.scopes ?? cfg.scopes;
  access.scopesFrom = live ? "live" : cfg.scopes ? "saved" : "unknown";
  access.missing = scopes ? MESSAGING_SCOPES.filter((s) => !scopes.includes(s)) : [];
  if (access.missing.includes("instagram_manage_messages")) {
    return {
      ok: false,
      status: "error",
      reason: "permission_missing",
      error: `This business's token does not carry ${access.missing.join(", ")} (checked ${access.scopesFrom === "live" ? "with Meta now" : "in the permissions saved when it connected"}). The permission has to be in the app's Login for Business configuration, and the client reconnects so the new token carries it.`,
      access,
    };
  }

  try {
    const ctx = await metaContext(workspaceId);
    const page = await ctx.graph.forPage(cfg.pageId);
    // The page must be linked to the Instagram account chosen for this business; otherwise its inbox is someone else's.
    const linked = await page.get<{ instagram_business_account?: { id: string } }>(`/${cfg.pageId}`, { fields: "instagram_business_account" });
    if (linked.instagram_business_account?.id && linked.instagram_business_account.id !== cfg.igUserId) {
      return {
        ok: false,
        status: "error",
        reason: "no_asset_access",
        error: `The chosen page (${cfg.pageName ?? cfg.pageId}) is linked to a different Instagram account than the one chosen for this business (${cfg.igUsername ?? cfg.igUserId}). The client fixes the choice in Settings.`,
        access,
      };
    }
    return { ok: true, page, igId: cfg.igUserId, access };
  } catch (err) {
    const e = fromMeta(err, access);
    if (err instanceof MetaError && /Page access token/.test(err.message)) e.reason = "no_asset_access";
    return { ok: false, ...e };
  }
}

type Participant = { id: string; username?: string };
const others = (list: Participant[] | undefined, igId: string) => (list ?? []).filter((p) => p.id !== igId).map((p) => ({ id: p.id, username: p.username }));

/** The business's Instagram conversations, newest first, one page at a time. */
export async function instagramConversations(workspaceId: string, limit = 20, after?: string): Promise<ConversationList | DmError> {
  const a = await messagingAccess(workspaceId);
  if (!a.ok) return { status: "error", reason: a.reason, error: a.error, access: a.access, meta: a.meta };
  try {
    const res = await a.page.get<{ data?: { id: string; updated_time: string; participants?: { data?: Participant[] } }[]; paging?: { next?: string; cursors?: { after?: string } } }>(
      `/${a.access.page!.id}/conversations`,
      { platform: "instagram", fields: "id,updated_time,participants", limit: Math.min(limit, 25), ...(after ? { after } : {}) },
    );
    const conversations = (res.data ?? []).map((c) => ({ id: c.id, updated: c.updated_time, with: others(c.participants?.data, a.igId) }));
    const next = res.paging?.next ? res.paging.cursors?.after : undefined;
    if (!conversations.length && !next) return { status: "empty", access: a.access, count: 0 };
    return { status: "ok", access: a.access, count: conversations.length, conversations, ...(next ? { next } : {}) };
  } catch (err) {
    return fromMeta(err, a.access);
  }
}

/** The latest messages of one of the business's Instagram conversations (Meta returns at most the 20 most recent). */
export async function instagramConversation(workspaceId: string, conversationId: string, limit = 20): Promise<ConversationRead | DmError> {
  const a = await messagingAccess(workspaceId);
  if (!a.ok) return { status: "error", reason: a.reason, error: a.error, access: a.access, meta: a.meta };
  try {
    const conv = await a.page.get<{ participants?: { data?: Participant[] }; messages?: { data?: { id: string; created_time?: string }[] } }>(`/${conversationId}`, {
      fields: "participants,messages",
    });
    const people = conv.participants?.data ?? [];
    // Read through this business's page token, and only if the business's own account is in the conversation.
    if (!people.some((p) => p.id === a.igId)) {
      return { status: "error", reason: "not_this_business", error: "This conversation is not one of this business's Instagram conversations.", access: a.access };
    }
    const ids = (conv.messages?.data ?? []).slice(0, Math.min(limit, 20));
    const read = await Promise.all(
      ids.map((m) =>
        a.page
          .get<{ id: string; created_time: string; from?: Participant; message?: string }>(`/${m.id}`, { fields: "id,created_time,from,to,message" })
          .then((x) => ({ ok: true as const, x }))
          .catch((err) => ({ ok: false as const, err })),
      ),
    );
    const failed = read.filter((r) => !r.ok);
    if (ids.length && failed.length === ids.length) return fromMeta((failed[0] as { err: unknown }).err, a.access);
    const messages = read
      .flatMap((r) => (r.ok ? [r.x] : []))
      .map((m) => ({
        id: m.id,
        time: m.created_time,
        from: m.from?.id === a.igId ? ("business" as const) : ("customer" as const),
        sender: m.from?.username,
        text: m.message || undefined,
      }))
      .sort((x, y) => x.time.localeCompare(y.time));
    const firstFailure = failed[0] as { err: unknown } | undefined;
    return {
      status: messages.length ? "ok" : "empty",
      access: a.access,
      conversationId,
      with: others(people, a.igId),
      messages,
      ...(firstFailure ? { unreadable: { count: failed.length, error: fromMeta(firstFailure.err).error } } : {}),
      note: "Read only. Meta returns at most the 20 most recent messages of a conversation. A message without text is a photo, sticker, reaction or shared post. Nothing was sent or marked as read.",
    };
  } catch (err) {
    return fromMeta(err, a.access);
  }
}
