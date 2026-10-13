import "server-only";
import type { CampaignSpec, ChangeSpec, PostSpec } from "../specs";
import { type MetaContext, requireAdAccount, toMajor, toMinor } from "./context";
import { MetaError } from "./graph";
import { bytesFromOwnUrl } from "../media";
import { safeFetch } from "../net";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const OBJECTIVE: Record<CampaignSpec["goal"], string> = {
  sales: "OUTCOME_SALES",
  leads: "OUTCOME_LEADS",
  traffic: "OUTCOME_TRAFFIC",
  engagement: "OUTCOME_ENGAGEMENT",
  awareness: "OUTCOME_AWARENESS",
};

/** Our own files are read straight from storage; anything else goes through the network guard. */
async function fetchBytes(url: string): Promise<Buffer> {
  const own = await bytesFromOwnUrl(url);
  if (own) return own;
  const res = await safeFetch(url, { maxBytes: 30 * 1024 * 1024, timeoutMs: 60_000 });
  if (!res.ok) throw new Error(`Could not download the image (HTTP ${res.status})`);
  return res.bytes();
}

async function uploadImage(ctx: MetaContext, url: string): Promise<string> {
  const account = requireAdAccount(ctx);
  const bytes = (await fetchBytes(url)).toString("base64");
  const res = await ctx.graph.post<{ images: Record<string, { hash: string }> }>(`/${account}/adimages`, { bytes });
  const first = Object.values(res.images ?? {})[0];
  if (!first?.hash) throw new Error("Image upload returned no hash");
  return first.hash;
}

async function uploadVideo(ctx: MetaContext, url: string): Promise<{ id: string; thumbnail?: string }> {
  const account = requireAdAccount(ctx);
  const { id } = await ctx.graph.post<{ id: string }>(`/${account}/advideos`, { file_url: url });
  for (let i = 0; i < 40; i++) {
    const v = await ctx.graph.get<any>(`/${id}`, { fields: "status,picture" });
    const state = v.status?.video_status;
    if (state === "ready") return { id, thumbnail: v.picture };
    if (state === "error") throw new Error("Meta could not process the video");
    await sleep(3000);
  }
  throw new Error("The video is still processing at Meta. Try approving again in a minute.");
}

function targeting(spec: CampaignSpec) {
  const a = spec.audience;
  const t: Record<string, unknown> = {
    geo_locations: a.cities?.length
      ? { cities: a.cities.map((c) => ({ key: c.key, radius: c.radiusKm ?? 10, distance_unit: "kilometer" })) }
      : { countries: a.countries },
    age_min: a.ageMin ?? 18,
    age_max: a.ageMax ?? 65,
    targeting_automation: { advantage_audience: a.advantage ? 1 : 0 },
  };
  if (a.genders !== "all") t.genders = [a.genders === "women" ? 2 : 1];
  if (a.interests?.length) t.flexible_spec = [{ interests: a.interests }];
  if (a.customAudienceIds?.length) t.custom_audiences = a.customAudienceIds.map((id) => ({ id }));
  if (a.excludedCustomAudienceIds?.length) t.excluded_custom_audiences = a.excludedCustomAudienceIds.map((id) => ({ id }));
  return t;
}

function optimization(ctx: MetaContext, spec: CampaignSpec) {
  switch (spec.goal) {
    case "sales":
      if (!ctx.pixelId) throw new Error("A sales campaign needs the website pixel. Connect it in Settings or choose traffic.");
      return {
        optimization_goal: "OFFSITE_CONVERSIONS",
        promoted_object: { pixel_id: ctx.pixelId, custom_event_type: spec.conversionEvent ?? "PURCHASE" },
      };
    case "leads":
      if (spec.leadFormId) {
        return { optimization_goal: "LEAD_GENERATION", destination_type: "ON_AD", promoted_object: { page_id: ctx.pageId } };
      }
      if (!ctx.pixelId) throw new Error("Website leads need the pixel. Connect it, or use an instant form (leadFormId).");
      return {
        optimization_goal: "OFFSITE_CONVERSIONS",
        promoted_object: { pixel_id: ctx.pixelId, custom_event_type: spec.conversionEvent ?? "LEAD" },
      };
    case "traffic":
      return { optimization_goal: ctx.pixelId ? "LANDING_PAGE_VIEWS" : "LINK_CLICKS", destination_type: "WEBSITE" };
    case "engagement":
      return { optimization_goal: "POST_ENGAGEMENT" };
    case "awareness":
      return { optimization_goal: "REACH" };
  }
}

async function createCreative(ctx: MetaContext, spec: CampaignSpec, ad: CampaignSpec["ads"][number], name: string) {
  const account = requireAdAccount(ctx);
  if (!ctx.pageId) throw new Error("No Facebook page connected");
  const ctaValue: Record<string, string> = spec.leadFormId ? { lead_gen_form_id: spec.leadFormId } : { link: ad.link };
  const call_to_action = { type: ad.cta, value: ctaValue };
  const base: Record<string, unknown> = { page_id: ctx.pageId };
  if (ctx.igUserId) base.instagram_user_id = ctx.igUserId;

  if (ad.media.type === "image") {
    const image_hash = await uploadImage(ctx, ad.media.url);
    base.link_data = {
      link: ad.link,
      message: ad.primaryText,
      name: ad.headline,
      description: ad.description,
      image_hash,
      call_to_action,
    };
  } else {
    const video = await uploadVideo(ctx, ad.media.url);
    base.video_data = {
      video_id: video.id,
      message: ad.primaryText,
      title: ad.headline,
      link_description: ad.description,
      image_url: video.thumbnail,
      call_to_action,
    };
  }
  const { id } = await ctx.graph.post<{ id: string }>(`/${account}/adcreatives`, { name, object_story_spec: base });
  return id;
}

export type LaunchResult = { campaignId: string; adsetId: string; adIds: string[] };

/** Progress store for an execution. Every created object is saved before the next step. */
export type Checkpoint = {
  data: Record<string, any>;
  save: (patch: Record<string, unknown>) => Promise<void>;
};

const exists = async (ctx: MetaContext, id?: string) => {
  if (!id) return false;
  try {
    const n = await ctx.graph.get<{ id: string; effective_status?: string }>(`/${id}`, { fields: "id,effective_status" });
    return n.effective_status !== "DELETED" && n.effective_status !== "ARCHIVED";
  } catch {
    return false;
  }
};

/** Finds an object created by an earlier attempt whose id was not saved (crash between create and save). */
async function findTagged(ctx: MetaContext, edge: string, tag: string): Promise<string | undefined> {
  const found = await ctx.graph.get<{ data: { id: string; name: string }[] }>(edge, {
    fields: "id,name",
    filtering: [{ field: "name", operator: "CONTAIN", value: tag }],
    limit: 5,
  });
  return found.data?.[0]?.id;
}

/**
 * Builds campaign -> ad set -> creatives -> ads, every object PAUSED, saving each id as it goes. It never
 * switches anything on: going live is a separate card the client approves after the build was read back.
 * A retry (after a failure or a restart) resumes from the saved ids or from objects tagged with the
 * proposal's tag, so it never creates a second campaign or a second copy of an ad.
 */
export async function buildCampaign(ctx: MetaContext, spec: CampaignSpec, tag: string, cp: Checkpoint): Promise<LaunchResult> {
  const account = requireAdAccount(ctx);
  const currency = ctx.currency ?? "ILS";
  const name = `Mikee · ${spec.title.replace(/[^\p{L}\p{N} ]/gu, "").trim()} · ${tag}`;

  let campaignId: string | undefined = cp.data.campaignId;
  if (!(await exists(ctx, campaignId))) campaignId = await findTagged(ctx, `/${account}/campaigns`, tag);
  if (!campaignId) {
    ({ id: campaignId } = await ctx.graph.post<{ id: string }>(`/${account}/campaigns`, {
      name,
      objective: OBJECTIVE[spec.goal],
      status: "PAUSED",
      special_ad_categories: [],
      is_adset_budget_sharing_enabled: false,
    }));
  }
  if (campaignId !== cp.data.campaignId) await cp.save({ campaignId, adsetId: null, ads: {} });

  let adsetId: string | undefined = cp.data.adsetId ?? undefined;
  if (!(await exists(ctx, adsetId))) adsetId = await findTagged(ctx, `/${campaignId}/adsets`, tag);
  if (!adsetId) {
    ({ id: adsetId } = await ctx.graph.post<{ id: string }>(`/${account}/adsets`, {
      name,
      campaign_id: campaignId,
      daily_budget: toMinor(spec.dailyBudget, currency),
      billing_event: "IMPRESSIONS",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      targeting: targeting(spec),
      start_time: spec.startTime,
      end_time: spec.endTime,
      status: "PAUSED",
      ...optimization(ctx, spec),
    }));
  }
  if (adsetId !== cp.data.adsetId) await cp.save({ adsetId });

  const ads: Record<string, string> = { ...(cp.data.ads ?? {}) };
  for (const [i, ad] of spec.ads.entries()) {
    const adName = `${name} · ${i + 1}`;
    if (await exists(ctx, ads[i])) continue;
    const found = await findTagged(ctx, `/${adsetId}/ads`, `${tag} · ${i + 1}`);
    if (found) {
      ads[i] = found;
    } else {
      const creativeId = await createCreative(ctx, spec, ad, adName);
      const { id } = await ctx.graph.post<{ id: string }>(`/${account}/ads`, {
        name: adName,
        adset_id: adsetId,
        creative: { creative_id: creativeId },
        status: "PAUSED",
      });
      ads[i] = id;
    }
    await cp.save({ ads });
  }

  return { campaignId: campaignId!, adsetId: adsetId!, adIds: Object.values(ads) };
}

export type BuildCheck = { ok: boolean; mismatches: string[]; review: string; blockers: string[] };

const REVIEW_HE: Record<string, string> = {
  PENDING_REVIEW: "בבדיקה של מטא",
  IN_PROCESS: "בעיבוד",
  DISAPPROVED: "נדחתה",
  WITH_ISSUES: "עם בעיה",
  PAUSED: "מוכנה",
  CAMPAIGN_PAUSED: "מוכנה",
  ADSET_PAUSED: "מוכנה",
  ACTIVE: "מוכנה",
};

/**
 * Reads the built campaign back from Meta and compares it with what the client approved: budget, dates,
 * that nothing is live, and every ad present. Also reports Meta's review state in plain words, with the
 * reason for any rejected ad. Meta's review is not guaranteed to pass, so this is said, never assumed.
 */
export async function verifyBuild(ctx: MetaContext, spec: CampaignSpec, ids: LaunchResult): Promise<BuildCheck> {
  const currency = ctx.currency ?? "ILS";
  const mismatches: string[] = [];
  const blockers: string[] = [];
  const campaign = await ctx.graph.get<{ status?: string; effective_status?: string }>(`/${ids.campaignId}`, { fields: "status,effective_status" });
  if (campaign.status && campaign.status !== "PAUSED") mismatches.push(`campaign status is ${campaign.status}, expected PAUSED`);
  const adset = await ctx.graph.get<{ daily_budget?: string; end_time?: string; status?: string }>(`/${ids.adsetId}`, { fields: "daily_budget,end_time,status" });
  if (adset.daily_budget != null && Number(adset.daily_budget) !== toMinor(spec.dailyBudget, currency)) {
    mismatches.push(`daily budget is ${toMajor(adset.daily_budget, currency)}, approved ${spec.dailyBudget}`);
  }
  if (spec.endTime && adset.end_time && Math.abs(new Date(adset.end_time).getTime() - new Date(spec.endTime).getTime()) > 60_000) {
    mismatches.push(`end date is ${adset.end_time}, approved ${spec.endTime}`);
  }
  if (ids.adIds.length !== spec.ads.length) mismatches.push(`${ids.adIds.length} ads exist, ${spec.ads.length} were approved`);
  const states: string[] = [];
  for (const id of ids.adIds) {
    const ad = await ctx.graph
      .get<{ effective_status?: string; ad_review_feedback?: Record<string, unknown> }>(`/${id}`, { fields: "effective_status,ad_review_feedback" })
      .catch(() => ({}) as { effective_status?: string; ad_review_feedback?: Record<string, unknown> });
    states.push(ad.effective_status ?? "UNKNOWN");
    if (ad.effective_status === "DISAPPROVED" || ad.effective_status === "WITH_ISSUES") {
      blockers.push(JSON.stringify(ad.ad_review_feedback ?? {}).slice(0, 300));
    }
  }
  const counts = states.reduce<Record<string, number>>((m, x) => ((m[REVIEW_HE[x] ?? "מוכנה"] = (m[REVIEW_HE[x] ?? "מוכנה"] ?? 0) + 1), m), {});
  const review =
    Object.entries(counts)
      .map(([k, n]) => `${n} ${n === 1 ? "מודעה" : "מודעות"} ${k}`)
      .join(", ") + ". מטא בודקת כל מודעה לפני שהיא מוצגת, ואישור שלה לא מובטח.";
  return { ok: mismatches.length === 0, mismatches, review, blockers };
}

/** Switches a built campaign on: ads, then the ad set, then the campaign. Safe to run twice. */
export async function activateCampaign(ctx: MetaContext, ids: { campaignId: string; adsetId: string; adIds: string[] }) {
  for (const id of ids.adIds) await ctx.graph.post(`/${id}`, { status: "ACTIVE" });
  await ctx.graph.post(`/${ids.adsetId}`, { status: "ACTIVE" });
  await ctx.graph.post(`/${ids.campaignId}`, { status: "ACTIVE" });
  return { activated: true, campaignId: ids.campaignId };
}

/** Removes a paused, half-built campaign when the client cancels a failed launch. */
export async function cleanupLaunch(ctx: MetaContext, cp: Checkpoint) {
  if (cp.data.campaignId) {
    await ctx.graph.delete(`/${cp.data.campaignId}`).catch(() => undefined);
    await cp.save({ campaignId: null, adsetId: null, ads: {} });
  }
}

/** Current daily budget of a campaign/ad set in major units, and where the budget lives. */
export async function currentDailyBudget(ctx: MetaContext, type: "campaign" | "adset", id: string) {
  const currency = ctx.currency ?? "ILS";
  const node = await ctx.graph.get<any>(`/${id}`, {
    fields: type === "campaign" ? "daily_budget,lifetime_budget,stop_time,adsets.limit(50){id,daily_budget}" : "daily_budget,lifetime_budget,end_time",
  });
  if (type === "campaign" && !node.daily_budget && !node.lifetime_budget) {
    const sets: any[] = node.adsets?.data ?? [];
    return {
      level: "adset" as const,
      adsets: sets.map((s) => ({ id: s.id, daily: toMajor(s.daily_budget, currency) })),
      daily: sets.reduce((s, a) => s + toMajor(a.daily_budget, currency), 0),
      end: node.stop_time as string | undefined,
    };
  }
  return {
    level: type,
    adsets: [] as { id: string; daily: number }[],
    daily: toMajor(node.daily_budget, currency),
    lifetime: toMajor(node.lifetime_budget, currency),
    end: (node.stop_time ?? node.end_time) as string | undefined,
  };
}

export async function applyChange(ctx: MetaContext, spec: ChangeSpec) {
  const { target, change } = spec;
  const currency = ctx.currency ?? "ILS";
  switch (change.kind) {
    case "pause":
      return ctx.graph.post(`/${target.id}`, { status: "PAUSED" });
    case "resume":
      return ctx.graph.post(`/${target.id}`, { status: "ACTIVE" });
    case "end_date":
      return ctx.graph.post(`/${target.id}`, target.type === "campaign" ? { stop_time: change.endTime } : { end_time: change.endTime });
    case "daily_budget": {
      if (target.type === "ad") throw new Error("Budgets live on the campaign or ad set, not on a single ad");
      const now = await currentDailyBudget(ctx, target.type, target.id);
      if (now.level === "adset" && target.type === "campaign") {
        // Scale every ad set proportionally so the campaign total matches the new amount.
        const ratio = now.daily > 0 ? change.amount / now.daily : 0;
        if (!ratio) throw new Error("This campaign has no daily budget to scale");
        for (const s of now.adsets) {
          await ctx.graph.post(`/${s.id}`, { daily_budget: toMinor(s.daily * ratio, currency) });
        }
        return { ok: true };
      }
      return ctx.graph.post(`/${target.id}`, { daily_budget: toMinor(change.amount, currency) });
    }
  }
}

async function waitForContainer(ctx: MetaContext, id: string) {
  for (let i = 0; i < 40; i++) {
    const c = await ctx.graph.get<{ status_code?: string }>(`/${id}`, { fields: "status_code" });
    if (c.status_code === "FINISHED") return;
    if (c.status_code === "ERROR" || c.status_code === "EXPIRED") throw new Error("Instagram could not process the media");
    await sleep(3000);
  }
  throw new Error("Instagram is still processing the media. Try again in a minute.");
}

const sameText = (a?: string, b?: string) => !!a && !!b && a.trim().replace(/\s+/g, " ") === b.trim().replace(/\s+/g, " ");

/**
 * Publishes (or schedules) to the Facebook page and/or Instagram. Each channel's post id is saved as soon
 * as it exists; on a retry a channel that already has an id is skipped, and if an earlier attempt may have
 * published without saving, recent posts are checked for the same text before publishing again.
 */
export async function publishPost(ctx: MetaContext, spec: PostSpec, cp: Checkpoint, isRetry: boolean) {
  const when = spec.scheduleAt ? Math.floor(new Date(spec.scheduleAt).getTime() / 1000) : undefined;
  const since = Date.now() - 6 * 3600 * 1000;

  if (spec.channels.includes("facebook") && !cp.data.facebook) {
    if (!ctx.pageId) throw new Error("No Facebook page connected");
    const page = await ctx.graph.forPage(ctx.pageId);
    if (isRetry && !when) {
      const recent = await page.get<{ data: { id: string; message?: string; created_time: string }[] }>(`/${ctx.pageId}/posts`, { fields: "id,message,created_time", limit: 15 });
      const hit = recent.data?.find((p) => sameText(p.message, spec.text) && new Date(p.created_time).getTime() > since);
      if (hit) await cp.save({ facebook: hit.id });
    }
    if (!cp.data.facebook) {
      const schedule = when ? { published: false, scheduled_publish_time: when } : {};
      const first = spec.media[0];
      let id: string;
      if (!first) {
        id = (await page.post<{ id: string }>(`/${ctx.pageId}/feed`, { message: spec.text, link: spec.link, ...schedule })).id;
      } else if (first.type === "video") {
        id = (await page.post<{ id: string }>(`/${ctx.pageId}/videos`, { file_url: first.url, description: spec.text, ...schedule })).id;
      } else if (spec.media.length === 1) {
        id = (await page.post<{ id: string }>(`/${ctx.pageId}/photos`, { url: first.url, message: spec.text, ...schedule })).id;
      } else {
        const ids: string[] = cp.data.fbPhotos ?? [];
        for (const m of spec.media.filter((m) => m.type === "image").slice(ids.length)) {
          ids.push((await page.post<{ id: string }>(`/${ctx.pageId}/photos`, { url: m.url, published: false })).id);
          await cp.save({ fbPhotos: ids });
        }
        id = (
          await page.post<{ id: string }>(`/${ctx.pageId}/feed`, {
            message: spec.text,
            attached_media: ids.map((media_fbid) => ({ media_fbid })),
            ...schedule,
          })
        ).id;
      }
      await cp.save({ facebook: id });
    }
  }

  if (spec.channels.includes("instagram") && !cp.data.instagram) {
    if (!ctx.igUserId) throw new Error("No Instagram account connected");
    if (!spec.media.length) throw new Error("Instagram posts need an image or a video");
    if (when) throw new Error("Instagram posts cannot be scheduled through Meta; choose 'publish now' or Facebook only.");
    const ig = ctx.igUserId;
    if (isRetry) {
      const recent = await ctx.graph.get<{ data: { id: string; caption?: string; timestamp: string }[] }>(`/${ig}/media`, { fields: "id,caption,timestamp", limit: 15 });
      const hit = recent.data?.find((p) => sameText(p.caption, spec.text) && new Date(p.timestamp).getTime() > since);
      if (hit) await cp.save({ instagram: hit.id });
    }
    if (!cp.data.instagram) {
      let creationId: string | undefined = cp.data.igContainer;
      if (!creationId) {
        if (spec.media.length === 1) {
          const m = spec.media[0];
          creationId = (
            await ctx.graph.post<{ id: string }>(
              `/${ig}/media`,
              m.type === "image" ? { image_url: m.url, caption: spec.text } : { media_type: "REELS", video_url: m.url, caption: spec.text },
            )
          ).id;
        } else {
          const children: string[] = [];
          for (const m of spec.media) {
            const c = await ctx.graph.post<{ id: string }>(
              `/${ig}/media`,
              m.type === "image" ? { image_url: m.url, is_carousel_item: true } : { media_type: "VIDEO", video_url: m.url, is_carousel_item: true },
            );
            await waitForContainer(ctx, c.id);
            children.push(c.id);
          }
          creationId = (await ctx.graph.post<{ id: string }>(`/${ig}/media`, { media_type: "CAROUSEL", children: children.join(","), caption: spec.text })).id;
        }
        await cp.save({ igContainer: creationId });
      }
      await waitForContainer(ctx, creationId);
      const r = await ctx.graph.post<{ id: string }>(`/${ig}/media_publish`, { creation_id: creationId });
      await cp.save({ instagram: r.id });
    }
  }
  return { facebook: cp.data.facebook, instagram: cp.data.instagram };
}

export function describeError(err: unknown): string {
  if (err instanceof MetaError) return err.describe();
  if (err instanceof Error) return err.message;
  return String(err);
}
