import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "./db";
import { assertWithinBudget, BudgetExceeded, dailyCommit, syncMetaSpendCap } from "./budget";
import { mediaGenerator } from "./higgsfield";
import { storeBytes, storeFromUrl } from "./media";
import { buildProject, renderVideo, VideoProblem } from "./video/render";
import { metaContext } from "./meta/context";
import { MetaError } from "./meta/graph";
import { resolveIdentity } from "./meta/identities";
import { resolveCatalog } from "./meta/catalog";
import { activateCampaign, addAdset, applyChange, buildCampaign, cleanupAdset, copyAdset, CopyUncertain, describeBuild, OwnershipProblem, reviewAds, targeting, PublishProblem, type Checkpoint, cleanupLaunch, currentDailyBudget, describeError, publishPost, verifyBuild, whatWasBuilt } from "./meta/actions";
import { approveProposal, createProposal, finishProposal, ProposalConflict, type Proposal, saveProgress } from "./proposals";
import { ActivateSpec, adsetsOf, AdsetAddSpec, AdsetCopySpec, BudgetRequestSpec, CampaignSpec, ChangeSpec, MediaSpec, PostSpec, type ProposalCard, totalDaily, VideoSpec } from "./specs";
import { instagramPublishAt, SCHEDULE_LATE_MS } from "./post-schedule";
import { friendlyError } from "./errors";
import { CTA_HE } from "./cards";
import { recordUsage } from "./usage";
import { CreditsExhausted, creditsFromHiggsfield, recordLost, release, reserve } from "./credits";

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
  let p = await d.query.proposals.findFirst({ where: eq(schema.proposals.id, proposalId) });
  if (!p) return;
  const ws = await d.query.workspaces.findFirst({ where: eq(schema.workspaces.id, p.workspaceId) });
  const tz = ws?.timezone ?? "Asia/Jerusalem";
  const cp = checkpoint(p);

  if (opts.cleanup) {
    if (p.kind === "campaign" && p.status === "cancelled") await cleanupLaunch(await metaContext(p.workspaceId), cp).catch(() => undefined);
    // An ad set added to or copied into an existing campaign: only that ad set goes, never the campaign.
    if ((p.kind === "adset" || p.kind === "adset_copy") && p.status === "cancelled") await cleanupAdset(await metaContext(p.workspaceId), cp).catch(() => undefined);
    return;
  }
  if (!["scheduled", "executing"].includes(p.status)) return;
  const scheduledAt = instagramPublishAt(p.kind, p.action);
  // Guard the executor as well as the queue: direct calls cannot publish early.
  if (scheduledAt && scheduledAt.getTime() > Date.now()) return { deferredUntil: scheduledAt };
  if (p.status === "scheduled") {
    const [started] = await d.update(schema.proposals).set({ status: "executing" })
      .where(and(eq(schema.proposals.id, p.id), eq(schema.proposals.status, "scheduled"))).returning();
    if (!started) return; // cancelled while this worker was claiming the job
    p = started;
  }
  if (p.status !== "executing") return; // already finished by an earlier run of this job

  try {
    if (scheduledAt && Date.now() - scheduledAt.getTime() > SCHEDULE_LATE_MS && !cp.data.instagram) {
      throw new NotRetryable(`מועד הפרסום עבר לפני יותר מחצי שעה, ולכן המשך הפרסום נעצר. אפשר לבחור מועד חדש.${cp.data.facebook ? " הפרסום בפייסבוק כבר בוצע." : ""}`);
    }
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
        await assertWithinBudget(p.workspaceId, tz, ctx, dailyCommit(totalDaily(spec), tz, spec.endTime, spec.startTime), { excludeProposalId: p.id });
        // The advertiser and payer the client chose for this card, account or business (null if none fits).
        const identity = await resolveIdentity(ctx, p.workspaceId, p.id);
        const ids = await buildCampaign(ctx, spec, `mk-${p.id.slice(0, 8)}`, cp, identity?.regional_regulation_identities);
        const check = await verifyBuild(ctx, spec, ids);
        if (!check.ok) throw new NotRetryable(`The built campaign does not match the approved card (${check.mismatches.join("; ")}). It stays paused.`);
        const activation = spec.buildOnly ? null : await openActivation(p, spec, ids, check.review, tz, ctx.currency).catch((e) => (e instanceof ProposalConflict ? null : Promise.reject(e)));
        // "Final approval only": her approval of this card was the final one, so a build that checked out clean
        // goes live now (the activation re-checks the budget against live numbers). Any review problem leaves
        // the activation card for her.
        const autoActivated = ws?.settings?.autonomy === "final" && !!activation && check.blockers.length === 0;
        if (autoActivated) await approveProposal(p.workspaceId, activation.id, activation.versionHash, { auto: true });
        result = { ...ids, built: true, paused: !autoActivated, review: check.review, blockers: check.blockers, activationProposalId: activation?.id, autoActivated: autoActivated || undefined };
        break;
      }
      case "activate": {
        // Step two: the client approved going live. The budget is checked again against live numbers.
        const spec = ActivateSpec.parse(p.action);
        const ctx = await metaContext(p.workspaceId);
        if (spec.catalog) {
          const source = await d.query.proposals.findFirst({ where: and(eq(schema.proposals.id, spec.fromProposal), eq(schema.proposals.workspaceId, p.workspaceId)) });
          if (!source || source.kind !== "campaign") throw new NotRetryable("לא נמצא כרטיס הקטלוג המקורי שאושר.");
          const approved = CampaignSpec.parse(source.action);
          if (approved.buildOnly || !approved.catalog) throw new NotRetryable("קמפיין מבחן נשאר מושהה. נדרש כרטיס חדש להפעלה.");
          await resolveCatalog(ctx, approved.catalog);
          // Re-read before spending: an operator may have changed the paused build since its first check.
          const built = source.result as unknown as Parameters<typeof verifyBuild>[2];
          if (built.campaignId !== spec.campaignId) throw new NotRetryable("הקמפיין להפעלה אינו הקמפיין שנבנה מהכרטיס המקורי.");
          const check = await verifyBuild(ctx, approved, built, { activationRetry: cp.data.catalogActivationStarted === true });
          if (!check.ok || check.blockers.length) throw new NotRetryable("קמפיין הקטלוג השתנה או נחסם במטא מאז הבנייה. הוא נשאר מושהה עד לבדיקה מחדש.");
        }
        if (spec.scope === "adsets") {
          // New ad sets inside an existing campaign: their own budget is what starts to spend.
          const first = await ctx.graph.get<{ effective_status?: string }>(`/${spec.adsetIds?.[0] ?? spec.adsetId}`, { fields: "effective_status" });
          if (first.effective_status !== "ACTIVE" && spec.dailyBudget > 0) {
            await assertWithinBudget(p.workspaceId, tz, ctx, dailyCommit(spec.dailyBudget, tz, spec.endTime, spec.startTime), { excludeProposalId: p.id });
          }
        } else {
          const live = await ctx.graph.get<{ effective_status?: string }>(`/${spec.campaignId}`, { fields: "effective_status" });
          if (live.effective_status !== "ACTIVE") {
            await assertWithinBudget(p.workspaceId, tz, ctx, dailyCommit(spec.dailyBudget, tz, spec.endTime, spec.startTime), { excludeProposalId: p.id });
          }
        }
        if (spec.catalog) await cp.save({ catalogActivationStarted: true });
        result = await activateCampaign(ctx, spec);
        await syncMetaSpendCap(p.workspaceId, tz, ctx).catch(() => undefined);
        break;
      }
      case "adset": {
        // A new ad set inside an existing campaign, built paused and read back. Never a new campaign.
        const spec = AdsetAddSpec.parse(p.action);
        const ctx = await metaContext(p.workspaceId);
        const daily = spec.campaignBudget ? 0 : (spec.adset.dailyBudget ?? 0);
        if (daily > 0) await assertWithinBudget(p.workspaceId, tz, ctx, dailyCommit(daily, tz, spec.endTime, spec.startTime), { excludeProposalId: p.id });
        const identity = await resolveIdentity(ctx, p.workspaceId, p.id);
        const r = await addAdset(ctx, spec, `mk-${p.id.slice(0, 8)}`, cp, identity?.regional_regulation_identities);
        if (r.mismatches.length) throw new NotRetryable(`The new ad set does not match the approved card (${r.mismatches.join("; ")}). It stays paused.`);
        result = await afterAdsetBuild(p, ws?.settings?.autonomy, tz, ctx.currency, {
          campaignId: r.campaignId,
          campaignName: spec.campaignName,
          adsetId: r.adsetId,
          adIds: r.adIds,
          dailyBudget: daily,
          startTime: spec.startTime,
          endTime: spec.endTime,
          review: await reviewAds(ctx, r.adIds),
          media: spec.adset.ads.map((a) => ({ type: a.media.type, url: a.media.url, metaImageHash: a.media.metaImageHash, metaVideoId: a.media.metaVideoId, text: a.primaryText, headline: a.headline, cta: CTA_HE[a.cta] })),
        });
        break;
      }
      case "adset_copy": {
        // Meta's /copies, paused, into the source's campaign or a matching one; then the requested changes.
        const spec = AdsetCopySpec.parse(p.action);
        const ctx = await metaContext(p.workspaceId);
        const daily = spec.changes?.dailyBudget ?? spec.copyDailyBudget ?? 0;
        if (daily > 0 && !cp.data.copiedAdsetId) await assertWithinBudget(p.workspaceId, tz, ctx, dailyCommit(daily, tz), { excludeProposalId: p.id });
        const r = await copyAdset(ctx, spec, cp);
        if (r.mismatches.length) throw new NotRetryable(`The copy does not match the approved card (${r.mismatches.join("; ")}). It stays paused.`);
        result = await afterAdsetBuild(p, ws?.settings?.autonomy, tz, ctx.currency, {
          campaignId: r.campaignId,
          campaignName: spec.targetCampaignName,
          adsetId: r.adsetId,
          adIds: r.adIds,
          dailyBudget: daily,
          review: await reviewAds(ctx, r.adIds),
          media: [],
        });
        result = { ...result, copiedAdsetId: r.adsetId, adMap: r.adMap };
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
        // The queue handles the schedule. At execution both channels publish now.
        result = await publishPost(await metaContext(p.workspaceId), scheduledAt ? { ...spec, scheduleAt: undefined } : spec, cp, p.attempts > 1, p.workspaceId);
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
    const retryable = !(err instanceof NotRetryable || err instanceof VideoProblem || err instanceof PublishProblem || err instanceof CreditsExhausted || err instanceof OwnershipProblem || err instanceof CopyUncertain);
    // A failed build may have left paused objects at Meta (or created one whose answer was lost): look.
    const built = p.kind === "campaign" ? await metaContext(p.workspaceId).then((ctx) => whatWasBuilt(ctx, `mk-${p.id.slice(0, 8)}`, cp)).catch((e) => ({ checked: false as const, error: describeError(e), adIds: [] })) : undefined;
    await finishProposal(p, false, {
      error: friendlyError(err),
      detail: built ? `${describeError(err)} || ${describeBuild(built)}` : describeError(err),
      meta: err instanceof MetaError ? err.details() : undefined,
      built,
      // Exactly where the ad set was aimed, so a location rule (EU advertiser and payer, verified advertiser) can be checked.
      sentGeo: p.kind === "campaign" ? sentGeo(p.action) : undefined,
      retryable,
      budget: err instanceof BudgetExceeded || undefined,
    });
  }
}

/** The second card of a campaign: the built, paused campaign, ready to go live with one more approval. */
async function openActivation(p: Proposal, spec: CampaignSpec, ids: { campaignId: string; adsetId: string; adIds: string[]; adsets?: { adsetId: string }[] }, review: string, tz: string, currency?: string) {
  const card = p.card as unknown as ProposalCard;
  const action: ActivateSpec = {
    catalog: spec.catalog,
    fromProposal: p.id,
    title: card.title,
    campaignId: ids.campaignId,
    adsetId: ids.adsetId,
    adIds: ids.adIds,
    adsetIds: ids.adsets?.map((a) => a.adsetId),
    scope: "campaign",
    dailyBudget: totalDaily(spec),
    startTime: spec.startTime,
    endTime: spec.endTime,
    review,
    media: adsetsOf(spec)
      .flatMap((x) => x.ads)
      .filter((a) => a.media)
      .map((a) => ({
        type: a.media!.type,
        url: a.media!.url,
        metaImageHash: a.media!.metaImageHash,
        metaVideoId: a.media!.metaVideoId,
        text: a.primaryText,
        headline: a.headline,
        cta: CTA_HE[a.cta],
      })),
  };
  return openActivationCard(p, action, tz, currency);
}

async function openActivationCard(p: Proposal, action: ActivateSpec, tz: string, currency?: string) {
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
    reserved: action.dailyBudget > 0 ? dailyCommit(action.dailyBudget, ws?.timezone ?? tz, action.endTime, action.startTime) : 0,
    clientAsked: true,
  });
}

/**
 * After an ad set was added to or copied into an existing campaign (paused, read back): the card to switch
 * on just that ad set. At "final approval only" a clean build goes live right away, like a new campaign.
 */
async function afterAdsetBuild(
  p: Proposal,
  autonomy: string | undefined,
  tz: string,
  currency: string | undefined,
  b: { campaignId: string; campaignName?: string; adsetId: string; adIds: string[]; dailyBudget: number; startTime?: string; endTime?: string; review: { review: string; blockers: string[] }; media: ActivateSpec["media"] },
) {
  const card = p.card as unknown as ProposalCard;
  const action: ActivateSpec = {
    fromProposal: p.id,
    title: card.title,
    campaignId: b.campaignId,
    adsetId: b.adsetId,
    adIds: b.adIds,
    adsetIds: [b.adsetId],
    scope: "adsets",
    dailyBudget: b.dailyBudget,
    startTime: b.startTime,
    endTime: b.endTime,
    review: b.review.review,
    media: b.media,
  };
  const activation = await openActivationCard(p, action, tz, currency).catch((e) => (e instanceof ProposalConflict ? null : Promise.reject(e)));
  const autoActivated = autonomy === "final" && !!activation && b.review.blockers.length === 0;
  if (autoActivated) await approveProposal(p.workspaceId, activation.id, activation.versionHash, { auto: true });
  return {
    campaignId: b.campaignId,
    adsetId: b.adsetId,
    adIds: b.adIds,
    newCampaign: false,
    built: true,
    paused: !autoActivated,
    review: b.review.review,
    blockers: b.review.blockers,
    activationProposalId: activation?.id,
    autoActivated: autoActivated || undefined,
  };
}

async function executeMedia(p: Proposal, cp: Checkpoint, tz: string) {
  const gen = mediaGenerator();
  if (!gen) throw new NotRetryable("Media generation is not connected");
  const spec = MediaSpec.parse(p.action);
  const hf = Number(p.reserved);
  // The credits are set aside before anything is sent (the same hold if the request already set it aside).
  // Once sent, the work is finished and charged whatever else happened to the balance meanwhile.
  const hold = cp.data.charged ? null : await reserve(p.workspaceId, tz, `proposal:${p.id}`, creditsFromHiggsfield(hf));
  if (!hold && !cp.data.charged && !cp.data.jobIds) throw new CreditsExhausted();
  try {
    if (!cp.data.jobIds) {
      if (cp.data.submitting) {
        // An earlier attempt died while submitting: Higgsfield may or may not have started (and charged) it.
        // Never resubmit blindly; the client decides after checking.
        throw new NotRetryable("Not sure whether the earlier generation request reached Higgsfield. Check there before trying again.");
      }
      const refs: string[] = cp.data.refs ?? [];
      for (const url of spec.referenceUrls.slice(refs.length)) {
        refs.push(await gen.importUrl(url));
        await cp.save({ refs });
      }
      await cp.save({ submitting: true });
      const jobIds = await gen.submit(spec, refs);
      await cp.save({ jobIds });
    }

    const waitMs = Number(process.env.MIKEE_MEDIA_WAIT_MS ?? 15 * 60_000);
    const interval = Math.min(3000, waitMs / 5);
    let urls: string[] = [];
    // Bounded by rounds rather than wall-clock, so a slow poll cannot stretch the wait indefinitely.
    for (let round = 0; round < Math.max(1, Math.ceil(waitMs / interval)); round++) {
      const r = await gen.poll(cp.data.jobIds);
      if (r.failed.length) {
        // Nothing usable came out: Higgsfield's charge is our cost, not the client's.
        if (!cp.data.lost) {
          await cp.save({ lost: true });
          await recordLost(p.workspaceId, tz, "higgsfield", hf, { proposalId: p.id, jobIds: cp.data.jobIds });
        }
        throw new NotRetryable(`Higgsfield could not finish the generation (${r.failed.join(", ")})`);
      }
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
    // Charged once, for a delivered result. A crash between the two writes undercharges, never doubles.
    if (!cp.data.charged) {
      await cp.save({ charged: true });
      await recordUsage(p.workspaceId, tz, "higgsfield", hf, { proposalId: p.id, jobIds: cp.data.jobIds }, hold?.id);
    }
    return { media: stored };
  } finally {
    // A retry that will wait for the same job sets aside again (by the same ref); anything else is done.
    await release(hold?.id);
  }
}

/** Renders an approved video on the HyperFrames worker and keeps the MP4 in the business's library. Editing is free. */
async function executeVideo(p: Proposal, cp: Checkpoint) {
  if (cp.data.stored) return { media: cp.data.stored };
  const spec = VideoSpec.parse(p.action);
  const mp4 = await renderVideo(await buildProject(p.workspaceId, spec));
  const m = await storeBytes(p.workspaceId, mp4, { filename: "video.mp4", source: "hyperframes", sourceRef: p.id, inLibrary: true, folder: "סרטונים" });
  const stored = [{ url: m.url, type: "video" as const, id: m.id }];
  await cp.save({ stored });
  return { media: stored };
}

/** The geo_locations a campaign card sends to Meta, or nothing when the card cannot be read. */
function sentGeo(action: unknown): unknown {
  try {
    return targeting(CampaignSpec.parse(action)).geo_locations;
  } catch {
    return undefined;
  }
}
