import "server-only";
import type { DashboardSpec, KpiId } from "./db/schema";
import { getSettings, updateSettings } from "./settings";
import { type MetaContext, requireAdAccount } from "./meta/context";
import { salesSummary } from "./store";

/**
 * The results page is chosen, not configured: Mikee picks the three or four numbers that matter for this kind
 * of business (a shop cares about sales and return on spend, a clinic about enquiries and their cost) and
 * writes one line about the month. The client never sets up a dashboard.
 */

export const KPIS: Record<KpiId, { label: string; format: "money" | "count" | "ratio"; better: "up" | "down"; source: "meta" | "store"; hint: string }> = {
  spend: { label: "הושקעו בפרסום", format: "money", better: "down", source: "meta", hint: "כמה יצא על מודעות" },
  leads: { label: "פניות", format: "count", better: "up", source: "meta", hint: "טפסים, הודעות ופניות מהמודעות" },
  cost_per_lead: { label: "עלות לפנייה", format: "money", better: "down", source: "meta", hint: "כמה עלתה כל פנייה" },
  purchases: { label: "רכישות מהמודעות", format: "count", better: "up", source: "meta", hint: "רכישות שמטא ייחסה למודעות" },
  revenue: { label: "הכנסות מהמודעות", format: "money", better: "up", source: "meta", hint: "שווי הרכישות מהמודעות" },
  roas: { label: "כל שקל החזיר", format: "ratio", better: "up", source: "meta", hint: "הכנסות חלקי הוצאה על מודעות" },
  cost_per_purchase: { label: "עלות לרכישה", format: "money", better: "down", source: "meta", hint: "כמה עלתה כל רכישה" },
  messages: { label: "שיחות שנפתחו", format: "count", better: "up", source: "meta", hint: "הודעות בוואטסאפ, מסנג׳ר ואינסטגרם" },
  calls: { label: "שיחות טלפון", format: "count", better: "up", source: "meta", hint: "לחיצות על חיוג מהמודעות" },
  link_clicks: { label: "כניסות לאתר", format: "count", better: "up", source: "meta", hint: "לחיצות על הקישור במודעות" },
  cost_per_click: { label: "עלות לכניסה", format: "money", better: "down", source: "meta", hint: "כמה עלתה כל כניסה" },
  reach: { label: "אנשים שראו", format: "count", better: "up", source: "meta", hint: "כמה אנשים שונים ראו את המודעות" },
  followers: { label: "עוקבים חדשים", format: "count", better: "up", source: "meta", hint: "עוקבים שהצטרפו באינסטגרם" },
  store_orders: { label: "הזמנות בחנות", format: "count", better: "up", source: "store", hint: "כל ההזמנות באתר, מכל מקור" },
  store_revenue: { label: "מכירות בחנות", format: "money", better: "up", source: "store", hint: "סך המכירות באתר, מכל מקור" },
};

export const DEFAULT_KPIS: Record<string, KpiId[]> = {
  ecommerce: ["store_revenue", "purchases", "roas", "spend"],
  services: ["leads", "cost_per_lead", "spend", "link_clicks"],
  local: ["leads", "messages", "cost_per_lead", "spend"],
  content: ["reach", "followers", "link_clicks", "spend"],
  unknown: ["spend", "leads", "purchases", "reach"],
};

export async function dashboardSpec(workspaceId: string): Promise<DashboardSpec> {
  const s = await getSettings(workspaceId);
  if (s.dashboard?.kpis?.length) return s.dashboard;
  return { kpis: DEFAULT_KPIS[s.businessType ?? "unknown"], updatedAt: "" };
}

export async function setDashboard(workspaceId: string, spec: { kpis?: KpiId[]; headline?: string; note?: string }) {
  const current = await dashboardSpec(workspaceId);
  await updateSettings(workspaceId, {
    dashboard: {
      kpis: (spec.kpis?.length ? spec.kpis : current.kpis).filter((k) => k in KPIS).slice(0, 4),
      headline: spec.headline?.slice(0, 160) ?? current.headline,
      note: spec.note?.slice(0, 400) ?? current.note,
      updatedAt: new Date().toISOString(),
    },
  });
}

type Totals = Record<Exclude<KpiId, "store_orders" | "store_revenue">, number | null>;
type Raw = { spend?: string; reach?: string; inline_link_clicks?: string; actions?: { action_type: string; value: string }[]; action_values?: { action_type: string; value: string }[]; date_start?: string };

const sum = (list: Raw["actions"], types: string[]) => {
  for (const t of types) {
    const hit = list?.find((a) => a.action_type === t);
    if (hit) return Number(hit.value);
  }
  return 0;
};
const LEADS = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"];
const MESSAGES = ["onsite_conversion.messaging_conversation_started_7d"];
const PURCHASES = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];
const CALLS = ["click_to_call_native_call_placed", "click_to_call_call_confirm"];
const FOLLOWS = ["onsite_conversion.follow", "like"];

function totals(r: Raw | undefined): Totals {
  const spend = Number(r?.spend ?? 0);
  const leads = sum(r?.actions, LEADS) + sum(r?.actions, MESSAGES);
  const purchases = sum(r?.actions, PURCHASES);
  const revenue = sum(r?.action_values, PURCHASES);
  const clicks = Number(r?.inline_link_clicks ?? 0);
  return {
    spend,
    leads,
    cost_per_lead: leads ? spend / leads : null,
    purchases,
    revenue,
    roas: revenue && spend ? revenue / spend : null,
    cost_per_purchase: purchases ? spend / purchases : null,
    messages: sum(r?.actions, MESSAGES),
    calls: sum(r?.actions, CALLS),
    link_clicks: clicks,
    cost_per_click: clicks ? spend / clicks : null,
    reach: Number(r?.reach ?? 0),
    followers: sum(r?.actions, FOLLOWS),
  };
}

const ymd = (d: Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** Month to date, compared with the same days of last month (a fair comparison, not a full month vs part of one). */
export function monthRanges(tz: string, now = new Date()) {
  const today = ymd(now, tz);
  const [y, m, day] = today.split("-").map(Number);
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  const prevDays = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    current: { since: `${y}-${pad(m)}-01`, until: today },
    previous: { since: `${prevYear}-${pad(prevMonth)}-01`, until: `${prevYear}-${pad(prevMonth)}-${pad(Math.min(day, prevDays))}` },
    day,
  };
}

export type KpiValue = { id: KpiId; label: string; hint: string; format: "money" | "count" | "ratio"; value: number | null; previous: number | null; change: number | null; good: boolean | null };

export async function dashboardData(workspaceId: string, tz: string, ctx: MetaContext | null) {
  const spec = await dashboardSpec(workspaceId);
  const r = monthRanges(tz);
  let now: Totals | null = null;
  let before: Totals | null = null;
  let daily: { date: string; spend: number; results: number }[] = [];
  if (ctx?.adAccountId) {
    const account = requireAdAccount(ctx);
    const fields = "spend,reach,inline_link_clicks,actions,action_values";
    const [a, b, days] = await Promise.all([
      ctx.graph.get<{ data: Raw[] }>(`/${account}/insights`, { level: "account", fields, time_range: r.current }),
      ctx.graph.get<{ data: Raw[] }>(`/${account}/insights`, { level: "account", fields, time_range: r.previous }),
      ctx.graph.all<Raw>(`/${account}/insights`, { level: "account", fields: "spend,actions", time_range: r.current, time_increment: 1 }, 31),
    ]);
    now = totals(a.data?.[0]);
    before = totals(b.data?.[0]);
    daily = days.map((x) => {
      const t = totals(x);
      return { date: x.date_start ?? "", spend: t.spend ?? 0, results: (t.leads ?? 0) + (t.purchases ?? 0) };
    });
  }
  let store: { orders: number; revenue: number } | null = null;
  if (spec.kpis.some((k) => KPIS[k].source === "store")) {
    const s = await salesSummary(workspaceId, r.day + 1).catch(() => null);
    if (s?.connected) store = { orders: s.byMonth[r.current.since.slice(0, 7)]?.orders ?? 0, revenue: Math.round(s.byMonth[r.current.since.slice(0, 7)]?.revenue ?? 0) };
  }
  const kpis: KpiValue[] = spec.kpis.map((id) => {
    const def = KPIS[id];
    const value = id === "store_orders" ? (store?.orders ?? null) : id === "store_revenue" ? (store?.revenue ?? null) : now ? now[id] : null;
    const previous = def.source === "store" || !before ? null : before[id as keyof Totals];
    const change = value != null && previous ? (value - previous) / previous : null;
    return { id, label: def.label, hint: def.hint, format: def.format, value, previous, change, good: change == null || Math.abs(change) < 0.03 ? null : (change > 0) === (def.better === "up") };
  });
  return { spec, kpis, daily, ranges: r, currency: ctx?.currency ?? "ILS" };
}
