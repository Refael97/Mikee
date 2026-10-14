import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { monthKey } from "./budget";
import { planOf } from "./plans";
import { getSettings } from "./settings";

/**
 * Mikee credits: the one monthly balance a business spends on everything Mikee does for it. Conversations,
 * analysis and campaign work (Claude), images and AI videos (Higgsfield) and branded video editing (our
 * renderer) all come out of it, so the client never has to think in providers or dollars, and can spend it
 * on whatever mix she wants.
 *
 * A credit is a fixed amount of our own cost (MIKEE_CREDIT_USD, default one cent), so every action is
 * charged by what it really cost. Video editing costs us almost nothing but is a service, so it has its own
 * price per second. The plan's price carries the margin. The raw costs stay in `usage` (Claude in dollars,
 * Higgsfield in its credits, renders in Mikee credits) and the balance is computed from them, so there is one
 * source of truth and the real cost per business can always be read back.
 */

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const CREDIT_PRICING = {
  /** Our cost per Mikee credit, in dollars. */
  creditUsd: () => num(process.env.MIKEE_CREDIT_USD, 0.01),
  /** What one Higgsfield credit costs us, in dollars (from our Higgsfield plan). */
  higgsfieldCreditUsd: () => num(process.env.MIKEE_HIGGSFIELD_CREDIT_USD, 0.07),
  /** Branded video editing: per second of video, with a minimum per video. */
  videoPerSecond: () => num(process.env.MIKEE_VIDEO_CREDITS_PER_SECOND, 2),
  videoMinimum: () => num(process.env.MIKEE_VIDEO_CREDITS_MIN, 20),
};

/** Rounds up to a whole credit, ignoring float noise (50 x 0.07 is 350.00000000000006, which is 350). */
const up = (x: number) => Math.ceil(Math.round(x * 1e6) / 1e6);

export const creditsFromUsd = (usd: number) => usd / CREDIT_PRICING.creditUsd();
export const creditsFromHiggsfield = (hf: number) => up((hf * CREDIT_PRICING.higgsfieldCreditUsd()) / CREDIT_PRICING.creditUsd());
export const videoEditCredits = (seconds: number) => Math.max(CREDIT_PRICING.videoMinimum(), up(seconds * CREDIT_PRICING.videoPerSecond()));

export type CreditUse = { conversations: number; media: number; video: number };

async function monthTotals(workspaceId: string, month: string) {
  const d = await db();
  const rows = await d
    .select({ kind: schema.usage.kind, total: sql<string>`coalesce(sum(${schema.usage.amount}), 0)` })
    .from(schema.usage)
    .where(and(eq(schema.usage.workspaceId, workspaceId), eq(schema.usage.month, month)))
    .groupBy(schema.usage.kind);
  const of = (k: string) => Number(rows.find((r) => r.kind === k)?.total ?? 0);
  return { claude: of("claude"), higgsfield: of("higgsfield"), render: of("render"), topup: of("topup") };
}

export type CreditBalance = {
  /** The plan's monthly credits plus any added this month. */
  total: number;
  used: number;
  remaining: number;
  byKind: CreditUse;
  /** Images and AI videos may run without a card while this month's media use stays under this. */
  autoMedia: number;
  autoMediaRemaining: number;
};

export async function creditBalance(workspaceId: string, tz: string): Promise<CreditBalance> {
  const [s, t] = await Promise.all([getSettings(workspaceId), monthTotals(workspaceId, monthKey(tz))]);
  const byKind: CreditUse = {
    conversations: up(creditsFromUsd(t.claude)),
    media: creditsFromHiggsfield(t.higgsfield),
    video: up(t.render),
  };
  const used = byKind.conversations + byKind.media + byKind.video;
  const total = Math.round((s.credits ?? planOf(s).credits) + t.topup);
  const autoMedia = Math.max(0, Math.min(s.autoMediaCredits ?? 0, total));
  return {
    total,
    used,
    remaining: Math.max(0, total - used),
    byKind,
    autoMedia,
    autoMediaRemaining: Math.max(0, Math.min(autoMedia - byKind.media, total - used)),
  };
}

export class CreditsExhausted extends Error {}

export const OUT_OF_CREDITS = "נגמרו הקרדיטים של החודש, אז מייקי עצר כאן. אפשר להוסיף קרדיטים או לחכות לחודש הבא, והכול ימשיך מאותה נקודה.";

/** Nothing that costs credits starts once the month's balance is used up. */
export async function assertCredits(workspaceId: string, tz: string, need = 0) {
  const b = await creditBalance(workspaceId, tz);
  if (b.remaining <= 0 || need > b.remaining) throw new CreditsExhausted(OUT_OF_CREDITS);
  return b;
}

/** Adds credits to this month's balance (a purchase or a goodwill gesture), recorded with its reason. */
export async function addCredits(workspaceId: string, tz: string, amount: number, reason: string) {
  if (!(amount > 0)) throw new Error("Credits to add must be positive");
  const d = await db();
  await d.insert(schema.usage).values({ workspaceId, kind: "topup", month: monthKey(tz), amount, detail: { reason } });
}
