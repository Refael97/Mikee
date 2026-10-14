import "server-only";
import { planOf } from "./plans";
import type Anthropic from "@anthropic-ai/sdk";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { monthKey } from "./budget";
import { getSettings } from "./settings";

/** USD per million tokens (cache writes at 1.25x input), by model family. Web search is per request. */
const PRICES: { prefix: string; input: number; output: number; cacheWrite: number; cacheRead: number }[] = [
  { prefix: "claude-haiku-5", input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
  { prefix: "claude-sonnet-5", input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  { prefix: "claude-opus-5-5", input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  { prefix: "claude-opus", input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  { prefix: "claude-fable", input: 10, output: 50, cacheWrite: 12.5, cacheRead: 1 },
];
const WEB_SEARCH = 0.01;

/** Cost of one call. An unknown model is priced as the most expensive tier, so the AI budget never under-counts. */
export function claudeCostUsd(u: Anthropic.Beta.BetaUsage, model = "claude-fable"): number {
  const base = PRICES.find((p) => model.startsWith(p.prefix)) ?? PRICES[PRICES.length - 1];
  // Haiku 5.5 costs five times more past 100K prompt tokens: $0.50 / $2.50.
  const prompt = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  const PRICE = base.prefix === "claude-haiku-5" && prompt > 100_000 ? { ...base, input: 0.5, output: 2.5, cacheWrite: 0.625, cacheRead: 0.05 } : base;
  const m = 1_000_000;
  return (
    ((u.input_tokens ?? 0) * PRICE.input +
      (u.output_tokens ?? 0) * PRICE.output +
      (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite +
      (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead) /
      m +
    (u.server_tool_use?.web_search_requests ?? 0) * WEB_SEARCH
  );
}

export async function recordUsage(workspaceId: string, tz: string, kind: "claude" | "higgsfield", amount: number, detail?: Record<string, unknown>) {
  if (!amount) return;
  const d = await db();
  await d.insert(schema.usage).values({ workspaceId, kind, month: monthKey(tz), amount, detail });
}

export async function monthUsage(workspaceId: string, tz: string, kind: "claude" | "higgsfield"): Promise<number> {
  const d = await db();
  const [r] = await d
    .select({ total: sql<string>`coalesce(sum(${schema.usage.amount}), 0)` })
    .from(schema.usage)
    .where(and(eq(schema.usage.workspaceId, workspaceId), eq(schema.usage.kind, kind), eq(schema.usage.month, monthKey(tz))));
  return Number(r?.total ?? 0);
}

export class AiBudgetExceeded extends Error {}

/** Mikee does not start (or continue) thinking once this month's AI cap is reached. */
export async function assertAiBudget(workspaceId: string, tz: string) {
  const settings = await getSettings(workspaceId);
  // The plan's ceiling always wins over the business's own setting.
  const aiMonthlyLimitUsd = Math.min(settings.aiMonthlyLimitUsd, planOf(settings).aiUsd);
  const used = await monthUsage(workspaceId, tz, "claude");
  if (used >= aiMonthlyLimitUsd) {
    throw new AiBudgetExceeded(`מייקי הגיע למגבלת השימוש החודשית ($${aiMonthlyLimitUsd}). אפשר לשנות אותה בהגדרות, עד הגבול של המנוי.`);
  }
  return { used, limit: aiMonthlyLimitUsd };
}

/** Credits still available this month for media generation, and how many of them need no card. */
export async function mediaAllowance(workspaceId: string, tz: string) {
  const s = await getSettings(workspaceId);
  const used = await monthUsage(workspaceId, tz, "higgsfield");
  return {
    used,
    hardLimit: Math.min(s.mediaMonthlyCredits, planOf(s).mediaCredits),
    remaining: Math.max(0, Math.min(s.mediaMonthlyCredits, planOf(s).mediaCredits) - used),
    autoRemaining: Math.max(0, Math.min(s.mediaAutoCredits, s.mediaMonthlyCredits) - used),
  };
}
