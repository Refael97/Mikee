/** Approved Instagram publishing is deferred by our persistent queue, not by Meta. */
export const SCHEDULE_MIN_MS = 10 * 60_000;
export const SCHEDULE_MAX_MS = 30 * 86400_000;
export const SCHEDULE_LATE_MS = 30 * 60_000;

export function postScheduleProblem(at?: string, now = Date.now()): string | null {
  if (!at) return null;
  const time = Date.parse(at);
  if (!Number.isFinite(time) || time < now + SCHEDULE_MIN_MS) return "צריך לבחור מועד בעוד 10 דקות לפחות, כדי להספיק לאשר את הפרסום.";
  if (time > now + SCHEDULE_MAX_MS) return "אפשר לתזמן עד 30 יום קדימה.";
  return null;
}

export function instagramPublishAt(kind: string, action: Record<string, unknown>): Date | undefined {
  if (kind !== "post" || !Array.isArray(action.channels) || !action.channels.includes("instagram") || typeof action.scheduleAt !== "string") return undefined;
  const at = new Date(action.scheduleAt);
  if (!Number.isFinite(at.getTime())) throw new Error("Invalid scheduled publishing time");
  return at;
}
