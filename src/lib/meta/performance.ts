import "server-only";
import { type MetaContext, requireAdAccount, toMajor } from "./context";

export type Goal = "sales" | "leads" | "traffic" | "engagement" | "awareness" | "app" | "other";

const GOAL_BY_OBJECTIVE: Record<string, Goal> = {
  OUTCOME_SALES: "sales",
  CONVERSIONS: "sales",
  PRODUCT_CATALOG_SALES: "sales",
  OUTCOME_LEADS: "leads",
  LEAD_GENERATION: "leads",
  OUTCOME_TRAFFIC: "traffic",
  LINK_CLICKS: "traffic",
  OUTCOME_ENGAGEMENT: "engagement",
  POST_ENGAGEMENT: "engagement",
  OUTCOME_AWARENESS: "awareness",
  REACH: "awareness",
  BRAND_AWARENESS: "awareness",
  OUTCOME_APP_PROMOTION: "app",
};

export const GOAL_LABEL: Record<Goal, { he: string; result: string; plural: string }> = {
  sales: { he: "מכירות", result: "רכישה", plural: "רכישות" },
  leads: { he: "פניות", result: "פנייה", plural: "פניות" },
  traffic: { he: "כניסות לאתר", result: "כניסה", plural: "כניסות" },
  engagement: { he: "מעורבות", result: "תגובה", plural: "תגובות ולייקים" },
  awareness: { he: "חשיפה", result: "אדם שראה", plural: "אנשים שראו" },
  app: { he: "הורדות", result: "הורדה", plural: "הורדות" },
  other: { he: "תוצאות", result: "תוצאה", plural: "תוצאות" },
};

const RESULT_ACTIONS: Record<Goal, string[]> = {
  sales: ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"],
  leads: ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead", "onsite_conversion.messaging_conversation_started_7d"],
  traffic: ["landing_page_view", "link_click"],
  engagement: ["post_engagement"],
  awareness: [],
  app: ["mobile_app_install", "app_install"],
  other: [],
};

type RawInsights = {
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  ctr?: string;
  frequency?: string;
  actions?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
};

export type Numbers = {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  frequency: number;
  results: number;
  costPerResult: number | null;
  revenue: number;
  roas: number | null;
};

function numbers(raw: RawInsights | undefined, goal: Goal): Numbers {
  const spend = Number(raw?.spend ?? 0);
  const reach = Number(raw?.reach ?? 0);
  const pick = (list?: { action_type: string; value: string }[]) => {
    for (const type of RESULT_ACTIONS[goal]) {
      const hit = list?.find((a) => a.action_type === type);
      if (hit) return Number(hit.value);
    }
    return 0;
  };
  const results = goal === "awareness" ? reach : pick(raw?.actions);
  const revenue = goal === "sales" ? pick(raw?.action_values) : 0;
  return {
    spend,
    impressions: Number(raw?.impressions ?? 0),
    reach,
    clicks: Number(raw?.clicks ?? 0),
    ctr: Number(raw?.ctr ?? 0),
    frequency: Number(raw?.frequency ?? 0),
    results,
    costPerResult: results > 0 ? spend / results : null,
    revenue,
    roas: revenue > 0 && spend > 0 ? revenue / spend : null,
  };
}

const COUNTRY_HE: Record<string, string> = { IL: "ישראל", US: "ארה״ב", GB: "בריטניה", DE: "גרמניה", FR: "צרפת" };

function audienceSummary(t: any): string {
  if (!t) return "קהל רחב";
  const parts: string[] = [];
  const countries: string[] = t.geo_locations?.countries ?? [];
  const cities: { name: string }[] = t.geo_locations?.cities ?? [];
  if (cities.length) parts.push(cities.map((c) => c.name).join(", "));
  else if (countries.length) parts.push(countries.map((c) => COUNTRY_HE[c] ?? c).join(", "));
  const g = t.genders as number[] | undefined;
  if (g?.length === 1) parts.push(g[0] === 2 ? "נשים" : "גברים");
  if (t.age_min || t.age_max) parts.push(`גילאי ${t.age_min ?? 18}–${t.age_max && t.age_max < 65 ? t.age_max : "65+"}`);
  const interests = (t.flexible_spec ?? []).flatMap((f: any) => f.interests ?? []).map((i: any) => i.name);
  if (interests.length) parts.push(`שמתעניינים ב${interests.slice(0, 3).join(", ")}${interests.length > 3 ? " ועוד" : ""}`);
  if (t.custom_audiences?.length) parts.push("כולל קהלים שמכירים את העסק");
  if (t.targeting_automation?.advantage_audience === 1) parts.push("עם התאמה אוטומטית");
  return parts.join(" · ") || "קהל רחב";
}

export type FriendlyAd = {
  id: string;
  name: string;
  live: boolean;
  thumbnail?: string;
  text?: string;
  headline?: string;
  numbers: Numbers;
  verdict: "star" | "ok" | "weak" | "new";
};

/**
 * Whether a campaign really delivers. At Meta a campaign's own status stays ACTIVE even when every ad set
 * under it is paused or past its end date, or every ad is paused or rejected, so "ACTIVE" alone is not
 * "running": live needs an active campaign, an active ad set that has not ended, and an active ad.
 */
export type Delivery = "live" | "paused" | "ended" | "review" | "issue";

export const DELIVERY_LABEL: Record<Delivery, string> = { live: "פעיל", paused: "מושהה", ended: "הסתיים", review: "בבדיקה", issue: "יש בעיה" };

export function delivery(c: { effective_status?: string; stop_time?: string }, adsets: { effective_status?: string; end_time?: string }[], ads: { effective_status?: string }[], now = Date.now()): Delivery {
  const cs = c.effective_status ?? "";
  if (["DELETED", "ARCHIVED"].includes(cs)) return "ended";
  if (c.stop_time && Date.parse(c.stop_time) <= now) return "ended";
  if (cs === "PAUSED") return "paused";
  if (["WITH_ISSUES", "DISAPPROVED", "PENDING_BILLING_INFO"].includes(cs)) return "issue";
  if (cs === "IN_PROCESS" || cs === "PENDING_REVIEW") return "review";
  if (cs !== "ACTIVE") return "paused";
  const notEnded = (a: { end_time?: string }) => !a.end_time || Date.parse(a.end_time) > now;
  const runningSets = adsets.filter((a) => a.effective_status === "ACTIVE" && notEnded(a));
  if (!runningSets.length) return adsets.length && adsets.every((a) => !notEnded(a)) ? "ended" : "paused";
  const st = ads.map((a) => a.effective_status ?? "");
  if (st.includes("ACTIVE")) return "live";
  if (st.some((x) => x === "PENDING_REVIEW" || x === "IN_PROCESS")) return "review";
  if (st.some((x) => x === "DISAPPROVED" || x === "WITH_ISSUES")) return "issue";
  return "paused";
}

export type FriendlyCampaign = {
  id: string;
  name: string;
  goal: Goal;
  /** Really delivering now (see delivery()), not just switched on. */
  live: boolean;
  delivery: Delivery;
  status: string;
  audience: string;
  budget: { amount: number; per: "day" | "total" } | null;
  starts?: string;
  ends?: string;
  numbers: Numbers;
  ads: FriendlyAd[];
  /** Internal ids the model needs to act on things. Never rendered. */
  internal: { adsetIds: string[]; budgetLevel: "campaign" | "adset" | null };
};

export type Period = "today" | "yesterday" | "last_7d" | "last_14d" | "last_30d" | "this_month" | "last_month" | "maximum";

const INSIGHT_FIELDS = "spend,impressions,reach,clicks,ctr,frequency,actions,action_values";

/** Reads campaigns with their audiences, budgets and ads, translated to plain language. */
export type Window = Period | { since: string; until: string };

/** The insights modifier for a window: a named preset or exact days. */
const windowOf = (w: Window) => (typeof w === "string" ? `date_preset(${w})` : `time_range(${JSON.stringify({ since: w.since, until: w.until })})`);

export async function readCampaigns(ctx: MetaContext, period: Window = "last_7d", includeEnded = false) {
  const account = requireAdAccount(ctx);
  const w = windowOf(period);
  const currency = ctx.currency ?? "ILS";
  const campaigns = await ctx.graph.all<any>(`/${account}/campaigns`, {
    fields: [
      "id,name,objective,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time",
      `insights.${w}{${INSIGHT_FIELDS}}`,
      "adsets.limit(20){id,name,effective_status,daily_budget,lifetime_budget,start_time,end_time,targeting}",
      `ads.limit(30){id,name,effective_status,creative{thumbnail_url,image_url,body,title,object_story_spec},insights.${w}{${INSIGHT_FIELDS}}}`,
    ].join(","),
    ...(includeEnded ? {} : { effective_status: JSON.stringify(["ACTIVE", "PAUSED", "IN_PROCESS", "WITH_ISSUES", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "PENDING_REVIEW", "DISAPPROVED", "PENDING_BILLING_INFO"]) }),
  }, 100);

  return campaigns.map((c): FriendlyCampaign => {
    const goal = GOAL_BY_OBJECTIVE[c.objective] ?? "other";
    const adsets: any[] = c.adsets?.data ?? [];
    const firstSet = adsets[0];
    const campaignBudget = c.daily_budget || c.lifetime_budget;
    const adsetDaily = adsets.reduce((s, a) => s + Number(a.daily_budget ?? 0), 0);
    const adsetLifetime = adsets.reduce((s, a) => s + Number(a.lifetime_budget ?? 0), 0);
    const budget = c.daily_budget
      ? { amount: toMajor(c.daily_budget, currency), per: "day" as const }
      : c.lifetime_budget
        ? { amount: toMajor(c.lifetime_budget, currency), per: "total" as const }
        : adsetDaily
          ? { amount: toMajor(adsetDaily, currency), per: "day" as const }
          : adsetLifetime
            ? { amount: toMajor(adsetLifetime, currency), per: "total" as const }
            : null;

    const ads: FriendlyAd[] = (c.ads?.data ?? []).map((a: any) => {
      const spec = a.creative?.object_story_spec;
      return {
        id: a.id,
        name: a.name,
        live: a.effective_status === "ACTIVE",
        thumbnail: a.creative?.image_url ?? a.creative?.thumbnail_url,
        text: a.creative?.body ?? spec?.link_data?.message ?? spec?.video_data?.message,
        headline: a.creative?.title ?? spec?.link_data?.name ?? spec?.video_data?.title,
        numbers: numbers(a.insights?.data?.[0], goal),
        verdict: "new" as const,
      };
    });
    rankAds(ads);
    const state = delivery(c, adsets, c.ads?.data ?? []);

    return {
      id: c.id,
      name: c.name,
      goal,
      live: state === "live",
      delivery: state,
      status: c.effective_status,
      audience: audienceSummary(firstSet?.targeting),
      budget,
      starts: c.start_time ?? firstSet?.start_time,
      ends: c.stop_time ?? firstSet?.end_time,
      numbers: numbers(c.insights?.data?.[0], goal),
      ads,
      internal: { adsetIds: adsets.map((a) => a.id), budgetLevel: campaignBudget ? "campaign" : adsets.length ? "adset" : null },
    };
  });
}

/** Marks the best and weakest ads by cost per result, once they have enough spend to judge. */
function rankAds(ads: FriendlyAd[]) {
  const judged = ads.filter((a) => a.numbers.spend >= 30 && a.numbers.costPerResult != null);
  for (const a of ads) a.verdict = a.numbers.spend < 30 ? "new" : a.numbers.results === 0 ? "weak" : "ok";
  if (judged.length < 2) return;
  judged.sort((x, y) => x.numbers.costPerResult! - y.numbers.costPerResult!);
  judged[0].verdict = "star";
  const worst = judged[judged.length - 1];
  if (worst.numbers.costPerResult! > judged[0].numbers.costPerResult! * 1.5) worst.verdict = "weak";
}

/** Total spend on the ad account for a period, in major units. */
export async function accountSpend(ctx: MetaContext, period: Period = "this_month"): Promise<number> {
  const account = requireAdAccount(ctx);
  const res = await ctx.graph.get<{ data: RawInsights[] }>(`/${account}/insights`, {
    fields: "spend",
    date_preset: period,
  });
  return Number(res.data?.[0]?.spend ?? 0);
}

/** Free-form insights for deeper questions (breakdowns, custom ranges). */
export async function insights(
  ctx: MetaContext,
  opts: { level: "account" | "campaign" | "adset" | "ad"; period?: Period; since?: string; until?: string; breakdowns?: string; timeIncrement?: string },
) {
  const account = requireAdAccount(ctx);
  return ctx.graph.all(`/${account}/insights`, {
    level: opts.level,
    fields: `campaign_name,adset_name,ad_name,${INSIGHT_FIELDS},cost_per_action_type,purchase_roas`,
    ...(opts.since && opts.until
      ? { time_range: { since: opts.since, until: opts.until } }
      : { date_preset: opts.period ?? "last_7d" }),
    ...(opts.breakdowns ? { breakdowns: opts.breakdowns } : {}),
    ...(opts.timeIncrement ? { time_increment: opts.timeIncrement } : {}),
  }, 200);
}
