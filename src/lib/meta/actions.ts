import "server-only";
import type { CampaignSpec, ChangeSpec, PostSpec } from "../specs";
import { type MetaContext, requireAdAccount, toMajor, toMinor } from "./context";
import { MetaError } from "./graph";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const OBJECTIVE: Record<CampaignSpec["goal"], string> = {
  sales: "OUTCOME_SALES",
  leads: "OUTCOME_LEADS",
  traffic: "OUTCOME_TRAFFIC",
  engagement: "OUTCOME_ENGAGEMENT",
  awareness: "OUTCOME_AWARENESS",
};

async function fetchBytes(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download media from ${url} (HTTP ${res.status})`);
  return Buffer.from(await res.arrayBuffer());
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

/**
 * Builds the whole structure (campaign -> ad set -> creatives -> ads) and switches it on last.
 * On any failure the half-built campaign is deleted, so nothing partial is left running.
 */
export async function launchCampaign(ctx: MetaContext, spec: CampaignSpec): Promise<LaunchResult> {
  const account = requireAdAccount(ctx);
  const currency = ctx.currency ?? "ILS";
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `Mikee · ${spec.title.replace(/[^\p{L}\p{N} ]/gu, "").trim()} · ${stamp}`;

  const { id: campaignId } = await ctx.graph.post<{ id: string }>(`/${account}/campaigns`, {
    name,
    objective: OBJECTIVE[spec.goal],
    status: "PAUSED",
    special_ad_categories: [],
    is_adset_budget_sharing_enabled: false,
  });

  try {
    const { id: adsetId } = await ctx.graph.post<{ id: string }>(`/${account}/adsets`, {
      name,
      campaign_id: campaignId,
      daily_budget: toMinor(spec.dailyBudget, currency),
      billing_event: "IMPRESSIONS",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      targeting: targeting(spec),
      start_time: spec.startTime,
      end_time: spec.endTime,
      status: "ACTIVE",
      ...optimization(ctx, spec),
    });

    const adIds: string[] = [];
    for (const [i, ad] of spec.ads.entries()) {
      const adName = `${name} · ${i + 1}`;
      const creativeId = await createCreative(ctx, spec, ad, adName);
      const { id } = await ctx.graph.post<{ id: string }>(`/${account}/ads`, {
        name: adName,
        adset_id: adsetId,
        creative: { creative_id: creativeId },
        status: "ACTIVE",
      });
      adIds.push(id);
    }

    await ctx.graph.post(`/${campaignId}`, { status: "ACTIVE" });
    return { campaignId, adsetId, adIds };
  } catch (err) {
    await ctx.graph.delete(`/${campaignId}`).catch(() => undefined);
    throw err;
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

/** Publishes (or schedules) to the Facebook page and/or Instagram. */
export async function publishPost(ctx: MetaContext, spec: PostSpec) {
  const out: Record<string, string> = {};
  const when = spec.scheduleAt ? Math.floor(new Date(spec.scheduleAt).getTime() / 1000) : undefined;

  if (spec.channels.includes("facebook")) {
    if (!ctx.pageId) throw new Error("No Facebook page connected");
    const page = await ctx.graph.forPage(ctx.pageId);
    const schedule = when ? { published: false, scheduled_publish_time: when } : {};
    const first = spec.media[0];
    if (!first) {
      const r = await page.post<{ id: string }>(`/${ctx.pageId}/feed`, { message: spec.text, link: spec.link, ...schedule });
      out.facebook = r.id;
    } else if (first.type === "video") {
      const r = await page.post<{ id: string }>(`/${ctx.pageId}/videos`, { file_url: first.url, description: spec.text, ...schedule });
      out.facebook = r.id;
    } else if (spec.media.length === 1) {
      const r = await page.post<{ id: string }>(`/${ctx.pageId}/photos`, { url: first.url, message: spec.text, ...schedule });
      out.facebook = r.id;
    } else {
      const ids: string[] = [];
      for (const m of spec.media.filter((m) => m.type === "image")) {
        const r = await page.post<{ id: string }>(`/${ctx.pageId}/photos`, { url: m.url, published: false });
        ids.push(r.id);
      }
      const r = await page.post<{ id: string }>(`/${ctx.pageId}/feed`, {
        message: spec.text,
        attached_media: ids.map((media_fbid) => ({ media_fbid })),
        ...schedule,
      });
      out.facebook = r.id;
    }
  }

  if (spec.channels.includes("instagram")) {
    if (!ctx.igUserId) throw new Error("No Instagram account connected");
    if (!spec.media.length) throw new Error("Instagram posts need an image or a video");
    if (when) throw new Error("Instagram scheduling is handled by Mikee's scheduler; publish now or pick Facebook only.");
    const ig = ctx.igUserId;
    let creationId: string;
    if (spec.media.length === 1) {
      const m = spec.media[0];
      const c = await ctx.graph.post<{ id: string }>(`/${ig}/media`, m.type === "image"
        ? { image_url: m.url, caption: spec.text }
        : { media_type: "REELS", video_url: m.url, caption: spec.text });
      await waitForContainer(ctx, c.id);
      creationId = c.id;
    } else {
      const children: string[] = [];
      for (const m of spec.media) {
        const c = await ctx.graph.post<{ id: string }>(`/${ig}/media`, m.type === "image"
          ? { image_url: m.url, is_carousel_item: true }
          : { media_type: "VIDEO", video_url: m.url, is_carousel_item: true });
        await waitForContainer(ctx, c.id);
        children.push(c.id);
      }
      const c = await ctx.graph.post<{ id: string }>(`/${ig}/media`, { media_type: "CAROUSEL", children: children.join(","), caption: spec.text });
      await waitForContainer(ctx, c.id);
      creationId = c.id;
    }
    const r = await ctx.graph.post<{ id: string }>(`/${ig}/media_publish`, { creation_id: creationId });
    out.instagram = r.id;
  }
  return out;
}

export function describeError(err: unknown): string {
  if (err instanceof MetaError) return err.describe();
  if (err instanceof Error) return err.message;
  return String(err);
}
