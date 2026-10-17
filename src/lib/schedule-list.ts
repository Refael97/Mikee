import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "./db";

/** What the client sees as the task, in her words. */
export function scheduleJobTitle(action: Record<string, unknown>): string {
  const channels = Array.isArray(action.channels) ? action.channels.map(String) : [];
  const ig = channels.includes("instagram");
  const fb = channels.includes("facebook");
  if (action.format === "story") return "העלאת סטורי לאינסטגרם";
  if (ig && fb) return "פרסום בפייסבוק ובאינסטגרם";
  if (ig) return "פרסום באינסטגרם";
  if (fb) return "פרסום בפייסבוק";
  return "פרסום מתוזמן";
}

/** Date and time in the business clock, the same way the approval card says them. */
export function scheduleWhen(iso: unknown, timeZone = "Asia/Jerusalem", locale = "he-IL"): string {
  if (typeof iso !== "string") return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const when = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone }).format(date);
  const zone = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "long" }).formatToParts(date).find((p) => p.type === "timeZoneName")?.value;
  return zone ? `${when} (${zone})` : when;
}

export type ScheduledTask = {
  id: string;
  title: string;
  when: string;
  conversationId: string | null;
};

/** Approved future publications for this business, soonest first. Another business's rows never appear. */
export async function listScheduledTasks(workspaceId: string, timeZone = "Asia/Jerusalem", locale = "he-IL"): Promise<ScheduledTask[]> {
  const d = await db();
  const rows = await d
    .select()
    .from(schema.proposals)
    .where(and(eq(schema.proposals.workspaceId, workspaceId), eq(schema.proposals.status, "scheduled")))
    .orderBy(asc(sql`${schema.proposals.action}->>'scheduleAt'`));
  return rows.map((p) => ({
    id: p.id,
    title: scheduleJobTitle(p.action),
    when: scheduleWhen(p.action.scheduleAt, timeZone, locale),
    conversationId: p.conversationId,
  }));
}
