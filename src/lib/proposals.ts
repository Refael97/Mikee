import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "./db";
import { logActivity } from "./activity";
import { assertWithinBudget, dailyCommit, monthKey } from "./budget";
import { metaContext, money } from "./meta/context";
import { applyChange, currentDailyBudget, describeError, launchCampaign, publishPost } from "./meta/actions";
import { CampaignSpec, ChangeSpec, PostSpec, type ProposalCard } from "./specs";
import { appendMessage } from "./conversation";

const GOAL_HE: Record<CampaignSpec["goal"], string> = {
  sales: "מכירות באתר",
  leads: "פניות",
  traffic: "כניסות לאתר",
  engagement: "מעורבות",
  awareness: "שיכירו אותנו",
};

const CTA_HE: Record<string, string> = {
  SHOP_NOW: "לקנייה",
  LEARN_MORE: "לפרטים",
  SIGN_UP: "להרשמה",
  CONTACT_US: "צרו קשר",
  BOOK_TRAVEL: "להזמנה",
  GET_OFFER: "לקבלת ההטבה",
  ORDER_NOW: "להזמנה",
  SUBSCRIBE: "להצטרפות",
  WHATSAPP_MESSAGE: "שלחו וואטסאפ",
  MESSAGE_PAGE: "שלחו הודעה",
  CALL_NOW: "התקשרו",
  APPLY_NOW: "להגשה",
  DOWNLOAD: "להורדה",
};

const dateHe = (iso?: string) =>
  iso ? new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : undefined;

export function campaignCard(spec: CampaignSpec, currency: string): ProposalCard {
  const when = spec.startTime || spec.endTime
    ? [spec.startTime ? `מ־${dateHe(spec.startTime)}` : "מיד באישור", spec.endTime ? `עד ${dateHe(spec.endTime)}` : "עד שנעצור"].join(" ")
    : "מתחיל מיד באישור, רץ עד שנעצור";
  return {
    kind: "campaign",
    title: spec.title,
    why: spec.why,
    rows: [
      { label: "המטרה", value: GOAL_HE[spec.goal] },
      { label: "תקציב", value: `${money(spec.dailyBudget, currency)} ביום` },
      { label: "למי נגיע", value: spec.audience.description },
      { label: "מתי", value: when },
    ],
    media: spec.ads.map((a) => ({ type: a.media.type, url: a.media.url, text: a.primaryText, headline: a.headline, cta: CTA_HE[a.cta] })),
    approveLabel: "נראה טוב, קדימה",
    changeLabel: "בוא נשנה משהו",
  };
}

export function changeCard(spec: ChangeSpec, currency: string): ProposalCard {
  const c = spec.change;
  const value =
    c.kind === "pause"
      ? "לעצור"
      : c.kind === "resume"
        ? "להפעיל מחדש"
        : c.kind === "end_date"
          ? `לסיים ב־${dateHe(c.endTime)}`
          : c.previous
            ? `מ־${money(c.previous, currency)} ל־${money(c.amount, currency)} ביום`
            : `${money(c.amount, currency)} ביום`;
  return {
    kind: "change",
    title: spec.title,
    why: spec.why,
    rows: [
      { label: "על מה", value: spec.target.name },
      { label: "השינוי", value },
    ],
    approveLabel: "כן, תעשה את זה",
    changeLabel: "לא עכשיו",
  };
}

export function postCard(spec: PostSpec): ProposalCard {
  const where = spec.channels.map((c) => (c === "facebook" ? "פייסבוק" : "אינסטגרם")).join(" + ");
  return {
    kind: "post",
    title: spec.title,
    why: "",
    rows: [
      { label: "איפה", value: where },
      { label: "מתי", value: spec.scheduleAt ? dateHe(spec.scheduleAt)! : "מיד באישור" },
    ],
    media: spec.media.length
      ? spec.media.map((m, i) => ({ type: m.type, url: m.url, text: i === 0 ? spec.text : undefined }))
      : [{ type: "image", url: "", text: spec.text }],
    approveLabel: spec.scheduleAt ? "מתזמנים" : "לפרסם",
    changeLabel: "בוא נשנה משהו",
  };
}

export function budgetCard(amount: number, reason: string, currency: string): ProposalCard {
  return {
    kind: "budget",
    title: "מבקש תוספת תקציב לחודש הזה",
    why: reason,
    rows: [{ label: "תוספת", value: money(amount, currency) }],
    approveLabel: "מאשרת את התוספת",
    changeLabel: "לא החודש",
  };
}

export async function createProposal(
  workspaceId: string,
  kind: ProposalCard["kind"],
  card: ProposalCard,
  action: Record<string, unknown>,
) {
  const d = await db();
  const [row] = await d.insert(schema.proposals).values({ workspaceId, kind, card, action }).returning();
  return row;
}

async function getPending(workspaceId: string, id: string) {
  const d = await db();
  const p = await d.query.proposals.findFirst({
    where: and(eq(schema.proposals.id, id), eq(schema.proposals.workspaceId, workspaceId)),
  });
  if (!p) throw new Error("Proposal not found");
  if (p.status !== "pending") throw new Error("This proposal was already handled");
  return p;
}

async function finish(id: string, status: string, result: Record<string, unknown>) {
  const d = await db();
  await d.update(schema.proposals).set({ status, result, decidedAt: new Date() }).where(eq(schema.proposals.id, id));
}

/** Runs the approved action. Spending is re-checked against the monthly budget at this moment. */
export async function approveProposal(workspaceId: string, tz: string, id: string) {
  const p = await getPending(workspaceId, id);
  const title = String(p.card.title);
  try {
    let result: Record<string, unknown> = {};
    if (p.kind === "budget") {
      const d = await db();
      await d.insert(schema.budgetExtensions).values({
        workspaceId,
        month: monthKey(tz),
        amount: Number(p.action.amount),
        reason: String(p.action.reason),
        status: "approved",
        decidedAt: new Date(),
      });
      result = { approvedAmount: p.action.amount };
    } else {
      const ctx = await metaContext(workspaceId);
      if (p.kind === "campaign") {
        const spec = CampaignSpec.parse(p.action);
        await assertWithinBudget(workspaceId, tz, ctx, dailyCommit(spec.dailyBudget, tz, spec.endTime, spec.startTime));
        result = await launchCampaign(ctx, spec);
      } else if (p.kind === "change") {
        const spec = ChangeSpec.parse(p.action);
        const c = spec.change;
        if ((c.kind === "daily_budget" || c.kind === "resume") && spec.target.type !== "ad") {
          const now = await currentDailyBudget(ctx, spec.target.type, spec.target.id);
          const delta = c.kind === "daily_budget" ? c.amount - now.daily : now.daily;
          await assertWithinBudget(workspaceId, tz, ctx, dailyCommit(Math.max(0, delta), tz, now.end));
        }
        result = { done: await applyChange(ctx, spec) };
      } else if (p.kind === "post") {
        result = await publishPost(ctx, PostSpec.parse(p.action));
      }
    }
    await finish(id, "done", result);
    await logActivity(workspaceId, p.kind, title, result);
    await appendMessage(workspaceId, "user", "event", [
      { type: "text", text: `[Platform event, not typed by the client] The client approved "${title}" and it was carried out successfully. Result: ${JSON.stringify(result)}` },
    ]);
    return { ok: true as const, result };
  } catch (err) {
    const message = describeError(err);
    await finish(id, "failed", { error: message });
    await logActivity(workspaceId, p.kind, `נכשל: ${title}`, { error: message }, false);
    await appendMessage(workspaceId, "user", "event", [
      { type: "text", text: `[Platform event, not typed by the client] The client approved "${title}" but it failed: ${message}. Explain simply and offer a fix.` },
    ]);
    return { ok: false as const, error: message };
  }
}

export async function declineProposal(workspaceId: string, id: string) {
  const p = await getPending(workspaceId, id);
  await finish(id, "declined", {});
  return p;
}
