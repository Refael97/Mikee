/**
 * Date ranges for the campaigns table, the way Ads Manager offers them: quick presets or any two days on a
 * calendar. Dates are plain YYYY-MM-DD days in the business's time zone; "today" is passed in, so the same
 * code runs on the server and in the browser and both agree.
 */
import { type Lang, translator } from "./i18n";

export type RangePreset =
  | "today"
  | "yesterday"
  | "today_yesterday"
  | "last_7d"
  | "last_14d"
  | "last_28d"
  | "last_30d"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "maximum";

export const RANGE_PRESETS: { key: RangePreset; label: string }[] = [
  { key: "today", label: "היום" },
  { key: "yesterday", label: "אתמול" },
  { key: "today_yesterday", label: "היום ואתמול" },
  { key: "last_7d", label: "7 הימים האחרונים" },
  { key: "last_14d", label: "14 הימים האחרונים" },
  { key: "last_28d", label: "28 הימים האחרונים" },
  { key: "last_30d", label: "30 הימים האחרונים" },
  { key: "this_week", label: "השבוע" },
  { key: "last_week", label: "השבוע שעבר" },
  { key: "this_month", label: "החודש" },
  { key: "last_month", label: "החודש שעבר" },
  { key: "maximum", label: "כל התקופה" },
];

export const DEFAULT_PRESET: RangePreset = "last_7d";

/** A range the table reads: a preset (named, its days worked out) or two days picked on the calendar. */
export type DateRange = { preset?: RangePreset; since: string; until: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BACK_DAYS = 37 * 31; // Meta keeps insights for 37 months

/** Today's date where the business is. */
export function todayIn(tz: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

const toDate = (d: string) => new Date(`${d}T00:00:00Z`);
const fromDate = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => fromDate(new Date(toDate(d).getTime() + n * 86400_000));
/** 0 is Sunday: the Israeli week starts on Sunday. */
export const weekday = (d: string) => toDate(d).getUTCDay();
export const isDay = (d: unknown): d is string => typeof d === "string" && DAY.test(d) && fromDate(toDate(d)) === d;

/** The days a preset covers. "Last N days" ends yesterday, like Ads Manager; "maximum" has no fixed days. */
export function presetRange(preset: RangePreset, today: string): { since: string; until: string } {
  const yesterday = addDays(today, -1);
  const month = today.slice(0, 8);
  switch (preset) {
    case "today":
      return { since: today, until: today };
    case "yesterday":
      return { since: yesterday, until: yesterday };
    case "today_yesterday":
      return { since: yesterday, until: today };
    case "last_7d":
    case "last_14d":
    case "last_28d":
    case "last_30d":
      return { since: addDays(today, -Number(preset.match(/\d+/)![0])), until: yesterday };
    case "this_week":
      return { since: addDays(today, -weekday(today)), until: today };
    case "last_week": {
      const end = addDays(today, -weekday(today) - 1);
      return { since: addDays(end, -6), until: end };
    }
    case "this_month":
      return { since: `${month}01`, until: today };
    case "last_month": {
      const end = addDays(`${month}01`, -1);
      return { since: `${end.slice(0, 8)}01`, until: end };
    }
    case "maximum":
      return { since: addDays(today, -MAX_BACK_DAYS), until: today };
  }
}

export const isPreset = (v: unknown): v is RangePreset => RANGE_PRESETS.some((p) => p.key === v);

/** The range in the address, checked: real days, in order, not in the future and not older than Meta keeps. */
export function parseRange(q: { p?: string; since?: string; until?: string }, today: string): DateRange {
  if (isDay(q.since) && isDay(q.until) && q.since <= q.until && q.until <= today && q.since >= addDays(today, -MAX_BACK_DAYS)) {
    return { since: q.since, until: q.until };
  }
  const preset = isPreset(q.p) ? q.p : DEFAULT_PRESET;
  return { preset, ...presetRange(preset, today) };
}

/** The address part for a range: a preset by name (so it moves with the days), or the two days. */
export const rangeQuery = (r: DateRange) => (r.preset ? `p=${r.preset}` : `since=${r.since}&until=${r.until}`);

const MONTHS_SHORT = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];
export const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const MONTHS_SHORT_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The month's name in the interface language. */
export const monthName = (m: number, lang: Lang = "he", short = false) =>
  lang === "he" ? (short ? MONTHS_SHORT : MONTHS)[m] : (short ? MONTHS_SHORT_EN : MONTHS_EN)[m];

const parts = (d: string) => ({ y: Number(d.slice(0, 4)), m: Number(d.slice(5, 7)) - 1, day: Number(d.slice(8, 10)) });
/** "17 בספט׳ 2026" / "17 Sep 2026" */
export const shortDate = (d: string, lang: Lang = "he") => {
  const { y, m, day } = parts(d);
  return lang === "he" ? `${day} ב${MONTHS_SHORT[m]} ${y}` : `${day} ${MONTHS_SHORT_EN[m]} ${y}`;
};
/** "17 בספטמבר 2026" / "17 September 2026" */
export const longDate = (d: string, lang: Lang = "he") => {
  const { y, m, day } = parts(d);
  return lang === "he" ? `${day} ב${MONTHS[m]} ${y}` : `${day} ${MONTHS_EN[m]} ${y}`;
};

/** What the button says: the preset's name and its days, or just the days. */
export function rangeLabel(r: DateRange, lang: Lang = "he"): string {
  const t = translator(lang);
  const days = r.since === r.until ? shortDate(r.since, lang) : `${shortDate(r.since, lang)} ${t("עד")} ${shortDate(r.until, lang)}`;
  if (r.preset === "maximum") return t("כל התקופה");
  const name = RANGE_PRESETS.find((p) => p.key === r.preset)?.label;
  return name ? `${t(name)}: ${days}` : days;
}

/** The days of one month laid out in weeks from Sunday, with blanks before the first. */
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array(weekday(first)).fill(null);
  for (let i = 0; i < days; i++) cells.push(addDays(first, i));
  return cells;
}
