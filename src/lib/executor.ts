import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { assertWithinBudget, BudgetExceeded, dailyCommit, syncMetaSpendCap } from "./budget";
import { mediaGenerator } from "./higgsfield";
import { storeBytes, storeFromUrl } from "./media";
import { buildProject, renderVideo, VideoProblem } from "./video/render";
import { metaContext } from "./meta/context";
import { MetaError } from "./meta/graph";
import { activateCampaign, applyChange, buildCampaign, describeBuild, PublishProblem, type Checkpoint, cleanupLaunch, currentDailyBudget, describeError, publishPost, verifyBuild, whatWasBuilt } from "./meta/actions";
import { createProposal, finishProposal, ProposalConflict, type Proposal, saveProgress } from "./proposals";
import { ActivateSpec, BudgetRequestSpec, CampaignSpec, ChangeSpec, MediaSpec, PostSpec, type ProposalCard, VideoSpec } from "./specs";
import { friendlyError } from "./errors";
import { CTA_HE } from "./cards";
import { mediaAllowance, recordUsage } from "./usage";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class NotRetryable extends Error {}

function checkpoint(p: Proposal): Checkpoint {
  const cp: Checkpoint = {
    data: { ...(p.progress ?? {}) },
    save: async (patch) => {
      Object.assign(cp.data, patch);
      await saveProgress(p.id, patch);
    },
  };
  return cp;
}

/**
 * Runs an approved card. Called by the job worker, possibly more than once for the same card (a retry,
 * or a restart in the middle). Every path is idempotent: progress is checkpointed and resumed.
 */
export async function executeProposal(proposalId: string, opts: { cleanup?: boolean } = {}) {
  const d = await db();
  const p = await d.query.proposals.findFirst({ where: eq(schema.proposals.id, proposalId) });
  if (!p) return;
  const ws = await d.query.workspaces.findFirst({ where: eq(schema.workspaces.id, p.workspaceId) });
  const tz = ws?.timezone ?? "Asia/Jerusalem";
  const cp = checkpoint(p);

  if (opts.cleanup) {
    if (p.kind === "campaign" && p.status === "cancelled") await cleanupLaunch(await metaContext(p.workspaceId), cp).catch(() => undefined);
    return;
  }
  if (p.status !== "executing") return; // already finished by an earlier run of this job

  try {
    let result: Record<string, unknown> = {};
    switch (p.kind) {
      case "budget": {
        const spec = BudgetRequestSpec.parse(p.action);
        await d
          .insert(schema.budgetExtensions)
          .values({ workspaceId: p.workspaceId, proposalId: p.id, month: spec.month, amount: spec.amount, reason: spec.reason })
          .onConflictDoNothing({ target: schema.budgetExtensions.proposalId });
        result = { approvedAmount: spec.amount };
        await syncMetaSpendCap(p.workspaceId, tz, await metaContext(p.workspaceId)).catch(() => undefined);
        break;
      }
      case "campaign": {
        // Step one of two: build everything paused, read it back, and put the activation card in front of
        // the client. Nothing spends money here.
        const spec = CampaignSpec.parse(p.action);
        const ctx = await metaContext(p.workspaceId);
        await assertWithinBudget(p.workspaceId, tz, ctx, dailyCommit(spec.dailyBudget, tz, spec.endTime, spec.startTime), { excludeProposalId: p.id });
        const ids = await buildCampaign(ctx, spec, `mk-${p.id.slice(0, 8)}`, cp);
        const check = await verifyBuild(ctx, spec, ids);
        if (!check.ok) throw new NotRetryable(`The built campaign does not match the approved card (${check.mismatches.join("; ")}). It stays paused.`);
        const activation = await openActivation(p, spec, ids, check.review, tz, ctx.currency).catch((e) => (e instanceof ProposalConflict ? null : Promise.reject(e)));
        result = { ...ids, built: true, paused: true, review: check.review, blockers: check.blockers, activationProposalId: activation?.id };
        break;
      }
      case "activate": {
        // Step two: the client approved going live. The budget is checked again against live numbers.
        const spec = ActivateSpec.parse(p.action);
        const ctx = await metaContext(p.workspaceId);
        const live = await ctx.graph.get<{ effective_status?: string }>(`/${spec.campaignId}`, { fields: "effective_status" });
        if (live.effective_status !== "ACTIVE") {
          await assertWithinBudget(p.workspaceId, tz, ctx, dailyCommit(spec.dailyBudget, tz, spec.endTime, spec.startTime), { excludeProposalId: p.id });
        }
        result = await activateCampaign(ctx, spec);
        await syncMetaSpendCap(p.workspaceId, tz, ctx).catch(() => undefined);
        break;
      }
      case "change": {
        const spec = ChangeSpec.parse(p.action);
        const ctx = await metaContext(p.workspaceId);
        const c = spec.change;
        if ((c.kind === "daily_budget" || c.kind === "resume") && spec.target.type !== "ad") {
          const now = await currentDailyBudget(ctx, spec.target.type, spec.target.id);
          const node = await ctx.graph.get<{ effective_status?: string }>(`/${spec.target.id}`, { fields: "effective_status" });
          const alreadyLive = node.effective_status === "ACTIVE";
          const delta = c.kind === "daily_budget" ? (alreadyLive ? c.amount - now.daily : 0) : alreadyLive ? 0 : now.daily;
          await assertWithinBudget(p.workspaceId, tz, ctx, dailyCommit(Math.max(0, delta), tz, now.end), { excludeProposalId: p.id });
        }
        await applyChange(ctx, spec);
        result = { applied: c.kind };
        await syncMetaSpendCap(p.workspaceId, tz, ctx).catch(() => undefined);
        break;
      }
      case "post": {
        const spec = PostSpec.parse(p.action);
        result = await publishPost(await metaContext(p.workspaceId), spec, cp, p.attempts > 1, p.workspaceId);
        break;
      }
      case "media": {
        result = await executeMedia(p, cp, tz);
        break;
      }
      case "video": {
        result = await executeVideo(p, cp);
        break;
      }
    }
    await finishProposal(p, true, result);
  } catch (err) {
    const retryable = !(err instanceof NotRetryable || err instanceof VideoProblem || err instanceof PublishProblem);
    // A failed build may have left paused objects at Meta (or created one whose answer was lost): look.
    const built = p.kind === "campaign" ? await metaContext(p.workspaceId).then((ctx) => whatWasBuilt(ctx, `mk-${p.id.slice(0, 8)}`, cp)).catch((e) => ({ checked: false as const, error: describeError(e), adIds: [] })) : undefined;
    await finishProposal(p, false, {
      error: friendlyError(err),
      detail: built ? `${describeError(err)} || ${describeBuild(built)}` : describeError(err),
      meta: err instanceof MetaError ? err.details() : undefined,
      built,
      retryable,
      budget: err instanceof BudgetExceeded || undefined,
    });
  }
}

/** The second card of a campaign: the built, paused campaign, ready to go live with one more approval. */
async function openActivation(p: Proposal, spec: CampaignSpec, ids: { campaignId: string; adsetId: string; adIds: string[] }, review: string, tz: string, currency?: string) {
  const card = p.card as unknown as ProposalCard;
  const action: ActivateSpec = {
    fromProposal: p.id,
    title: card.title,
    campaignId: ids.campaignId,
    adsetId: ids.adsetId,
    adIds: ids.adIds,
    dailyBudget: spec.dailyBudget,
    startTime: spec.startTime,
    endTime: spec.endTime,
    review,
    media: spec.ads.map((a) => ({ type: a.media.type, url: a.media.url, text: a.primaryText, headline: a.headline, cta: CTA_HE[a.cta] })),
  };
  const d = await db();
  const ws = await d.query.workspaces.findFirst({ where: eq(schema.workspaces.id, p.workspaceId) });
  return createProposal({
    workspaceId: p.workspaceId,
    conversationId: p.conversationId ?? undefined,
    kind: "activate",
    agent: "platform",
    action: action as unknown as Record<string, unknown>,
    month: p.month,
    currency,
    reserved: dailyCommit(spec.dailyBudget, ws?.timezone ?? tz, spec.endTime, spec.startTime),
    clientAsked: true,
  });
}

async function executeMedia(p: Proposal, cp: Checkpoint, tz: string) {
  const gen = mediaGenerator();
  if (!gen) throw new NotRetryable("Media generation is not connected");
  const spec = MediaSpec.parse(p.action);

  if (!cp.data.jobIds) {
    if (cp.data.submitting) {
      // An earlier attempt died while submitting: Higgsfield may or may not have started (and charged) it.
      // Never resubmit blindly; the client decides after checking.
      throw new NotRetryable("Not sure whether the earlier generation request reached Higgsfield. Check there before trying again.");
    }
    const credits = Number(p.reserved);
    const allowance = await mediaAllowance(p.workspaceId, tz);
    if (credits > allowance.remaining) {
      throw new NotRetryable(`This needs ${credits} credits but only ${allowance.remaining} are left in this month's media budget.`);
    }
    const refs: string[] = cp.data.refs ?? [];
    for (const url of spec.referenceUrls.slice(refs.length)) {
      refs.push(await gen.importUrl(url));
      await cp.save({ refs });
    }
    await cp.save({ submitting: true });
    const jobIds = await gen.submit(spec, refs);
    await cp.save({ jobIds });
    await recordUsage(p.workspaceId, tz, "higgsfield", credits, { proposalId: p.id, jobIds });
  }

  const waitMs = Number(process.env.MIKEE_MEDIA_WAIT_MS ?? 15 * 60_000);
  const interval = Math.min(3000, waitMs / 5);
  let urls: string[] = [];
  // Bounded by rounds rather than wall-clock, so a slow poll cannot stretch the wait indefinitely.
  for (let round = 0; round < Math.max(1, Math.ceil(waitMs / interval)); round++) {
    const r = await gen.poll(cp.data.jobIds);
    if (r.failed.length) throw new NotRetryable(`Higgsfield could not finish the generation (${r.failed.join(", ")})`);
    if (r.terminal) {
      urls = r.urls;
      break;
    }
    await sleep(interval);
  }
  if (!urls.length) throw new Error("The generation is still running at Higgsfield. Retrying will wait for the same job, not start a new one.");

  const stored: { url: string; type: "image" | "video" }[] = cp.data.stored ?? [];
  for (const url of urls.slice(stored.length)) {
    const m = await storeFromUrl(p.workspaceId, url, "higgsfield", cp.data.jobIds.join(","));
    stored.push({ url: m.url, type: m.type });
    await cp.save({ stored });
  }
  return { media: stored };
}

/** Renders an approved video on the HyperFrames worker and keeps the MP4 in the business's library. */
async function executeVideo(p: Proposal, cp: Checkpoint) {
  if (cp.data.stored) return { media: cp.data.stored };
  const spec = VideoSpec.parse(p.action);
  const mp4 = await renderVideo(await buildProject(p.workspaceId, spec));
  const m = await storeBytes(p.workspaceId, mp4, { filename: "video.mp4", source: "hyperframes", sourceRef: p.id, inLibrary: true, folder: "סרטונים" });
  const stored = [{ url: m.url, type: "video" as const, id: m.id }];
  await cp.save({ stored });
  return { media: stored };
}
