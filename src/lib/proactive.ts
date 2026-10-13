import "server-only";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { type Category, createConversation, deleteIfEmpty } from "./conversations";
import { activeTurn, enqueue, TurnInProgress } from "./jobs";
import { CHECKIN_KICKOFF } from "./agent/prompt";
import { journeyStatus, recentActivityCount } from "./journey";

/**
 * Mikee reaches out on his own. Every hour the cron asks each business: is there a reason to talk now?
 * Reasons are checked in priority order, at most one new conversation per run, within these limits:
 * quiet hours (21:00 to 08:00 local time), at most MAX_PER_DAY a day, and never twice for the same reason
 * (the `nudges` table holds one row per kind and key).
 */

export const QUIET_FROM = 21;
export const QUIET_UNTIL = 8;
export const MAX_PER_DAY = 2;

export type NudgeKind = "connection" | "failed" | "pending" | "month" | "weekly" | "next_step" | "morning" | "quiet";

export type Nudge = {
  kind: NudgeKind;
  key: string;
  /** Write into this existing conversation (a card's own thread); otherwise open a new one. */
  conversationId?: string;
  title: string;
  category: Category;
  kickoff: string;
  /** Mikee may decide there is nothing worth saying (reply NOTHING), and then nothing is shown. */
  mayStaySilent: boolean;
};

/** Local calendar parts for a timezone. */
export function localParts(tz: string, now: Date) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", weekday: "short", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  return { date, month: `${p.year}-${p.month}`, day: Number(p.day), hour: Number(p.hour), weekday: p.weekday as string, week: isoWeek(date) };
}

function isoWeek(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export const isQuietHour = (hour: number) => hour >= QUIET_FROM || hour < QUIET_UNTIL;

const EVENT = "[Mikee reaching out on his own, not typed by the client]";
const REPLIES = "End with quick replies when there is a natural next step.";

/** Every reason Mikee has to reach out right now, most important first. Pure checks; nothing is written. */
export async function dueNudges(workspaceId: string, tz: string, now = new Date()): Promise<Nudge[]> {
  const d = await db();
  const t = localParts(tz, now);
  const due: Nudge[] = [];

  const meta = await d.query.connections.findFirst({ where: and(eq(schema.connections.workspaceId, workspaceId), eq(schema.connections.provider, "meta")) });
  const metaOk = meta?.status !== "broken";
  if (meta && !metaOk) {
    due.push({
      kind: "connection",
      key: t.date,
      title: "צריך לחבר מחדש את פייסבוק",
      category: "general",
      kickoff: `${EVENT} The connection to her Facebook and Instagram stopped working (${meta.statusReason ?? "access was lost"}). You cannot see results or run anything until she reconnects. Tell her in two short sentences, warmly and without technical words, that she needs to tap "חיבור מחדש" in the settings, and what it protects (her campaigns keep running as they are, but you cannot watch them). Do not call any tools.`,
      mayStaySilent: false,
    });
  }

  // A card that failed and was not retried: explain and offer the fix in its own conversation.
  const failed = await d
    .select()
    .from(schema.proposals)
    .where(and(eq(schema.proposals.workspaceId, workspaceId), eq(schema.proposals.status, "failed"), lt(schema.proposals.finishedAt, new Date(now.getTime() - 2 * 3600_000))))
    .orderBy(desc(schema.proposals.finishedAt))
    .limit(3);
  for (const p of failed) {
    if (!p.conversationId || !(p.result as any)?.retryable) continue;
    due.push({
      kind: "failed",
      key: `${p.id}:${p.attempts}`,
      conversationId: p.conversationId,
      title: String((p.card as any).title ?? ""),
      category: "campaigns",
      kickoff: `${EVENT} The card "${(p.card as any).title}" (id ${p.id}) failed a while ago and was not retried. The error: ${(p.result as any)?.error}. In one or two short sentences, tell her plainly what happened and what you suggest (retry with the button on the card, or a different approach). If the fix needs a new card, have the right specialist prepare it. ${REPLIES}`,
      mayStaySilent: false,
    });
  }

  // A card waiting more than a day: one gentle reminder, in the conversation it came from.
  const pending = await d
    .select()
    .from(schema.proposals)
    .where(and(eq(schema.proposals.workspaceId, workspaceId), eq(schema.proposals.status, "pending"), lt(schema.proposals.createdAt, new Date(now.getTime() - 24 * 3600_000))))
    .orderBy(desc(schema.proposals.createdAt))
    .limit(3);
  for (const p of pending) {
    if (!p.conversationId) continue;
    due.push({
      kind: "pending",
      key: p.id,
      conversationId: p.conversationId,
      title: String((p.card as any).title ?? ""),
      category: "campaigns",
      kickoff: `${EVENT} The card "${(p.card as any).title}" (id ${p.id}) has been waiting for her answer for more than a day. First check quickly that it still makes sense (budget_status, and read_results if it is about a campaign). If it does, remind her in one or two short sentences what it does and why now is a good time. If it no longer makes sense, say so and suggest what to do instead. Do not create a new card unless something changed. ${REPLIES}`,
      mayStaySilent: true,
    });
  }

  if (!metaOk) return due;

  const ws = await d.query.workspaces.findFirst({ where: eq(schema.workspaces.id, workspaceId) });
  if (ws?.stage !== "active") return due;

  if (t.day <= 3 && t.hour >= 9) {
    due.push({
      kind: "month",
      key: t.month,
      title: "סיכום החודש ותוכנית לחודש הבא",
      category: "results",
      kickoff: `${EVENT} A new month started. Ask the analyst for last month's results (spend against the budget, results and cost per result, the best and the weakest campaign or ad, compared with the month before). Write her a short recap: two or three real numbers in context, one thing that worked, one thing to improve. Then suggest the focus for this month in one or two sentences and ask if it fits her plans (a launch, a sale, a season). If a concrete action is clearly worth it, have the right specialist prepare the card. ${REPLIES}`,
      mayStaySilent: false,
    });
  }

  if (t.weekday === "Sun" && t.hour >= 9) {
    due.push({
      kind: "weekly",
      key: t.week,
      title: "סיכום השבוע",
      category: "results",
      kickoff: `${EVENT} It is the start of the week. Ask the analyst for last week against the week before: spend, results, cost per result, the best ad, and the pace against this month's budget. Write a short weekly summary: what happened in two or three sentences with real numbers, and the one thing you suggest for this week, with a card if there is a clear action. ${REPLIES}`,
      mayStaySilent: false,
    });
  }

  // Momentum: nothing new for a few days and nothing waiting, so suggest the next step on the marketing path.
  const waiting = pending.length > 0 || (await d.select({ id: schema.proposals.id }).from(schema.proposals).where(and(eq(schema.proposals.workspaceId, workspaceId), eq(schema.proposals.status, "pending"))).limit(1)).length > 0;
  const j = !waiting && t.hour >= 10 ? await journeyStatus(workspaceId) : null;
  if (j && j.relationship.days >= 3 && (await recentActivityCount(workspaceId, 5)) === 0) {
    const next = j.nextUp[0];
    if (next) {
      due.push({
        kind: "next_step",
        key: t.week,
        title: `הצעד הבא: ${next.title}`,
        category: "campaigns",
        kickoff: `${EVENT} Nothing new has happened in the marketing for a few days and no card is waiting. Look at where the business stands (journey_status) and her focus. Suggest the one next move that fits best right now (the natural candidate is "${next.title}": ${next.why}), in two or three sentences: what you noticed, what you suggest, why now. If she is likely to say yes, have the right specialist prepare the card. If the timing is wrong, reply with exactly: NOTHING. ${REPLIES}`,
        mayStaySilent: true,
      });
    }
  }

  if (t.hour >= QUIET_UNTIL) {
    due.push({ kind: "morning", key: t.date, title: "המלצות של מייקי", category: "results", kickoff: CHECKIN_KICKOFF, mayStaySilent: true });
  }

  // The client has been quiet for a while: reach out with something useful, not a "just checking in".
  const [lastUser] = await d
    .select({ at: schema.messages.createdAt })
    .from(schema.messages)
    .where(and(eq(schema.messages.workspaceId, workspaceId), eq(schema.messages.role, "user"), eq(schema.messages.kind, "chat")))
    .orderBy(desc(schema.messages.id))
    .limit(1);
  if (lastUser && now.getTime() - lastUser.at.getTime() > 4 * 86_400_000) {
    const days = Math.floor((now.getTime() - lastUser.at.getTime()) / 86_400_000);
    due.push({
      kind: "quiet",
      key: lastUser.at.toISOString().slice(0, 10),
      title: "רעיון ממייקי",
      category: "general",
      kickoff: `${EVENT} She has not written in ${days} days. Reach out with one genuinely useful thing: a result worth knowing, an idea for something coming up (a holiday, a season, a product that sells well), or a short question that helps you plan. Check the data first (read_results, read_store) so it is concrete. Two or three sentences, warm, never "just checking in" and never guilt. ${REPLIES}`,
      mayStaySilent: false,
    });
  }

  return due;
}

export type ProactiveResult = { started?: { kind: NudgeKind; key: string; conversationId: string; jobId: string }; skipped?: string };

/**
 * Starts at most one outreach for this business now. The reason is recorded before the job is queued
 * (a unique row), so two cron runs at once cannot both start it; if queueing fails the row is removed
 * and the reason is tried again next hour.
 */
export async function runProactive(workspaceId: string, tz: string, now = new Date()): Promise<ProactiveResult> {
  const t = localParts(tz, now);
  if (isQuietHour(t.hour)) return { skipped: "quiet hours" };
  const d = await db();
  const [{ n }] = await d
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.nudges)
    .where(and(eq(schema.nudges.workspaceId, workspaceId), eq(schema.nudges.day, t.date)));
  if (n >= MAX_PER_DAY) return { skipped: "daily limit" };

  const due = await dueNudges(workspaceId, tz, now);
  if (!due.length) return { skipped: "nothing due" };
  const done = await d
    .select({ kind: schema.nudges.kind, key: schema.nudges.key })
    .from(schema.nudges)
    .where(and(eq(schema.nudges.workspaceId, workspaceId), inArray(schema.nudges.kind, [...new Set(due.map((x) => x.kind))])));
  const seen = new Set(done.map((x) => `${x.kind}|${x.key}`));
  // A weekly or monthly summary already covers this morning's check.
  const covers = due.some((x) => (x.kind === "weekly" || x.kind === "month") && !seen.has(`${x.kind}|${x.key}`));

  for (const nudge of due) {
    if (seen.has(`${nudge.kind}|${nudge.key}`)) continue;
    if (nudge.kind === "morning" && covers) continue;
    if (nudge.conversationId && (await activeTurn(workspaceId, nudge.conversationId))) continue;

    const [claimed] = await d
      .insert(schema.nudges)
      .values({ workspaceId, kind: nudge.kind, key: nudge.key, day: t.date })
      .onConflictDoNothing()
      .returning();
    // Someone else (a parallel cron run) just claimed it: let that run do the talking.
    if (!claimed) return { skipped: "already handled" };

    const conv = nudge.conversationId ? null : await createConversation(workspaceId, { title: nudge.title, category: nudge.category });
    const conversationId = nudge.conversationId ?? conv!.id;
    try {
      const job = await enqueue(workspaceId, "checkin", { conversationId, kickoff: nudge.kickoff, mayStaySilent: nudge.mayStaySilent, nudgeId: claimed.id });
      await d.update(schema.nudges).set({ conversationId }).where(eq(schema.nudges.id, claimed.id));
      if (nudge.kind === "weekly" || nudge.kind === "month") {
        // Record the morning check as handled too, so the same day does not get both.
        await d.insert(schema.nudges).values({ workspaceId, kind: "morning", key: t.date, day: "-" }).onConflictDoNothing();
      }
      return { started: { kind: nudge.kind, key: nudge.key, conversationId, jobId: job.id } };
    } catch (e) {
      await d.delete(schema.nudges).where(eq(schema.nudges.id, claimed.id));
      if (conv) await deleteIfEmpty(conv.id);
      if (e instanceof TurnInProgress) return { skipped: "busy" };
      throw e;
    }
  }
  return { skipped: "already handled" };
}
