/**
 * Intro meetings booked from the site (mikee.co.il/meeting). Times are Israel time, Sunday to Thursday,
 * on the hour. A slot is the text "YYYY-MM-DD HH:MM" in Israel time, so it reads the same everywhere.
 */
export const MEETING_TZ = "Asia/Jerusalem";
export const MEETING_HOURS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];
const WORK_DAYS = new Set([0, 1, 2, 3, 4]); // Sunday to Thursday
const DAYS_AHEAD = 14;
const MIN_LEAD_HOURS = 12;

/** "YYYY-MM-DD HH:MM" for a moment, in Israel time. */
export function israelStamp(at: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: MEETING_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay();

export type MeetingDay = { date: string; slots: string[] };

/** The open slots from `now`: working days in the next two weeks, at least 12 hours ahead, minus taken ones. */
export function meetingDays(now: Date, taken: Iterable<string> = []): MeetingDay[] {
  const busy = new Set(taken);
  const earliest = israelStamp(new Date(now.getTime() + MIN_LEAD_HOURS * 3600_000));
  const today = israelStamp(now).slice(0, 10);
  const days: MeetingDay[] = [];
  for (let i = 0; i <= DAYS_AHEAD; i++) {
    const date = addDays(today, i);
    if (!WORK_DAYS.has(weekday(date))) continue;
    const slots = MEETING_HOURS.map((h) => `${date} ${h}`).filter((s) => s >= earliest && !busy.has(s));
    if (slots.length) days.push({ date, slots });
  }
  return days;
}

export const isOpenSlot = (slot: string, now: Date, taken: Iterable<string> = []) =>
  meetingDays(now, taken).some((d) => d.slots.includes(slot));

const HEB_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

/** "יום שלישי 20.10" */
export function dayLabel(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `יום ${HEB_DAYS[weekday(ymd)]} ${Number(d)}.${Number(m)}`;
}

/** "יום שלישי 20.10 בשעה 10:00" */
export const slotLabel = (slot: string) => `${dayLabel(slot.slice(0, 10))} בשעה ${slot.slice(11)}`;
