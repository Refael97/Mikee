import "server-only";
import { socialImageUrl, type Target } from "./images";
import { adsetsOf, type AdsetAddSpec, type AdsetCopySpec, type Audience, type CampaignSpec, type ChangeSpec, LEAD_CTAS, type PostSpec } from "../specs";
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

/**
 * A video ad needs a thumbnail hosted by us or by Meta's ad images, not a CDN link (docs: ad-creative-video-
 * data). We take the frame Meta picked and store it as an ad image.
 */
async function videoThumbnailHash(ctx: MetaContext, picture?: string): Promise<string> {
  if (!picture) throw new Error("Meta returned no thumbnail for the video");
  const account = requireAdAccount(ctx);
  const res = await safeFetch(picture, { maxBytes: 10 * 1024 * 1024, timeoutMs: 30_000 });
  if (!res.ok) throw new Error(`Could not read the video thumbnail (HTTP ${res.status})`);
  const bytes = Buffer.from(await res.bytes()).toString("base64");
  const r = await ctx.graph.post<{ images: Record<string, { hash: string }> }>(`/${account}/adimages`, { bytes });
  const first = Object.values(r.images ?? {})[0];
  if (!first?.hash) throw new Error("Thumbnail upload returned no hash");
  return first.hash;
}

/** An image already in this ad account, by hash. Refuses a hash that is not in the business's own account. */
async function existingImage(ctx: MetaContext, hash: string): Promise<string> {
  const account = requireAdAccount(ctx);
  const r = await ctx.graph.get<{ data?: { hash: string }[] }>(`/${account}/adimages`, { hashes: JSON.stringify([hash]), fields: "hash" });
  if (!r.data?.some((i) => i.hash === hash)) throw new Error("That image is not in this business's ad account");
  return hash;
}

/** A video already in Meta: ready to use, with the frame Meta picked for the thumbnail. */
async function existingVideo(ctx: MetaContext, id: string): Promise<{ id: string; thumbnail?: string }> {
  const v = await ctx.graph.get<any>(`/${id}`, { fields: "status,picture" });
  if (v.status?.video_status && v.status.video_status !== "ready") throw new Error("The video is not ready at Meta");
  return { id, thumbnail: v.picture };
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

export function targeting(spec: CampaignSpec) {
  return targetingFor(spec.audience);
}

/** Meta targeting for one audience. */
export function targetingFor(a: Audience) {
  const t: Record<string, unknown> = {
    geo_locations: a.cities?.length ? places(a.cities) : { countries: a.countries },
    targeting_automation: { advantage_audience: a.advantage ? 1 : 0 },
  };
  // With Advantage+ audience, age_min may be 18-25 and age_max is fixed at 65; the wished-for range goes in
  // age_range as a suggestion (docs: targeting-expansion/advantage-audience).
  const min = a.ageMin ?? 18;
  const max = a.ageMax ?? 65;
  if (a.advantage) {
    t.age_min = Math.min(min, 25);
    t.age_max = 65;
    if (min !== 18 || max !== 65) t.age_range = [min, max];
  } else {
    t.age_min = min;
    t.age_max = max;
  }
  if (a.genders !== "all") t.genders = [a.genders === "women" ? 2 : 1];
  if (a.interests?.length) t.flexible_spec = [{ interests: a.interests }];
  if (a.customAudienceIds?.length) t.custom_audiences = a.customAudienceIds.map((id) => ({ id }));
  if (a.excludedCustomAudienceIds?.length) t.excluded_custom_audiences = a.excludedCustomAudienceIds.map((id) => ({ id }));
  return t;
}

/**
 * Cities take a radius of 17-80 km; with several cities a radius can be refused (code 100/1815946), so it is
 * sent only for a single city. Regions go under regions, not cities (docs: basic-targeting).
 */
function places(list: NonNullable<Audience["cities"]>) {
  const cities = list.filter((c) => c.type !== "region");
  const regions = list.filter((c) => c.type === "region");
  const out: Record<string, unknown> = {};
  if (cities.length === 1) out.cities = [{ key: cities[0].key, radius: Math.min(80, Math.max(17, cities[0].radiusKm ?? 17)), distance_unit: "kilometer" }];
  else if (cities.length) out.cities = cities.map((c) => ({ key: c.key }));
  if (regions.length) out.regions = regions.map((r) => ({ key: r.key }));
  return out;
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
      return { optimization_goal: "POST_ENGAGEMENT", destination_type: "ON_POST" };
    case "awareness":
      return { optimization_goal: "REACH", promoted_object: { page_id: ctx.pageId } };
  }
}

async function createCreative(ctx: MetaContext, leadFormId: string | undefined, ad: CampaignSpec["ads"][number], name: string) {
  const account = requireAdAccount(ctx);
  if (!ctx.pageId) throw new Error("No Facebook page connected");
  // Instant-form ads: the link must be https://fb.me/ and only a few buttons are allowed (docs: lead-ads/create).
  const lead = !!leadFormId;
  const link = lead ? "https://fb.me/" : ad.link;
  const cta = lead && !(LEAD_CTAS as readonly string[]).includes(ad.cta) ? "LEARN_MORE" : ad.cta;
  const ctaValue: Record<string, string> = lead ? { link, lead_gen_form_id: leadFormId! } : { link };
  const call_to_action = { type: cta, value: ctaValue };
  const base: Record<string, unknown> = { page_id: ctx.pageId };
  if (ctx.igUserId) base.instagram_user_id = ctx.igUserId;

  if (ad.media.type === "image") {
    const image_hash = ad.media.metaImageHash ? await existingImage(ctx, ad.media.metaImageHash) : await uploadImage(ctx, ad.media.url);
    base.link_data = {
      link,
      message: ad.primaryText,
      name: ad.headline,
      description: ad.description,
      image_hash,
      call_to_action,
    };
  } else {
    const video = ad.media.metaVideoId ? await existingVideo(ctx, ad.media.metaVideoId) : await uploadVideo(ctx, ad.media.url);
    base.video_data = {
      video_id: video.id,
      message: ad.primaryText,
      title: ad.headline,
      link_description: ad.description,
      image_hash: await videoThumbnailHash(ctx, video.thumbnail),
      call_to_action,
    };
  }
  const { id } = await ctx.graph.post<{ id: string }>(`/${account}/adcreatives`, { name, object_story_spec: base });
  return id;
}

export type LaunchResult = {
  campaignId: string;
  adsetId: string;
  adIds: string[];
  /** Every ad set with its ads (a new campaign can have several). */
  adsets?: { adsetId: string; adIds: string[] }[];
  /** The advertiser and payer identities the ad set carries, as read back from Meta. */
  identities?: Record<string, string> | null;
};

/** The advertiser and payer sent with an ad set (top level, outside targeting). */
export type AdsetIdentities = { universal_beneficiary: string; universal_payer: string };

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

/** The checkpoint slice of one ad set: its id and its ads' ids. */
type AdsetSlot = { adsetId?: string | null; ads?: Record<string, string> };

/** Finds an ad set this build created before its id was saved. The first ad set's tag is part of the others' names. */
async function findAdset(ctx: MetaContext, campaignId: string, tag: string, first: boolean): Promise<string | undefined> {
  const found = await ctx.graph.get<{ data: { id: string; name: string }[] }>(`/${campaignId}/adsets`, {
    fields: "id,name",
    filtering: [{ field: "name", operator: "CONTAIN", value: tag }],
    limit: 10,
  });
  return found.data?.find((a) => !first || !a.name.includes(" · סדרה "))?.id;
}

/**
 * Builds one ad set and its ads inside a campaign, all PAUSED, saving each id as it goes. A retry resumes from
 * the saved ids or finds what an earlier attempt created by its tag, so nothing is created twice.
 */
async function buildAdsetIn(
  ctx: MetaContext,
  o: {
    campaignId: string;
    name: string;
    tag: string;
    first: boolean;
    dailyBudget?: number;
    audience: Audience;
    ads: CampaignSpec["ads"];
    optimization: Record<string, unknown>;
    leadFormId?: string;
    startTime?: string;
    endTime?: string;
    identities?: AdsetIdentities;
  },
  saved: AdsetSlot,
  save: (patch: AdsetSlot) => Promise<void>,
): Promise<{ adsetId: string; adIds: string[] }> {
  const account = requireAdAccount(ctx);
  const currency = ctx.currency ?? "ILS";
  let adsetId: string | undefined = saved.adsetId ?? undefined;
  if (!(await exists(ctx, adsetId))) adsetId = await findAdset(ctx, o.campaignId, o.tag, o.first);
  if (!adsetId) {
    const adset = {
      name: o.name,
      campaign_id: o.campaignId,
      ...(o.dailyBudget != null ? { daily_budget: toMinor(o.dailyBudget, currency) } : {}),
      billing_event: "IMPRESSIONS",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      targeting: targetingFor(o.audience),
      start_time: o.startTime,
      end_time: o.endTime,
      status: "PAUSED",
      ...o.optimization,
      // Who Meta lists as advertiser and payer, when the client chose them (never guessed, no category added).
      ...(o.identities ? { regional_regulation_identities: o.identities } : {}),
    } as Record<string, unknown>;
    try {
      ({ id: adsetId } = await ctx.graph.post<{ id: string }>(`/${account}/adsets`, adset));
    } catch (err) {
      // Keep exactly what was sent, so a location or identity rule can be matched to the request.
      if (err instanceof MetaError) {
        const identity = Object.fromEntries(Object.entries(adset).filter(([k]) => /dsa_|regional_regulat/.test(k)));
        err.request = { targeting: adset.targeting, advertiser_identity_fields: Object.keys(identity).length ? identity : "none sent" };
      }
      throw err;
    }
  }
  if (adsetId !== saved.adsetId) await save({ adsetId });

  const ads: Record<string, string> = { ...(saved.ads ?? {}) };
  for (const [i, ad] of o.ads.entries()) {
    const adName = `${o.name} · ${i + 1}`;
    if (await exists(ctx, ads[i])) continue;
    const found = await findTagged(ctx, `/${adsetId}/ads`, `${o.tag} · ${i + 1}`);
    if (found) {
      ads[i] = found;
    } else {
      const creativeId = await createCreative(ctx, o.leadFormId, ad, adName);
      const { id } = await ctx.graph.post<{ id: string }>(`/${account}/ads`, {
        name: adName,
        adset_id: adsetId,
        creative: { creative_id: creativeId },
        status: "PAUSED",
      });
      ads[i] = id;
    }
    await save({ adsetId, ads });
  }
  return { adsetId: adsetId!, adIds: o.ads.map((_, i) => ads[i]).filter(Boolean) };
}

/**
 * Builds campaign -> ad sets -> creatives -> ads, every object PAUSED, saving each id as it goes. It never
 * switches anything on: going live is a separate card the client approves after the build was read back.
 * A retry (after a failure or a restart) resumes from the saved ids or from objects tagged with the
 * proposal's tag, so it never creates a second campaign or a second copy of an ad set or an ad.
 */
export async function buildCampaign(ctx: MetaContext, spec: CampaignSpec, tag: string, cp: Checkpoint, identities?: AdsetIdentities): Promise<LaunchResult> {
  const account = requireAdAccount(ctx);
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
  if (campaignId !== cp.data.campaignId) await cp.save({ campaignId, adsetId: null, ads: {}, more: {} });

  const opt = optimization(ctx, spec);
  const built: { adsetId: string; adIds: string[] }[] = [];
  for (const [i, set] of adsetsOf(spec).entries()) {
    // The first ad set keeps the original checkpoint keys (adsetId, ads); the others live under "more".
    const saved: AdsetSlot = i === 0 ? { adsetId: cp.data.adsetId, ads: cp.data.ads } : (cp.data.more?.[i] ?? {});
    const save = (patch: AdsetSlot) =>
      i === 0 ? cp.save(patch) : cp.save({ more: { ...(cp.data.more ?? {}), [i]: { ...(cp.data.more?.[i] ?? {}), ...patch } } });
    built.push(
      await buildAdsetIn(
        ctx,
        {
          campaignId: campaignId!,
          name: i === 0 ? name : `${name} · סדרה ${i + 1}`,
          tag: i === 0 ? tag : `${tag} · סדרה ${i + 1}`,
          first: i === 0,
          dailyBudget: set.dailyBudget,
          audience: set.audience,
          ads: set.ads,
          optimization: opt,
          leadFormId: spec.leadFormId,
          startTime: spec.startTime,
          endTime: spec.endTime,
          identities,
        },
        saved,
        save,
      ),
    );
  }

  // Read back what Meta stored, so the card reports the identities the ad set really carries.
  const stored = await ctx.graph
    .get<{ regional_regulation_identities?: Record<string, string> }>(`/${built[0].adsetId}`, { fields: "regional_regulation_identities" })
    .then((r) => r.regional_regulation_identities ?? null)
    .catch(() => undefined);
  return { campaignId: campaignId!, adsetId: built[0].adsetId, adIds: built.flatMap((b) => b.adIds), adsets: built, identities: stored };
}

/** An object that is not this business's, or cannot be used for this work. Nothing is created. */
export class OwnershipProblem extends Error {
  name = "OwnershipProblem";
}

type CampaignNode = { id: string; name?: string; account_id?: string; objective?: string; daily_budget?: string; lifetime_budget?: string; effective_status?: string; status?: string };
type AdsetNode = CampaignNode & { campaign_id?: string; optimization_goal?: string; billing_event?: string; bid_strategy?: string; promoted_object?: unknown; destination_type?: string };

const ownedBy = (ctx: MetaContext, node: { account_id?: string }) => String(node.account_id ?? "") === requireAdAccount(ctx).replace(/^act_/, "");

async function readNode<T>(ctx: MetaContext, id: string, fields: string, what: string): Promise<T> {
  try {
    return await ctx.graph.get<T>(`/${id}`, { fields });
  } catch (e) {
    if (e instanceof MetaError && e.code === 100) throw new OwnershipProblem(`${what} ${id} was not found in this business's ad account.`);
    throw e;
  }
}

/** A campaign of this business's ad account, with what matters for adding to it. */
export async function ownedCampaign(ctx: MetaContext, id: string) {
  const c = await readNode<CampaignNode>(ctx, id, "id,name,account_id,objective,daily_budget,lifetime_budget,status,effective_status", "Campaign");
  if (!ownedBy(ctx, c)) throw new OwnershipProblem(`Campaign ${id} is not in this business's ad account.`);
  if (c.effective_status === "DELETED" || c.effective_status === "ARCHIVED") throw new OwnershipProblem(`Campaign ${id} was deleted or archived.`);
  return { id: c.id, name: c.name ?? c.id, objective: c.objective ?? "", campaignBudget: !!(Number(c.daily_budget) || Number(c.lifetime_budget)), status: c.status ?? c.effective_status ?? "" };
}

/** An ad set of this business's ad account. */
export async function ownedAdset(ctx: MetaContext, id: string) {
  const a = await readNode<AdsetNode>(ctx, id, "id,name,account_id,campaign_id,daily_budget,status,effective_status", "Ad set");
  if (!ownedBy(ctx, a)) throw new OwnershipProblem(`Ad set ${id} is not in this business's ad account.`);
  if (a.effective_status === "DELETED" || a.effective_status === "ARCHIVED") throw new OwnershipProblem(`Ad set ${id} was deleted or archived.`);
  if (!a.campaign_id) throw new OwnershipProblem(`Could not read the campaign of ad set ${id}.`);
  return { id: a.id, name: a.name ?? a.id, campaignId: a.campaign_id, dailyBudget: a.daily_budget != null ? toMajor(a.daily_budget, ctx.currency ?? "ILS") : undefined };
}

/** Checks that an ad set may be copied into a campaign: both this business's, the same kind of campaign. */
export async function copyPlan(ctx: MetaContext, sourceAdsetId: string, targetCampaignId?: string) {
  const source = await ownedAdset(ctx, sourceAdsetId);
  const targetId = targetCampaignId ?? source.campaignId;
  const target = await ownedCampaign(ctx, targetId);
  if (targetId !== source.campaignId) {
    const from = await ownedCampaign(ctx, source.campaignId);
    if (from.objective !== target.objective) throw new OwnershipProblem(`The target campaign has a different goal (${target.objective}) from the ad set's campaign (${from.objective}).`);
    if (from.campaignBudget !== target.campaignBudget) throw new OwnershipProblem("One campaign sets the budget for its ad sets and the other does not, so the ad set cannot move between them as is.");
  }
  const ads = await ctx.graph.get<{ data: { id: string }[] }>(`/${source.id}/ads`, { fields: "id", limit: 50 });
  return { source, target, adCount: ads.data?.length ?? 0 };
}

export type CopyResult = { campaignId: string; adsetId: string; adIds: string[]; adMap: Record<string, string>; mismatches: string[] };

/** Thrown when an earlier copy request may have reached Meta and the result is not clear: nothing is sent again. */
export class CopyUncertain extends Error {
  name = "CopyUncertain";
}

/**
 * Copies an ad set (with its ads when asked) PAUSED with Meta's /copies, then applies the requested changes to
 * the paused copy and reads it back. The copy's id and its ad mapping are saved the moment Meta answers. If a
 * request was sent but its answer was lost, the next attempt does not send it again blindly: it looks for the
 * copy in the target campaign (an ad set that was not there before, named after the source) and adopts it.
 */
export async function copyAdset(ctx: MetaContext, spec: AdsetCopySpec, cp: Checkpoint): Promise<CopyResult> {
  const plan = await copyPlan(ctx, spec.sourceAdsetId, spec.targetCampaignId);
  const targetId = plan.target.id;
  let copied: string | undefined = cp.data.copiedAdsetId;
  if (copied && !(await exists(ctx, copied))) copied = undefined;

  if (!copied && cp.data.copyStartedAt) {
    const before = new Set<string>(cp.data.before ?? []);
    const now = await ctx.graph.get<{ data: { id: string; name: string }[] }>(`/${targetId}/adsets`, { fields: "id,name", limit: 200 });
    // Every ad set that appeared since the request: the copy is one of them, if Meta made it.
    const appeared = (now.data ?? []).filter((a) => !before.has(a.id) && a.id !== plan.source.id);
    const named = appeared.filter((a) => a.name.includes(plan.source.name));
    if (named.length === 1) {
      copied = named[0].id;
      await cp.save({ copiedAdsetId: copied, adMap: {} });
    } else if (appeared.length) {
      // Something new is there but it cannot be told apart for sure: never copy again blindly.
      throw new CopyUncertain(`New ad sets appeared in the target campaign since the copy request (${appeared.map((a) => a.id).join(", ")}) and the copy cannot be identified for sure; not copying again. Check them in Ads Manager.`);
    }
    // Nothing appeared: the earlier request made nothing, so it is safe to send it now.
  }

  if (!copied) {
    const existing = await ctx.graph.get<{ data: { id: string }[] }>(`/${targetId}/adsets`, { fields: "id", limit: 200 });
    // Saved before sending, so a lost answer can be reconciled instead of copying twice.
    await cp.save({ copyStartedAt: new Date().toISOString(), before: (existing.data ?? []).map((a) => a.id) });
    const r = await ctx.graph.post<{ copied_adset_id: string; ad_object_ids?: { ad_object_type: string; source_id: string; copied_id: string }[] }>(`/${plan.source.id}/copies`, {
      campaign_id: targetId,
      deep_copy: spec.includeAds,
      status_option: "PAUSED",
    });
    copied = r.copied_adset_id;
    const adMap = Object.fromEntries((r.ad_object_ids ?? []).filter((o) => o.ad_object_type === "ad").map((o) => [o.source_id, o.copied_id]));
    await cp.save({ copiedAdsetId: copied, adMap });
  }

  // Changes go to the paused copy, after the copy.
  const c = spec.changes;
  if (c && !cp.data.changed) {
    const patch: Record<string, unknown> = {};
    if (c.name) patch.name = c.name;
    if (c.audience) patch.targeting = targetingFor(c.audience);
    if (c.dailyBudget != null) patch.daily_budget = toMinor(c.dailyBudget, ctx.currency ?? "ILS");
    if (Object.keys(patch).length) await ctx.graph.post(`/${copied}`, patch);
    await cp.save({ changed: true });
  }

  // Read back: the copy is in the target campaign, paused, with its ads.
  const mismatches: string[] = [];
  const node = await ctx.graph.get<{ campaign_id?: string; status?: string }>(`/${copied}`, { fields: "campaign_id,status" });
  if (node.campaign_id !== targetId) mismatches.push(`the copy is in campaign ${node.campaign_id}, expected ${targetId}`);
  if (node.status && node.status !== "PAUSED") mismatches.push(`the copy's status is ${node.status}, expected PAUSED`);
  const ads = spec.includeAds ? ((await ctx.graph.get<{ data: { id: string; status?: string }[] }>(`/${copied}/ads`, { fields: "id,status", limit: 50 })).data ?? []) : [];
  if (spec.includeAds && spec.sourceAdCount != null && ads.length !== spec.sourceAdCount) mismatches.push(`${ads.length} ads were copied, the source has ${spec.sourceAdCount}`);
  for (const a of ads) if (a.status && a.status !== "PAUSED") mismatches.push(`ad ${a.id} is ${a.status}, expected PAUSED`);
  return { campaignId: targetId, adsetId: copied!, adIds: ads.map((a) => a.id), adMap: cp.data.adMap ?? {}, mismatches };
}

const GOAL_OF: Record<string, CampaignSpec["goal"]> = Object.fromEntries(Object.entries(OBJECTIVE).map(([g, o]) => [o, g as CampaignSpec["goal"]]));

/**
 * A new ad set, with its ads, inside an existing campaign of this business, PAUSED. It is optimized like the
 * campaign's other ad sets (or by the campaign's goal when it has none), and carries no budget of its own
 * when the campaign holds the budget.
 */
export async function addAdset(ctx: MetaContext, spec: AdsetAddSpec, tag: string, cp: Checkpoint, identities?: AdsetIdentities) {
  const campaign = await ownedCampaign(ctx, spec.campaignId);
  const template = (
    await ctx.graph.get<{ data: AdsetNode[] }>(`/${campaign.id}/adsets`, { fields: "optimization_goal,billing_event,bid_strategy,promoted_object,destination_type", limit: 1 })
  ).data?.[0];
  const opt: Record<string, unknown> = template?.optimization_goal
    ? Object.fromEntries(Object.entries({ optimization_goal: template.optimization_goal, promoted_object: template.promoted_object, destination_type: template.destination_type }).filter(([, v]) => v != null))
    : optimization(ctx, { goal: GOAL_OF[campaign.objective] ?? "traffic", leadFormId: spec.leadFormId } as CampaignSpec);
  if (opt.destination_type === "ON_AD" && !spec.leadFormId) throw new OwnershipProblem("This campaign's ad sets use an instant form: the new ad set needs leadFormId.");
  if (!campaign.campaignBudget && spec.adset.dailyBudget == null) throw new OwnershipProblem("This campaign has no campaign budget: the new ad set needs its own daily budget.");
  const name = `Mikee · ${spec.title.replace(/[^\p{L}\p{N} ]/gu, "").trim()} · ${tag}`;
  const r = await buildAdsetIn(
    ctx,
    {
      campaignId: campaign.id,
      name,
      tag,
      first: true,
      dailyBudget: campaign.campaignBudget ? undefined : spec.adset.dailyBudget,
      audience: spec.adset.audience,
      ads: spec.adset.ads,
      optimization: opt,
      leadFormId: spec.leadFormId,
      startTime: spec.startTime,
      endTime: spec.endTime,
      identities,
    },
    { adsetId: cp.data.adsetId, ads: cp.data.ads },
    (patch) => cp.save(patch),
  );
  const mismatches: string[] = [];
  const node = await ctx.graph.get<{ campaign_id?: string; status?: string }>(`/${r.adsetId}`, { fields: "campaign_id,status" });
  if (node.campaign_id !== campaign.id) mismatches.push(`the ad set is in campaign ${node.campaign_id}, expected ${campaign.id}`);
  if (node.status && node.status !== "PAUSED") mismatches.push(`the ad set's status is ${node.status}, expected PAUSED`);
  if (r.adIds.length !== spec.adset.ads.length) mismatches.push(`${r.adIds.length} ads exist, ${spec.adset.ads.length} were approved`);
  return { campaignId: campaign.id, ...r, mismatches };
}

/** Removes only the ad set this card created (never the campaign it went into), when a failed card is cancelled. */
export async function cleanupAdset(ctx: MetaContext, cp: Checkpoint) {
  const id = cp.data.copiedAdsetId ?? cp.data.adsetId;
  if (id) {
    await ctx.graph.delete(`/${id}`).catch(() => undefined);
    await cp.save({ copiedAdsetId: null, adsetId: null, ads: {} });
  }
}

export type BuildState =
  | { checked: true; campaignId?: string; adsetId?: string; adIds: string[] }
  | { checked: false; error: string; campaignId?: string; adsetId?: string; adIds: string[] };

/**
 * After a failed build: what really exists at Meta now, looked up by the saved ids and by the build's tag
 * (an object can exist without a saved id when an answer was lost). A lookup that fails says so, so a failed
 * check is never reported as "nothing was built".
 */
export async function whatWasBuilt(ctx: MetaContext, tag: string, cp: Checkpoint): Promise<BuildState> {
  const saved = { campaignId: cp.data.campaignId as string | undefined, adsetId: (cp.data.adsetId ?? undefined) as string | undefined, adIds: Object.values((cp.data.ads ?? {}) as Record<string, string>) };
  try {
    const account = requireAdAccount(ctx);
    const live = async (id?: string) => {
      if (!id) return undefined;
      const n = await ctx.graph.get<{ id: string; effective_status?: string }>(`/${id}`, { fields: "id,effective_status" }).catch((e) => {
        // A deleted or unknown object is gone; any other failure means we do not know.
        if (e instanceof MetaError && e.code === 100) return null;
        throw e;
      });
      return n && n.effective_status !== "DELETED" && n.effective_status !== "ARCHIVED" ? n.id : undefined;
    };
    const tagged = async (edge: string, t: string) =>
      (await ctx.graph.get<{ data: { id: string }[] }>(edge, { fields: "id,name", filtering: [{ field: "name", operator: "CONTAIN", value: t }], limit: 50 })).data?.map((x) => x.id) ?? [];
    const campaignId = (await live(saved.campaignId)) ?? (await tagged(`/${account}/campaigns`, tag))[0];
    const adsetId = campaignId ? ((await live(saved.adsetId)) ?? (await tagged(`/${campaignId}/adsets`, tag))[0]) : undefined;
    const adIds = adsetId ? await tagged(`/${adsetId}/ads`, tag) : [];
    return { checked: true, campaignId, adsetId, adIds };
  } catch (err) {
    return { checked: false, error: describeError(err), ...saved };
  }
}

/** One line for the failed card: exactly what exists at Meta, or that it could not be checked. */
export function describeBuild(b: BuildState): string {
  const parts = [b.campaignId && `campaign ${b.campaignId}`, b.adsetId && `ad set ${b.adsetId}`, b.adIds.length && `${b.adIds.length} ads (${b.adIds.join(", ")})`].filter(Boolean);
  if (!b.checked) return `Could not check what exists at Meta (${b.error}).${parts.length ? ` Saved before the failure: ${parts.join(", ")}.` : ""}`;
  return parts.length ? `At Meta now, all paused: ${parts.join(", ")}. A retry continues from these and creates nothing twice.` : "Checked at Meta: nothing from this card exists there.";
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
  const sets = adsetsOf(spec);
  const built = ids.adsets ?? [{ adsetId: ids.adsetId, adIds: ids.adIds }];
  if (built.length !== sets.length) mismatches.push(`${built.length} ad sets exist, ${sets.length} were approved`);
  for (const [i, b] of built.entries()) {
    const adset = await ctx.graph.get<{ daily_budget?: string; end_time?: string; status?: string }>(`/${b.adsetId}`, { fields: "daily_budget,end_time,status" });
    const plan = sets[i];
    if (plan && adset.daily_budget != null && Number(adset.daily_budget) !== toMinor(plan.dailyBudget, currency)) {
      mismatches.push(`daily budget of ad set ${i + 1} is ${toMajor(adset.daily_budget, currency)}, approved ${plan.dailyBudget}`);
    }
    if (spec.endTime && adset.end_time && Math.abs(new Date(adset.end_time).getTime() - new Date(spec.endTime).getTime()) > 60_000) {
      mismatches.push(`end date is ${adset.end_time}, approved ${spec.endTime}`);
    }
  }
  const approvedAds = sets.reduce((n, x) => n + x.ads.length, 0);
  if (ids.adIds.length !== approvedAds) mismatches.push(`${ids.adIds.length} ads exist, ${approvedAds} were approved`);
  const { review, blockers: found } = await reviewAds(ctx, ids.adIds);
  blockers.push(...found);
  return { ok: mismatches.length === 0, mismatches, review, blockers };
}

/** Meta's review state of built ads, in plain words, with the reason for any rejected ad. */
export async function reviewAds(ctx: MetaContext, adIds: string[]): Promise<{ review: string; blockers: string[] }> {
  const blockers: string[] = [];
  const states: string[] = [];
  for (const id of adIds) {
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
    (Object.entries(counts)
      .map(([k, n]) => `${n} ${n === 1 ? "מודעה" : "מודעות"} ${k}`)
      .join(", ") || "אין מודעות בסדרה") + ". מטא בודקת כל מודעה לפני שהיא מוצגת, ואישור שלה לא מובטח.";
  return { review, blockers };
}

/**
 * Switches built objects on: the ads, then the ad sets, then the campaign. With scope "adsets" (an ad set added
 * to or copied into an existing campaign) the campaign itself is left as it is. Safe to run twice.
 */
export async function activateCampaign(ctx: MetaContext, ids: { campaignId: string; adsetId: string; adIds: string[]; adsetIds?: string[]; scope?: "campaign" | "adsets" }) {
  for (const id of ids.adIds) await ctx.graph.post(`/${id}`, { status: "ACTIVE" });
  for (const id of ids.adsetIds?.length ? ids.adsetIds : [ids.adsetId]) await ctx.graph.post(`/${id}`, { status: "ACTIVE" });
  if (ids.scope !== "adsets") await ctx.graph.post(`/${ids.campaignId}`, { status: "ACTIVE" });
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
      if (target.type === "adset") {
        // In a campaign-budget campaign the ad set has no budget of its own (1885621): change the campaign's.
        const set = await ctx.graph.get<{ daily_budget?: string; campaign?: { id: string; daily_budget?: string } }>(`/${target.id}`, { fields: "daily_budget,campaign{id,daily_budget}" });
        if (!set.daily_budget && set.campaign?.daily_budget) return ctx.graph.post(`/${set.campaign.id}`, { daily_budget: toMinor(change.amount, currency) });
      }
      return ctx.graph.post(`/${target.id}`, { daily_budget: toMinor(change.amount, currency) });
    }
  }
}

/**
 * Waits for an Instagram container. Meta asks to check about once a minute for no more than five minutes;
 * we check every 10 seconds within the same five minutes (docs: ig-container). PUBLISHED means an earlier
 * attempt already published it. On ERROR the status field carries Meta's reason.
 */
async function waitForContainer(ctx: MetaContext, id: string): Promise<"FINISHED" | "PUBLISHED"> {
  const rounds = Number(process.env.MIKEE_IG_POLL_ROUNDS ?? 30);
  for (let i = 0; i < rounds; i++) {
    const c = await ctx.graph.get<{ status_code?: string; status?: string }>(`/${id}`, { fields: "status_code,status" });
    if (c.status_code === "FINISHED" || c.status_code === "PUBLISHED") return c.status_code;
    if (c.status_code === "ERROR" || c.status_code === "EXPIRED") throw new Error(`Instagram could not process the media (${c.status_code}${c.status ? `: ${c.status}` : ""})`);
    await sleep(Number(process.env.MIKEE_IG_POLL_MS ?? 10_000));
  }
  throw new Error("Instagram is still processing the media. Retrying will wait for the same upload, not upload again.");
}

const sameText = (a?: string, b?: string) => !!a && !!b && a.trim().replace(/\s+/g, " ") === b.trim().replace(/\s+/g, " ");

/** A publishing problem a retry cannot fix (a schedule in the past, say): the client decides again. */
export class PublishProblem extends Error {}

/** Scheduled Page posts must be 10 minutes to 30 days ahead at the moment they are sent (docs: pages-api/posts). */
export function scheduleProblem(scheduleAt: string | undefined, now = Date.now()): string | null {
  if (!scheduleAt) return null;
  const t = new Date(scheduleAt).getTime();
  if (!Number.isFinite(t)) return "The scheduled time is not a valid date.";
  if (t < now + 10 * 60_000) return "The scheduled time has passed or is less than 10 minutes away. Propose a new time, or publish now.";
  if (t > now + 30 * 86400_000) return "Facebook schedules posts at most 30 days ahead.";
  return null;
}

/**
 * Publishes (or schedules) to the Facebook page and/or Instagram. Each channel's post id is saved as soon
 * as it exists; on a retry a channel that already has an id is skipped, and if an earlier attempt may have
 * published without saving, recent posts are checked for the same text before publishing again. Photos are
 * converted to what each network accepts first (see images.ts).
 */
export async function publishPost(ctx: MetaContext, spec: PostSpec, cp: Checkpoint, isRetry: boolean, workspaceId?: string) {
  const problem = scheduleProblem(spec.scheduleAt);
  if (problem) throw new PublishProblem(problem);
  const when = spec.scheduleAt ? Math.floor(new Date(spec.scheduleAt).getTime() / 1000) : undefined;
  const since = Date.now() - 6 * 3600 * 1000;

  /** The photo as this network accepts it, converted once and remembered across retries. */
  const photo = async (url: string, target: Target) => {
    if (!workspaceId || process.env.MIKEE_IMAGE_PREP === "off") return url;
    const key = `img:${target}:${url}`;
    const done = (cp.data.prepared ?? {}) as Record<string, string>;
    if (done[key]) return done[key];
    const prepared = await socialImageUrl(workspaceId, url, target);
    await cp.save({ prepared: { ...done, [key]: prepared } });
    return prepared;
  };

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
        id = (await page.post<{ id: string }>(`/${ctx.pageId}/photos`, { url: await photo(first.url, "facebook"), message: spec.text, ...schedule })).id;
      } else {
        const ids: string[] = cp.data.fbPhotos ?? [];
        for (const m of spec.media.slice(ids.length)) {
          // Photos of a scheduled post must be uploaded as temporary (docs: page/photos).
          ids.push((await page.post<{ id: string }>(`/${ctx.pageId}/photos`, { url: await photo(m.url, "facebook"), published: false, ...(when ? { temporary: true } : {}) })).id);
          await cp.save({ fbPhotos: ids });
        }
        id = (
          await page.post<{ id: string }>(`/${ctx.pageId}/feed`, {
            message: spec.text,
            attached_media: ids.map((media_fbid) => ({ media_fbid })),
            ...schedule,
            ...(when ? { unpublished_content_type: "SCHEDULED" } : {}),
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
              m.type === "image" ? { image_url: await photo(m.url, "instagram"), caption: spec.text } : { media_type: "REELS", video_url: m.url, caption: spec.text },
            )
          ).id;
        } else {
          // Children are remembered as they are made: a retry continues instead of making new containers
          // (an account may create 400 containers a day).
          const children: string[] = cp.data.igChildren ?? [];
          for (const m of spec.media.slice(children.length)) {
            const c = await ctx.graph.post<{ id: string }>(
              `/${ig}/media`,
              m.type === "image" ? { image_url: await photo(m.url, "instagram"), is_carousel_item: true } : { media_type: "VIDEO", video_url: m.url, is_carousel_item: true },
            );
            children.push(c.id);
            await cp.save({ igChildren: children });
          }
          for (const c of children) await waitForContainer(ctx, c);
          creationId = (await ctx.graph.post<{ id: string }>(`/${ig}/media`, { media_type: "CAROUSEL", children: children.join(","), caption: spec.text })).id;
        }
        await cp.save({ igContainer: creationId });
      }
      const state = await waitForContainer(ctx, creationId);
      if (state === "PUBLISHED") {
        // An earlier attempt published it; find the post instead of publishing twice.
        const recent = await ctx.graph.get<{ data: { id: string; caption?: string }[] }>(`/${ig}/media`, { fields: "id,caption", limit: 15 });
        const hit = recent.data?.find((p) => sameText(p.caption, spec.text));
        await cp.save({ instagram: hit?.id ?? creationId });
      } else {
        const r = await ctx.graph.post<{ id: string }>(`/${ig}/media_publish`, { creation_id: creationId });
        await cp.save({ instagram: r.id });
      }
    }
  }
  return { facebook: cp.data.facebook, instagram: cp.data.instagram };
}

export function describeError(err: unknown): string {
  if (err instanceof MetaError) return err.describe();
  if (err instanceof Error) return err.message;
  return String(err);
}
