import "server-only";
import { createHash } from "crypto";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { logActivity } from "./activity";
import { renderCard } from "./cards";
import { appendMessage } from "./conversation";
import { enqueue } from "./jobs";
import type { ProposalKind } from "./specs";
import { forgetBusiness } from "./ttl";

export type Proposal = typeof schema.proposals.$inferSelect;

/** JSON with sorted keys, so the same action always hashes the same. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object)
      .filter((k) => (v as any)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as any)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** The approval is bound to this: a different action (any media, text, audience, budget, date) has a different hash. */
export const versionOf = (kind: string, action: unknown) => sha(`${kind}:${canonical(action)}`).slice(0, 32);

/** Two cards with the same key are the same suggestion; only one may wait for the client at a time. */
export function dedupeKey(kind: ProposalKind, a: any): string {
  switch (kind) {
    case "change":
      return `target:${a.target.id}`;
    case "campaign":
      return `campaign:${sha(canonical({ goal: a.goal, links: a.ads.map((x: any) => x.link).sort(), media: a.ads.map((x: any) => x.media.url).sort() })).slice(0, 24)}`;
    case "post":
      return `post:${sha(canonical({ format: a.format ?? "auto", channels: [...a.channels].sort(), text: String(a.text).trim().replace(/\s+/g, " "), media: a.media, scheduleAt: a.scheduleAt })).slice(0, 24)}`;
    case "budget":
      return `budget:${a.month}`;
    case "media":
      return `media:${sha(`${a.type}:${a.model}:${a.prompt}`).slice(0, 24)}`;
    case "activate":
      return a.scope === "adsets" ? `activate:${a.campaignId}:${[...(a.adsetIds ?? [a.adsetId])].sort().join(",")}` : `activate:${a.campaignId}`;
    case "adset":
      return `adset:${a.campaignId}:${sha(canonical({ audience: a.adset.audience, media: a.adset.ads.map((x: any) => x.media.url).sort() })).slice(0, 24)}`;
    case "adset_copy":
      return `adset_copy:${a.sourceAdsetId}:${sha(canonical({ target: a.targetCampaignId ?? "", changes: a.changes ?? {}, ads: a.includeAds })).slice(0, 24)}`;
    case "video":
      return `video:${sha(canonical({ format: a.format, scenes: a.scenes })).slice(0, 24)}`;
  }
}

export class ProposalConflict extends Error {
  constructor(message: string, public existing?: Proposal) {
    super(message);
  }
}

const DECLINE_MEMORY_DAYS = 7;

/**
 * Creates an immutable card. Rejects a suggestion that is already waiting, or that the client turned down
 * in the last week (unless she asked for it again). `replaces` supersedes an earlier pending card, which
 * can then no longer be approved.
 */
export async function createProposal(opts: {
  workspaceId: string;
  conversationId?: string;
  kind: ProposalKind;
  action: Record<string, unknown>;
  month: string;
  currency?: string;
  reserved?: number;
  credits?: number;
  replaces?: string;
  clientAsked?: boolean;
  /** Who made it: a specialist id, "mikee" or "platform". */
  agent?: string;
}): Promise<Proposal> {
  const d = await db();
  const key = dedupeKey(opts.kind, opts.action);

  if (opts.replaces) {
    const old = await d.query.proposals.findFirst({
      where: and(eq(schema.proposals.id, opts.replaces), eq(schema.proposals.workspaceId, opts.workspaceId)),
    });
    if (!old || old.status !== "pending") throw new ProposalConflict("The card to replace is no longer waiting for approval.");
  }

  const pending = await d.query.proposals.findFirst({
    where: and(eq(schema.proposals.workspaceId, opts.workspaceId), eq(schema.proposals.dedupeKey, key), eq(schema.proposals.status, "pending")),
  });
  if (pending && pending.id !== opts.replaces) {
    throw new ProposalConflict(
      `A card for this is already waiting for the client ("${pending.card.title}", ${pending.createdAt.toISOString()}). Do not suggest it again; refer to it, or pass replaces: "${pending.id}" if she asked for a change.`,
      pending,
    );
  }

  if (!opts.clientAsked) {
    const since = new Date(Date.now() - DECLINE_MEMORY_DAYS * 86400000);
    const declined = await d.query.proposals.findFirst({
      where: and(
        eq(schema.proposals.workspaceId, opts.workspaceId),
        eq(schema.proposals.dedupeKey, key),
        eq(schema.proposals.status, "declined"),
        gt(schema.proposals.decidedAt, since),
      ),
    });
    if (declined) {
      throw new ProposalConflict(
        `The client declined this same suggestion on ${declined.decidedAt!.toISOString().slice(0, 10)}. Do not bring it back this week unless she asks (then pass clientAsked: true).`,
      );
    }
  }

  try {
    return await d.transaction(async (tx) => {
      // Supersede first: the database allows only one waiting card per suggestion (unique index).
      const id = crypto.randomUUID();
      if (opts.replaces) {
        await tx
          .update(schema.proposals)
          .set({ status: "superseded", supersededBy: id, decidedAt: new Date() })
          .where(and(eq(schema.proposals.id, opts.replaces), eq(schema.proposals.status, "pending")));
      }
      const [row] = await tx
        .insert(schema.proposals)
        .values({
          id,
          workspaceId: opts.workspaceId,
          conversationId: opts.conversationId ?? null,
          kind: opts.kind,
          versionHash: versionOf(opts.kind, opts.action),
          dedupeKey: key,
          month: opts.month,
          reserved: opts.reserved ?? 0,
          card: renderCard(opts.kind, opts.action, opts.currency, { credits: opts.credits }) as unknown as Record<string, unknown>,
          action: opts.action,
          agent: opts.agent ?? null,
        })
        .returning();
      return row;
    });
  } catch (e) {
    if (/proposals_pending_key|duplicate key/i.test(String((e as Error).message) + String((e as any).cause?.message ?? ""))) {
      throw new ProposalConflict("A card for this is already waiting for the client. Do not suggest it again.");
    }
    throw e;
  }
}

export class ApprovalRejected extends Error {}

/**
 * The client's approval of one exact version. A single atomic status change means that a double click,
 * two open tabs, or a retry while running all lead to one execution. A failed card can be retried; the
 * executor resumes from its saved progress.
 */
export async function approveProposal(workspaceId: string, id: string, versionHash: string, opts: { auto?: boolean } = {}) {
  const d = await db();
  const claimed = await d
    .update(schema.proposals)
    .set({ status: "executing", attempts: sql`${schema.proposals.attempts} + 1`, decidedAt: sql`coalesce(${schema.proposals.decidedAt}, now())` })
    .where(
      and(
        eq(schema.proposals.id, id),
        eq(schema.proposals.workspaceId, workspaceId),
        eq(schema.proposals.versionHash, versionHash),
        sql`(${schema.proposals.status} = 'pending' OR (${schema.proposals.status} = 'failed' AND coalesce((${schema.proposals.result}->>'retryable')::boolean, true)))`,
      ),
    )
    .returning();

  if (!claimed.length) {
    const p = await d.query.proposals.findFirst({ where: and(eq(schema.proposals.id, id), eq(schema.proposals.workspaceId, workspaceId)) });
    if (!p) throw new ApprovalRejected("הכרטיס לא נמצא");
    if (p.versionHash !== versionHash) throw new ApprovalRejected("ההצעה עודכנה מאז שהוצגה. צריך לאשר את הגרסה החדשה.");
    if (p.status === "executing" || p.status === "done") return { status: p.status, duplicate: true as const };
    if (p.status === "superseded") throw new ApprovalRejected("מייקי החליף את ההצעה הזאת בגרסה חדשה.");
    if (p.status === "declined" || p.status === "cancelled") throw new ApprovalRejected("ההצעה הזאת כבר נדחתה.");
    if (p.status === "withdrawn") throw new ApprovalRejected("מייקי ביטל את ההצעה הזאת, והיא לא תבוצע.");
    throw new ApprovalRejected("אי אפשר לאשר את ההצעה הזאת כרגע.");
  }

  const job = await enqueue(workspaceId, "execute", { proposalId: id });
  await logActivity(workspaceId, "approval", `${opts.auto ? "אושר אוטומטית" : "אושר"}: ${String(claimed[0].card.title)}`, { proposalId: id, version: versionHash });
  return { status: "executing" as const, jobId: job.id };
}

/** Declines a waiting card, or cancels a failed one (the executor's cleanup removes half-built objects). */
export async function declineProposal(workspaceId: string, id: string) {
  const d = await db();
  const [row] = await d
    .update(schema.proposals)
    .set({ status: sql`case when ${schema.proposals.status} = 'failed' then 'cancelled' else 'declined' end`, decidedAt: new Date() })
    .where(and(eq(schema.proposals.id, id), eq(schema.proposals.workspaceId, workspaceId), inArray(schema.proposals.status, ["pending", "failed"])))
    .returning();
  if (!row) throw new ApprovalRejected("ההצעה כבר טופלה");
  if (row.status === "cancelled") await enqueue(workspaceId, "execute", { proposalId: id, cleanup: true });
  return row;
}

/**
 * Mikee takes back a waiting card that was wrong (for example a new campaign when she asked for an ad set in an
 * existing one). It can no longer be approved, and it does not count as her declining the idea.
 */
export async function withdrawProposal(workspaceId: string, id: string, reason: string) {
  const d = await db();
  const [row] = await d
    .update(schema.proposals)
    .set({ status: "withdrawn", decidedAt: new Date(), result: { withdrawn: reason.slice(0, 300) } })
    .where(and(eq(schema.proposals.id, id), eq(schema.proposals.workspaceId, workspaceId), eq(schema.proposals.status, "pending")))
    .returning();
  return row ?? null;
}

export async function saveProgress(id: string, patch: Record<string, unknown>) {
  const d = await db();
  await d
    .update(schema.proposals)
    .set({ progress: sql`${schema.proposals.progress} || ${JSON.stringify(patch)}::jsonb` })
    .where(eq(schema.proposals.id, id));
}

export async function finishProposal(p: Proposal, ok: boolean, result: Record<string, unknown>) {
  forgetBusiness(p.workspaceId); // what pages show from Meta may have changed
  const d = await db();
  await d.update(schema.proposals).set({ status: ok ? "done" : "failed", result, finishedAt: new Date() }).where(eq(schema.proposals.id, p.id));
  const title = String(p.card.title);
  await logActivity(p.workspaceId, p.kind, ok ? title : `נכשל: ${title}`, result, ok);
  // Report in the conversation the card came from (or the latest one, for cards made before conversations).
  const conversationId =
    p.conversationId ??
    (await d.query.conversations.findFirst({ where: eq(schema.conversations.workspaceId, p.workspaceId), orderBy: desc(schema.conversations.updatedAt) }))?.id;
  if (!conversationId) return;
  await appendMessage(p.workspaceId, conversationId, "user", "event", [
    {
      type: "text",
      text: ok
        ? p.kind === "campaign"
          ? `[Platform event, not typed by the client] "${title}" was built PAUSED at Meta and read back; it matches the approved card. An activation card is now waiting for the client: nothing spends until she approves it. Meta review: ${String(result.review ?? "")}${(result.blockers as string[] | undefined)?.length ? ` Blockers: ${JSON.stringify(result.blockers)}` : ""}. Tell her briefly, in one or two sentences.${result.activationProposalId ? ` {"proposalId":"${String(result.activationProposalId)}"}` : ""}`
          : `[Platform event, not typed by the client] "${title}" was carried out successfully. Result: ${JSON.stringify(result)}`
        : `[Platform event, not typed by the client] "${title}" failed: ${String(result.detail ?? result.error)}. ${result.retryable === false ? "It cannot be retried automatically." : "The client can retry from the card; progress is kept, nothing is duplicated."} Explain simply if she asks.`,
    },
  ]);
}

/** Cards the client has not answered yet, and recent declines, so Mikee does not repeat himself. */
export async function openAndRecent(workspaceId: string) {
  const d = await db();
  const since = new Date(Date.now() - 14 * 86400000);
  const rows = await d
    .select()
    .from(schema.proposals)
    .where(and(eq(schema.proposals.workspaceId, workspaceId), sql`(${schema.proposals.status} = 'pending' OR ${schema.proposals.decidedAt} > ${since.toISOString()})`))
    .orderBy(desc(schema.proposals.createdAt))
    .limit(30);
  return rows;
}
