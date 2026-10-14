import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { type MetaContext, minorFactor, money, requireAdAccount, toMajor } from "./meta/context";
import { accountSpend } from "./meta/performance";
import { getSettings, updateSettings } from "./settings";

const DAY = 86400000;

/**
 * Budget policy (what counts against the monthly ceiling):
 * - spent: Meta's reported spend this month. Meta reports with a delay of up to a few hours, so today is
 *   always counted as a full day of every running budget (see `days`), which covers the unreported part.
 * - committed: everything currently able to deliver (active, in review, with issues), read live from Meta
 *   each time, so changes made outside Mikee are included. Daily budgets × days left in their window
 *   (a scheduled campaign counts from its start date). Lifetime budgets: what is left of them, prorated
 *   to this month when they end later.
 * - paused campaigns spend nothing and do not count. Resuming one is a new commitment that needs a card
 *   and passes this check like any other spend.
 * - buffer: Meta may spend up to 75% over a daily budget on a given day and averages out over the week,
 *   so 10% of the committed amount is held back.
 * - reserved: cards waiting for the client's approval hold their amount, so several cards cannot each
 *   fit separately and overshoot together.
 * The ad account's own spending limit at Meta is synced to the same ceiling as a hard stop on charges.
 */
export const VARIANCE_BUFFER = 0.1;

const DELIVERING = ["ACTIVE", "IN_PROCESS", "WITH_ISSUES", "PENDING_REVIEW", "PREAPPROVED", "PENDING_BILLING_INFO"];

export function monthKey(tz = "Asia/Jerusalem", date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" }).formatToParts(date);
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
}

/** Days left in the month including today, in the workspace timezone. */
export function daysLeftInMonth(tz = "Asia/Jerusalem", date = new Date()): number {
  const day = Number(new Intl.DateTimeFormat("en-CA", { timeZone: tz, day: "numeric" }).format(date));
  const [y, m] = monthKey(tz, date).split("-").map(Number);
  return new Date(y, m, 0).getDate() - day + 1;
}

/** The instant the month ends (midnight at the end of its last day) in the workspace timezone. */
export function monthEndAt(tz = "Asia/Jerusalem", now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const untilMidnight = DAY - (get("hour") * 3600 + get("minute") * 60 + get("second")) * 1000;
  return now.getTime() + untilMidnight + (daysLeftInMonth(tz, now) - 1) * DAY;
}

/** Days a budget can deliver this month: from max(now, start) to min(end, month end); a started day counts in full. */
export function deliveryDays(tz: string, start?: string | null, end?: string | null, now = new Date()): number {
  const monthEnd = monthEndAt(tz, now);
  const from = Math.max(now.getTime(), start ? new Date(start).getTime() : 0);
  const to = Math.min(monthEnd, end ? new Date(end).getTime() : Infinity);
  return to <= from ? 0 : Math.ceil((to - from) / DAY);
}

/** Extra spend a daily budget adds this month. */
export function dailyCommit(dailyMajor: number, tz: string, endTime?: string | null, startTime?: string | null): number {
  return dailyMajor * deliveryDays(tz, startTime, endTime);
}

type Item = { id: string; name: string; level: "campaign" | "adset"; amount: number; detail: string };

export async function projectMonth(ctx: MetaContext, tz: string): Promise<{ committed: number; items: Item[]; paused: Item[] }> {
  const account = requireAdAccount(ctx);
  const currency = ctx.currency ?? "ILS";
  const fields = (end: string) => `id,name,effective_status,daily_budget,lifetime_budget,budget_remaining,start_time,${end}`;
  const [campaigns, adsets] = await Promise.all([
    ctx.graph.all<any>(`/${account}/campaigns`, { fields: fields("stop_time") }),
    ctx.graph.all<any>(`/${account}/adsets`, { fields: `${fields("end_time")},campaign_id` }),
  ]);

  const items: Item[] = [];
  const paused: Item[] = [];
  const campaignBudget = new Set<string>();
  const live = (s: string) => DELIVERING.includes(s);

  const add = (node: any, level: Item["level"], end?: string) => {
    let amount = 0;
    let detail = "";
    if (node.daily_budget) {
      const days = deliveryDays(tz, node.start_time, end);
      amount = toMajor(node.daily_budget, currency) * days;
      detail = `${money(toMajor(node.daily_budget, currency), currency)}/day × ${days} days`;
    } else if (node.lifetime_budget) {
      const remaining = toMajor(node.budget_remaining ?? node.lifetime_budget, currency);
      const inMonth = deliveryDays(tz, node.start_time, end);
      const total = end ? Math.max(1, Math.ceil((new Date(end).getTime() - Math.max(Date.now(), new Date(node.start_time ?? 0).getTime())) / DAY)) : inMonth;
      amount = total > 0 ? remaining * Math.min(1, inMonth / total) : 0;
      detail = `lifetime, ${money(remaining, currency)} left`;
    } else return;
    const item = { id: node.id, name: node.name, level, amount, detail };
    (live(node.effective_status) ? items : paused).push(item);
  };

  for (const c of campaigns) {
    if (c.daily_budget || c.lifetime_budget) {
      campaignBudget.add(c.id);
      add(c, "campaign", c.stop_time);
    }
  }
  const campaignStatus = new Map(campaigns.map((c) => [c.id, c]));
  for (const a of adsets) {
    if (campaignBudget.has(a.campaign_id)) continue;
    const parent = campaignStatus.get(a.campaign_id);
    // An ad set only delivers if its campaign does; effective_status already reflects that.
    add(a, "adset", a.end_time ?? parent?.stop_time);
  }
  return { committed: items.reduce((s, i) => s + i.amount, 0), items, paused };
}

export async function budgetSettings(workspaceId: string, tz: string) {
  const d = await db();
  const month = monthKey(tz);
  const row = await d.query.budgets.findFirst({ where: eq(schema.budgets.workspaceId, workspaceId) });
  const ext = await d
    .select({ total: sql<string>`coalesce(sum(${schema.budgetExtensions.amount}), 0)` })
    .from(schema.budgetExtensions)
    .where(and(eq(schema.budgetExtensions.workspaceId, workspaceId), eq(schema.budgetExtensions.month, month)));
  return { row, month, extensions: Number(ext[0]?.total ?? 0) };
}

async function reservedByPending(workspaceId: string, month: string, excludeProposalId?: string) {
  const d = await db();
  const conds = [
    eq(schema.proposals.workspaceId, workspaceId),
    eq(schema.proposals.status, "pending"),
    eq(schema.proposals.month, month),
    sql`${schema.proposals.kind} in ('campaign','change')`,
  ];
  if (excludeProposalId) conds.push(ne(schema.proposals.id, excludeProposalId));
  const [r] = await d.select({ total: sql<string>`coalesce(sum(${schema.proposals.reserved}), 0)` }).from(schema.proposals).where(and(...conds));
  return Number(r?.total ?? 0);
}

export type BudgetStatus = {
  configured: boolean;
  currency: string;
  month: string;
  base: number;
  extensions: number;
  limit: number;
  spent: number;
  committed: number;
  buffer: number;
  reserved: number;
  headroom: number;
  daysLeft: number;
  running: Item[];
  paused: Item[];
};

export async function budgetStatus(
  workspaceId: string,
  tz: string,
  ctx: MetaContext,
  opts: { excludeProposalId?: string } = {},
): Promise<BudgetStatus> {
  const { row, month, extensions } = await budgetSettings(workspaceId, tz);
  const currency = ctx.currency ?? row?.currency ?? "ILS";
  const [spent, projection, reserved] = await Promise.all([
    accountSpend(ctx, "this_month"),
    projectMonth(ctx, tz),
    reservedByPending(workspaceId, month, opts.excludeProposalId),
  ]);
  const base = row ? Number(row.monthlyLimit) : 0;
  const limit = base + extensions;
  const buffer = projection.committed * VARIANCE_BUFFER;
  return {
    configured: !!row,
    currency,
    month,
    base,
    extensions,
    limit,
    spent,
    committed: projection.committed,
    buffer,
    reserved,
    headroom: limit - spent - projection.committed - buffer - reserved,
    daysLeft: daysLeftInMonth(tz),
    running: projection.items,
    paused: projection.paused,
  };
}

export class BudgetExceeded extends Error {}

/**
 * The rule: nothing may push this month's projected spend above the client's ceiling.
 * `additional` is the extra spend (major units) the action adds before the month ends.
 */
export async function assertWithinBudget(
  workspaceId: string,
  tz: string,
  ctx: MetaContext,
  additional: number,
  opts: { excludeProposalId?: string } = {},
): Promise<BudgetStatus> {
  const s = await budgetStatus(workspaceId, tz, ctx, opts);
  if (additional <= 0) return s;
  if (!s.configured) {
    throw new BudgetExceeded("The client has not set a monthly budget yet. Nothing that spends money can run until she sets one in Settings.");
  }
  if (additional > s.headroom + 0.01) {
    const c = s.currency;
    throw new BudgetExceeded(
      `Blocked by the monthly budget: this adds ~${money(additional, c)} by month end, but only ${money(Math.max(0, s.headroom), c)} is free ` +
        `(budget ${money(s.limit, c)}; spent ${money(s.spent, c)}; running campaigns until month end ${money(s.committed, c)}; ` +
        `safety margin ${money(s.buffer, c)}; waiting cards ${money(s.reserved, c)}). ` +
        `Lower the amount, shorten the dates, or ask the client for an increase with request_budget_increase.`,
    );
  }
  return s;
}

/**
 * Hard stop at Meta: sets the ad account's spending limit so total charges cannot pass this month's
 * ceiling, whatever happens inside or outside Mikee. Meta documents the write in the currency's main
 * unit while reading amounts in minor units, so the result is read back and verified.
 */
export async function syncMetaSpendCap(workspaceId: string, tz: string, ctx: MetaContext) {
  const settings = await getSettings(workspaceId);
  if (!settings.metaSpendCap) return { skipped: true as const };
  const account = requireAdAccount(ctx);
  const currency = ctx.currency ?? "ILS";
  const factor = minorFactor(currency);
  const { row, extensions } = await budgetSettings(workspaceId, tz);
  if (!row) return { skipped: true as const };

  const status = (ok: boolean, detail: string) =>
    updateSettings(workspaceId, { metaSpendCapStatus: { ok, at: new Date().toISOString(), detail } });
  try {
    const [acc, spentThisMonth] = await Promise.all([
      ctx.graph.get<{ amount_spent: string; spend_cap?: string }>(`/${account}`, { fields: "amount_spent,spend_cap" }),
      accountSpend(ctx, "this_month"),
    ]);
    const remaining = Math.max(0, Number(row.monthlyLimit) + extensions - spentThisMonth);
    // A cap of 0 means "no cap" to Meta, so the smallest cap is one unit. The account limit may be changed only
    // 10 times a day (17/1885172), so it is written only when it actually differs.
    const targetMajor = Math.max(1, Math.round((Number(acc.amount_spent) / factor + remaining) * 100) / 100);
    if (acc.spend_cap && Math.abs(Number(acc.spend_cap) - targetMajor * factor) < 1) {
      await status(true, `limit already set, ${money(remaining, currency)} left this month`);
      return { ok: true, targetMajor, remaining, unchanged: true };
    }
    await ctx.graph.post(`/${account}`, { spend_cap: targetMajor });
    const after = await ctx.graph.get<{ spend_cap: string }>(`/${account}`, { fields: "spend_cap" });
    const readBack = Number(after.spend_cap);
    const ok = Math.abs(readBack - targetMajor * factor) < 1 || Math.abs(readBack - targetMajor) < 0.01;
    await status(ok, ok ? `limit set, ${money(remaining, currency)} left this month` : `limit read back as ${after.spend_cap}, expected ${targetMajor}`);
    return { ok, targetMajor, remaining };
  } catch (e) {
    await status(false, (e as Error).message);
    return { ok: false, error: (e as Error).message };
  }
}
