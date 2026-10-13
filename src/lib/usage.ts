import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { monthKey } from "./budget";
import { getSettings } from "./settings";

/** USD per million tokens for the model Mikee runs on (claude-opus-5-5). */
const PRICE = { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2, webSearch: 0.01 };

export function claudeCostUsd(u: Anthropic.Beta.BetaUsage): number {
  const m = 1_000_000;
  return (
    ((u.input_tokens ?? 0) * PRICE.input +
      (u.output_tokens ?? 0) * PRICE.output +
      (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite +
      (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead) /
      m +
    (u.server_tool_use?.web_search_requests ?? 0) * PRICE.webSearch
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
  const { aiMonthlyLimitUsd } = await getSettings(workspaceId);
  const used = await monthUsage(workspaceId, tz, "claude");
  if (used >= aiMonthlyLimitUsd) {
    throw new AiBudgetExceeded(`מייקי הגיע למגבלת השימוש החודשית ($${aiMonthlyLimitUsd}). אפשר להעלות אותה בהגדרות.`);
  }
  return { used, limit: aiMonthlyLimitUsd };
}

/** Credits still available this month for media generation, and how many of them need no card. */
export async function mediaAllowance(workspaceId: string, tz: string) {
  const s = await getSettings(workspaceId);
  const used = await monthUsage(workspaceId, tz, "higgsfield");
  return {
    used,
    hardLimit: s.mediaMonthlyCredits,
    remaining: Math.max(0, s.mediaMonthlyCredits - used),
    autoRemaining: Math.max(0, Math.min(s.mediaAutoCredits, s.mediaMonthlyCredits) - used),
  };
}
