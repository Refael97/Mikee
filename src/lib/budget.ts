import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "./db";
import { type MetaContext, money, requireAdAccount, toMajor } from "./meta/context";
import { accountSpend } from "./meta/performance";

export function monthKey(tz = "Asia/Jerusalem", date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" }).formatToParts(date);
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
}

/** Days left in the month including today, in the workspace timezone. */
export function daysLeftInMonth(tz = "Asia/Jerusalem", date = new Date()): number {
  const day = Number(new Intl.DateTimeFormat("en-CA", { timeZone: tz, day: "numeric" }).format(date));
  const [y, m] = monthKey(tz, date).split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  return daysInMonth - day + 1;
}

export type BudgetStatus = {
  configured: boolean;
  currency: string;
  month: string;
  base: number;
  extensions: number;
  limit: number;
  spent: number;
  /** What already-running budgets will spend until the end of the month if nothing changes. */
  committed: number;
  /** Room left for new or increased spend this month. */
  headroom: number;
  daysLeft: number;
};

/**
 * Projects the rest of the month: every live daily budget times the days left (capped by its end date),
 * plus the remaining amount of live lifetime budgets.
 */
async function committedSpend(ctx: MetaContext, tz: string): Promise<number> {
  const account = requireAdAccount(ctx);
  const currency = ctx.currency ?? "ILS";
  const daysLeft = daysLeftInMonth(tz);
  const endOfMonth = new Date(Date.now() + daysLeft * 86400000);
  const days = (end?: string) => {
    if (!end) return daysLeft;
    const until = Math.min(new Date(end).getTime(), endOfMonth.getTime());
    return Math.max(0, Math.ceil((until - Date.now()) / 86400000));
  };

  const campaigns = await ctx.graph.all<any>(`/${account}/campaigns`, {
    fields: "id,effective_status,daily_budget,lifetime_budget,budget_remaining,stop_time",
    effective_status: JSON.stringify(["ACTIVE", "IN_PROCESS"]),
  });
  let total = 0;
  const cboIds = new Set<string>();
  for (const c of campaigns) {
    if (c.daily_budget) {
      cboIds.add(c.id);
      total += toMajor(c.daily_budget, currency) * days(c.stop_time);
    } else if (c.lifetime_budget) {
      cboIds.add(c.id);
      total += toMajor(c.budget_remaining ?? c.lifetime_budget, currency);
    }
  }
  const adsets = await ctx.graph.all<any>(`/${account}/adsets`, {
    fields: "id,campaign_id,effective_status,daily_budget,lifetime_budget,budget_remaining,end_time",
    effective_status: JSON.stringify(["ACTIVE", "IN_PROCESS"]),
  });
  for (const a of adsets) {
    if (cboIds.has(a.campaign_id)) continue;
    if (a.daily_budget) total += toMajor(a.daily_budget, currency) * days(a.end_time);
    else if (a.lifetime_budget) total += toMajor(a.budget_remaining ?? a.lifetime_budget, currency);
  }
  return total;
}

export async function budgetSettings(workspaceId: string, tz: string) {
  const d = await db();
  const month = monthKey(tz);
  const row = await d.query.budgets.findFirst({ where: eq(schema.budgets.workspaceId, workspaceId) });
  const ext = await d
    .select()
    .from(schema.budgetExtensions)
    .where(
      and(
        eq(schema.budgetExtensions.workspaceId, workspaceId),
        eq(schema.budgetExtensions.month, month),
        eq(schema.budgetExtensions.status, "approved"),
      ),
    );
  const extensions = ext.reduce((s, e) => s + Number(e.amount), 0);
  return { row, month, extensions };
}

export async function budgetStatus(workspaceId: string, tz: string, ctx: MetaContext): Promise<BudgetStatus> {
  const { row, month, extensions } = await budgetSettings(workspaceId, tz);
  const currency = ctx.currency ?? row?.currency ?? "ILS";
  const [spent, committed] = await Promise.all([accountSpend(ctx, "this_month"), committedSpend(ctx, tz)]);
  const base = row ? Number(row.monthlyLimit) : 0;
  const limit = base + extensions;
  return {
    configured: !!row,
    currency,
    month,
    base,
    extensions,
    limit,
    spent,
    committed,
    headroom: limit - spent - committed,
    daysLeft: daysLeftInMonth(tz),
  };
}

export class BudgetExceeded extends Error {}

/**
 * The hard rule: nothing may push this month's projected spend above the budget the client set.
 * `additional` is the extra spend (major units) the action would add before the month ends.
 */
export async function assertWithinBudget(workspaceId: string, tz: string, ctx: MetaContext, additional: number) {
  if (additional <= 0) return;
  const s = await budgetStatus(workspaceId, tz, ctx);
  if (!s.configured) {
    throw new BudgetExceeded(
      "The client has not set a monthly budget yet. Nothing that spends money can run until she sets one in Settings.",
    );
  }
  if (additional > s.headroom + 0.01) {
    throw new BudgetExceeded(
      `Blocked by the monthly budget: this adds ~${money(additional, s.currency)} by month end, but only ${money(Math.max(0, s.headroom), s.currency)} is left ` +
        `(budget ${money(s.limit, s.currency)}, spent ${money(s.spent, s.currency)}, already committed ${money(s.committed, s.currency)}). ` +
        `Lower the amount or shorten the dates, or ask the client for an increase with request_budget_increase.`,
    );
  }
}

/** Extra spend a daily budget adds until month end (or until its end date). */
export function dailyCommit(dailyMajor: number, tz: string, endTime?: string | null, startTime?: string | null): number {
  const left = daysLeftInMonth(tz);
  const start = startTime ? Math.max(Date.now(), new Date(startTime).getTime()) : Date.now();
  const endOfMonth = Date.now() + left * 86400000;
  const end = endTime ? Math.min(new Date(endTime).getTime(), endOfMonth) : endOfMonth;
  const days = Math.max(0, Math.ceil((end - start) / 86400000));
  return dailyMajor * days;
}
