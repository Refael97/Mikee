import "server-only";
import { and, asc, eq, gt, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { planOf } from "./plans";
import { getSettings, updateSettings } from "./settings";
import { currentTask } from "./telemetry";

/**
 * The usage quota: Mikee credits, one fixed unit in every plan (a credit is a cent of our cost). Each billing
 * cycle the plan includes a number of them; bought credits are used only after the included ones run out.
 * Conversations and all the work behind them (Mikee, the specialists, skills, tools) and images and AI videos
 * from Higgsfield are charged by what they really cost. Editing branded videos is free; the agent that
 * prepares one is charged like any other work.
 *
 * The client never sees prices, tokens or providers: only how much of the quota is used, what is left and
 * when it renews. She asks, Mikee does it within the quota, without a price card.
 *
 * Integrity:
 * - Every change to a business's balance runs in a transaction that locks the business's row, so work
 *   running at the same time cannot together go past the quota.
 * - Work that starts sets credits aside (a hold); charges under it count against the hold, and what was not
 *   used returns when it ends. A hold left behind by a crash expires on its own.
 * - Each charge is recorded once (retries check their checkpoint first). Work that failed without a usable
 *   result is not charged to the client; its cost stays recorded as ours (kind *_lost).
 */

const num = (v: string | undefined, fallback: number, allowZero = false) => {
  const n = Number(v);
  return Number.isFinite(n) && (allowZero ? n >= 0 : n > 0) ? n : fallback;
};

export const CREDIT_CONFIG = {
  /** Our cost per credit, in dollars: the fixed unit. */
  creditUsd: () => num(process.env.MIKEE_CREDIT_USD, 0.01),
  /** What one Higgsfield credit costs us, on our Higgsfield plan. */
  higgsfieldCreditUsd: () => num(process.env.MIKEE_HIGGSFIELD_CREDIT_USD, 0.07),
  /** Set aside when a conversation turn starts; the turn's real cost is charged against it. */
  turnHold: () => num(process.env.MIKEE_TURN_HOLD_CREDITS, 40),
  /** Bought credits stay valid this many months (0: they never expire). They carry over between cycles. */
  purchasedValidMonths: () => num(process.env.MIKEE_PURCHASED_CREDITS_MONTHS, 12, true),
  /** A hold older than this is treated as released (its work died). */
  holdMinutes: () => num(process.env.MIKEE_HOLD_MINUTES, 120),
};

/** Rounds up to a whole credit, ignoring float noise (50 x 0.07 is 350.00000000000006, which is 350). */
const up = (x: number) => Math.ceil(Math.round(x * 1e6) / 1e6);
export const creditsFromUsd = (usd: number) => Math.round((usd / CREDIT_CONFIG.creditUsd()) * 1e4) / 1e4;
export const creditsFromHiggsfield = (hf: number) => up((hf * CREDIT_CONFIG.higgsfieldCreditUsd()) / CREDIT_CONFIG.creditUsd());

export const NOT_ENOUGH = "המכסה שלך לא מספיקה לפעולה הזאת. אפשר להוסיף קרדיטים או לשדרג ולהמשיך מאותה נקודה.";
export const ALMOST_DONE = "המכסה החודשית כמעט נגמרה. אפשר להוסיף קרדיטים ולהמשיך.";
export const THRESHOLDS = [80, 95];

export class CreditsExhausted extends Error {
  constructor(message = NOT_ENOUGH) {
    super(message);
  }
}

/* ---------- billing cycle ---------- */

const pad = (n: number) => String(n).padStart(2, "0");
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const localDate = (d: Date, tz: string) => {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const v = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return { y: v("year"), m: v("month"), d: v("day") };
};

/**
 * The billing cycle a moment falls in: it starts on the subscription's day of the month (the last day in a
 * shorter month) and renews on the same day a month later. The key is the start date.
 */
export function cycleOf(anchorDay: number, tz: string, now = new Date()) {
  const { y, m, d } = localDate(now, tz);
  const day = (yy: number, mm: number) => Math.min(anchorDay, daysIn(yy, mm));
  let [sy, sm] = [y, m];
  if (d < day(y, m)) [sy, sm] = m === 1 ? [y - 1, 12] : [y, m - 1];
  const [ny, nm] = sm === 12 ? [sy + 1, 1] : [sy, sm + 1];
  return { key: `${sy}-${pad(sm)}-${pad(day(sy, sm))}`, renewsOn: `${ny}-${pad(nm)}-${pad(day(ny, nm))}` };
}

async function cycleFor(workspaceId: string, tz: string, now = new Date()) {
  const d = await db();
  const [s, ws] = await Promise.all([getSettings(workspaceId), d.query.workspaces.findFirst({ where: eq(schema.workspaces.id, workspaceId) })]);
  const anchor = s.billingAnchor && /^\d{4}-\d{2}-\d{2}$/.test(s.billingAnchor) ? Number(s.billingAnchor.slice(8, 10)) : localDate(ws?.createdAt ?? now, tz).d;
  return { ...cycleOf(anchor, tz, now), settings: s };
}

/* ---------- the balance ---------- */

type Db = Awaited<ReturnType<typeof db>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Q = Db | Tx;

const holdCutoff = () => new Date(Date.now() - CREDIT_CONFIG.holdMinutes() * 60_000);

async function figures(q: Q, workspaceId: string, cycle: string, now = new Date()) {
  const [used] = await q
    .select({ total: sql<string>`coalesce(sum(${schema.usage.credits}), 0)` })
    .from(schema.usage)
    .where(and(eq(schema.usage.workspaceId, workspaceId), eq(schema.usage.month, cycle), isNotNull(schema.usage.credits)));
  const byKind = await q
    .select({ kind: schema.usage.kind, total: sql<string>`coalesce(sum(${schema.usage.credits}), 0)` })
    .from(schema.usage)
    .where(and(eq(schema.usage.workspaceId, workspaceId), eq(schema.usage.month, cycle), isNotNull(schema.usage.credits)))
    .groupBy(schema.usage.kind);
  const purchases = await q
    .select({
      id: schema.creditPurchases.id,
      amount: schema.creditPurchases.amount,
      expiresAt: schema.creditPurchases.expiresAt,
      drawn: sql<string>`coalesce((select sum(cd.amount) from credit_draws cd where cd.purchase_id = "credit_purchases"."id"), 0)`,
    })
    .from(schema.creditPurchases)
    .where(and(eq(schema.creditPurchases.workspaceId, workspaceId), or(isNull(schema.creditPurchases.expiresAt), gt(schema.creditPurchases.expiresAt, now))))
    .orderBy(sql`${schema.creditPurchases.expiresAt} asc nulls last`, asc(schema.creditPurchases.createdAt));
  const holds = await q
    .select()
    .from(schema.creditHolds)
    .where(and(eq(schema.creditHolds.workspaceId, workspaceId), isNull(schema.creditHolds.releasedAt), gt(schema.creditHolds.createdAt, holdCutoff())));
  return {
    used: Number(used?.total ?? 0),
    byKind: Object.fromEntries(byKind.map((r) => [r.kind, Number(r.total)])) as Record<string, number>,
    purchases: purchases.map((p) => ({ id: p.id, left: Math.max(0, Number(p.amount) - Number(p.drawn)), expiresAt: p.expiresAt })),
    holds: holds.map((h) => ({ id: h.id, ref: h.ref, open: Math.max(0, Number(h.amount) - Number(h.consumed)) })),
  };
}

export type Quota = {
  cycle: string;
  /** The day the included quota renews (YYYY-MM-DD). */
  renewsOn: string;
  included: number;
  includedUsed: number;
  includedLeft: number;
  /** Share of the included quota used this cycle, 0-100 (bought credits are shown apart). */
  percent: number;
  /** Bought credits still available (after the included ones run out). */
  purchasedLeft: number;
  /** What can be spent right now: included and bought, minus work in progress. */
  available: number;
  /** Credits used this cycle, by kind of work (for the usage detail). */
  byKind: { conversations: number; media: number };
};

function summarize(f: Awaited<ReturnType<typeof figures>>, included: number, cycle: { key: string; renewsOn: string }, exceptHold?: string): Quota {
  const includedUsed = Math.min(f.used, included);
  const includedLeft = Math.max(0, included - f.used);
  const purchasedLeft = f.purchases.reduce((s, p) => s + p.left, 0);
  const held = f.holds.filter((h) => h.id !== exceptHold).reduce((s, h) => s + h.open, 0);
  return {
    cycle: cycle.key,
    renewsOn: cycle.renewsOn,
    included,
    includedUsed: up(includedUsed),
    includedLeft: Math.floor(includedLeft),
    percent: included > 0 ? Math.min(100, Math.round((includedUsed / included) * 1000) / 10) : 100,
    purchasedLeft: Math.floor(purchasedLeft),
    available: Math.floor(includedLeft + purchasedLeft - held),
    byKind: { conversations: up(f.byKind.claude ?? 0), media: up(f.byKind.higgsfield ?? 0) },
  };
}

const includedOf = (s: Awaited<ReturnType<typeof getSettings>>) => (typeof s.credits === "number" && s.credits >= 0 ? s.credits : planOf(s).credits);

/** The business's quota now. The current task's own hold counts as available to it. */
export async function quota(workspaceId: string, tz: string): Promise<Quota> {
  const c = await cycleFor(workspaceId, tz);
  const d = await db();
  return summarize(await figures(d, workspaceId, c.key), includedOf(c.settings), c, currentTask()?.holdId);
}

/** Nothing that costs credits starts once nothing is left. */
export async function assertCredits(workspaceId: string, tz: string) {
  const q = await quota(workspaceId, tz);
  if (q.available <= 0) throw new CreditsExhausted();
  return q;
}

/* ---------- holds and charges ---------- */

/** Work queued per business in this process, so its balance changes run one after another here too. */
const queues = new Map<string, Promise<unknown>>();

/**
 * One balance change at a time per business: a row lock across server instances, and a queue inside this
 * process (where several tasks can share one database connection, so a row lock alone would not separate them).
 */
async function locked<T>(workspaceId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const before = queues.get(workspaceId) ?? Promise.resolve();
  const run = before.catch(() => undefined).then(async () => {
    const d = await db();
    return d.transaction(async (tx) => {
      await tx.execute(sql`select id from workspaces where id = ${workspaceId} for update`);
      return fn(tx);
    });
  });
  queues.set(workspaceId, run);
  try {
    return await run;
  } finally {
    if (queues.get(workspaceId) === run) queues.delete(workspaceId);
  }
}

/**
 * Sets credits aside for work about to start. Returns null when they are not there. With `min`, takes what
 * is available down to that minimum (a conversation turn does not know its cost in advance). The same ref
 * gets the same hold back, so a retry does not set aside twice.
 */
export async function reserve(workspaceId: string, tz: string, ref: string, amount: number, opts: { min?: number } = {}): Promise<{ id: string; amount: number } | null> {
  const c = await cycleFor(workspaceId, tz);
  return locked(workspaceId, async (tx) => {
    const f = await figures(tx, workspaceId, c.key);
    const same = f.holds.find((h) => h.ref === ref);
    if (same) return { id: same.id, amount: same.open };
    const q = summarize(f, includedOf(c.settings), c, currentTask()?.holdId);
    const take = opts.min != null ? Math.min(amount, q.available) : amount;
    if (take <= 0 || take > q.available || take < (opts.min ?? amount)) return null;
    // The app's clock, like the expiry check, so both sides of the comparison agree.
    const [h] = await tx.insert(schema.creditHolds).values({ workspaceId, ref, amount: take, createdAt: new Date() }).returning();
    return { id: h.id, amount: take };
  });
}

export async function rebindHold(holdId: string, ref: string) {
  const d = await db();
  await d.update(schema.creditHolds).set({ ref }).where(eq(schema.creditHolds.id, holdId));
}

export async function release(holdId: string | undefined) {
  if (!holdId) return;
  const d = await db();
  await d.update(schema.creditHolds).set({ releasedAt: new Date() }).where(and(eq(schema.creditHolds.id, holdId), isNull(schema.creditHolds.releasedAt)));
}

/**
 * Records a cost and charges the business for it: from the included quota first, then from bought credits
 * (oldest to expire first). Under a hold, the charge is counted against it.
 */
export async function charge(
  workspaceId: string,
  tz: string,
  opts: { kind: "claude" | "higgsfield"; amount: number; credits: number; detail?: Record<string, unknown>; holdId?: string },
) {
  if (!opts.amount) return;
  const c = await cycleFor(workspaceId, tz);
  const included = includedOf(c.settings);
  await locked(workspaceId, async (tx) => {
    const f = await figures(tx, workspaceId, c.key);
    const [row] = await tx
      .insert(schema.usage)
      .values({ workspaceId, kind: opts.kind, month: c.key, amount: opts.amount, credits: opts.credits, detail: opts.detail })
      .returning({ id: schema.usage.id });
    let beyond = Math.max(0, f.used + opts.credits - included) - Math.max(0, f.used - included);
    for (const p of f.purchases) {
      if (beyond <= 0) break;
      const take = Math.min(beyond, p.left);
      if (take <= 0) continue;
      await tx.insert(schema.creditDraws).values({ workspaceId, purchaseId: p.id, usageId: row.id, amount: take });
      beyond -= take;
    }
    if (opts.holdId) {
      await tx
        .update(schema.creditHolds)
        .set({ consumed: sql`${schema.creditHolds.consumed} + ${opts.credits}` })
        .where(and(eq(schema.creditHolds.id, opts.holdId), eq(schema.creditHolds.workspaceId, workspaceId)));
    }
  });
}

/** Our own cost of work that failed without a usable result: recorded, not charged. */
export async function recordLost(workspaceId: string, tz: string, kind: "claude" | "higgsfield", amount: number, detail?: Record<string, unknown>) {
  if (!amount) return;
  const c = await cycleFor(workspaceId, tz);
  const d = await db();
  await d.insert(schema.usage).values({ workspaceId, kind: `${kind}_lost`, month: c.key, amount, credits: null, detail });
}

/** A task that failed without a usable result: its charges come back to the business (the cost stays ours). */
export async function refundJob(workspaceId: string, jobId: string) {
  await locked(workspaceId, async (tx) => {
    const rows = await tx
      .select({ id: schema.usage.id, kind: schema.usage.kind })
      .from(schema.usage)
      .where(and(eq(schema.usage.workspaceId, workspaceId), isNotNull(schema.usage.credits), sql`${schema.usage.detail}->>'jobId' = ${jobId}`));
    if (!rows.length) return;
    const ids = rows.map((r) => r.id);
    await tx.delete(schema.creditDraws).where(and(eq(schema.creditDraws.workspaceId, workspaceId), inArray(schema.creditDraws.usageId, ids)));
    await tx
      .update(schema.usage)
      .set({ kind: sql`${schema.usage.kind} || '_lost'`, credits: null })
      .where(inArray(schema.usage.id, ids));
  });
}

/* ---------- buying, notices ---------- */

/** Credits the business bought (or was given). Only ever added by an explicit action; nothing buys on its own. */
export async function addPurchase(workspaceId: string, amount: number, reason: string, validMonths = CREDIT_CONFIG.purchasedValidMonths()) {
  if (!(amount > 0)) throw new Error("Credits to add must be positive");
  const expiresAt = validMonths > 0 ? new Date(Date.now() + validMonths * 30.44 * 86_400_000) : null;
  const d = await db();
  const [row] = await d.insert(schema.creditPurchases).values({ workspaceId, amount, reason, expiresAt, createdAt: new Date() }).returning();
  return row;
}

/** The 80% or 95% notice, once per threshold per cycle; null when there is nothing new to say. */
export async function dueNotice(workspaceId: string, q: Quota): Promise<number | null> {
  const s = await getSettings(workspaceId);
  const shown = s.quotaNotices?.cycle === q.cycle ? s.quotaNotices.shown : [];
  const due = THRESHOLDS.filter((t) => q.percent >= t && !shown.includes(t));
  return due.length ? due[due.length - 1] : null;
}

export async function noticeSeen(workspaceId: string, cycle: string, threshold: number) {
  const s = await getSettings(workspaceId);
  const shown = s.quotaNotices?.cycle === cycle ? s.quotaNotices.shown : [];
  await updateSettings(workspaceId, { quotaNotices: { cycle, shown: [...new Set([...shown, ...THRESHOLDS.filter((t) => t <= threshold)])] } });
}
