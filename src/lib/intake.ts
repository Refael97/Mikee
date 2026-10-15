import { z } from "zod";

/**
 * The questions a new business answers right after signing up, before connecting anything. The answers go
 * into the brief so Mikee starts from what the owner told us: what the business is, what she wants help
 * with, the ad budget she has in mind, where marketing stands, the goals and how technical to be.
 * Shared by the screen and the server, so the options exist in one place.
 */

export const BUSINESS = [
  { id: "ecommerce", title: "חנות אונליין", sub: "מוכרים מוצרים באתר" },
  { id: "services", title: "חברה שנותנת שירותים", sub: "לקוחות פונים, ואנחנו נותנים שירות" },
  { id: "local", title: "עסק מקומי", sub: "חנות, קליניקה, סטודיו או מסעדה" },
  { id: "content", title: "מותג אישי או יוצר תוכן", sub: "האנשים עוקבים אחרי מי שעומד מאחורי העסק" },
  { id: "other", title: "אחר", sub: "אספר במילים שלי" },
] as const;

export const HELP = [
  { id: "ads", title: "ניהול קמפיינים ממומנים", sub: "פייסבוק ואינסטגרם" },
  { id: "social", title: "ניהול סושיאל", sub: "פוסטים, סטוריז ותגובות" },
  { id: "content", title: "יצירת תוכן", sub: "תמונות, סרטונים וטקסטים" },
  { id: "strategy", title: "אסטרטגיה שיווקית", sub: "מה עושים, מתי ולמה" },
  { id: "other", title: "אחר", sub: "אספר במילים שלי" },
] as const;

export const STATE = [
  { id: "great", title: "מעולה", sub: "רוצה להמשיך ככה" },
  { id: "good", title: "טוב, אבל אפשר יותר", sub: "יש תוצאות ויש לאן לגדול" },
  { id: "declining", title: "ירידה", sub: "הייתה תקופה טובה, ועכשיו התוצאות יורדות" },
  { id: "starting", title: "התחלה", sub: "רק התחלתי את העסק" },
] as const;

export const GOALS = [
  { id: "leads", title: "לידים ופניות", sub: "אנשים שמשאירים פרטים או כותבים" },
  { id: "sales", title: "מכירות", sub: "רכישות באתר או בחנות" },
  { id: "followers", title: "עוקבים", sub: "קהל שגדל בסושיאל" },
  { id: "engagement", title: "מעורבות בסושיאל", sub: "לייקים, תגובות ושיתופים" },
] as const;

export const KNOWLEDGE = [
  { id: "none", title: "אין לי ידע בשיווק", sub: "אשמח שיובילו אותי צעד אחר צעד" },
  { id: "basic", title: "מבינים שיווק, אבל הטכני לא הצד שלי", sub: "הכיוון ברור לי, ההגדרות פחות" },
  { id: "hands_on", title: "יש לי ניסיון בהרצת קמפיינים", sub: "מכירים את מנהל המודעות" },
  { id: "pro", title: "שיווק זה המקצוע שלי", sub: "אפשר לדבר איתי במונחים מקצועיים" },
] as const;

/** The budget slider moves on these stops: fine steps where most small businesses are, wide ones above. */
export const BUDGET_STOPS = [
  0, 500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7500, 10_000, 12_500, 15_000, 20_000, 25_000, 30_000, 40_000, 50_000, 60_000, 75_000, 100_000,
] as const;
export const BUDGET_MAX = 100_000;

const ids = <T extends readonly { id: string }[]>(list: T) => list.map((o) => o.id) as [T[number]["id"], ...T[number]["id"][]];
const other = z.string().trim().max(120).optional();

export const intakeSchema = z
  .object({
    businessType: z.enum(ids(BUSINESS)),
    businessOther: other,
    help: z.array(z.enum(ids(HELP))).min(1).max(HELP.length),
    helpOther: other,
    adBudget: z
      .object({ min: z.number().int().min(0).max(BUDGET_MAX), max: z.number().int().min(0).max(BUDGET_MAX) })
      .refine((b) => b.min <= b.max, { message: "הטווח לא תקין" }),
    state: z.enum(ids(STATE)),
    goals: z.array(z.enum(ids(GOALS))).min(1).max(GOALS.length),
    knowledge: z.enum(ids(KNOWLEDGE)),
  })
  .refine((v) => v.businessType !== "other" || !!v.businessOther, { path: ["businessOther"], message: "כמה מילים על העסק יעזרו לי להבין" })
  .refine((v) => !v.help.includes("other") || !!v.helpOther, { path: ["helpOther"], message: "כמה מילים על מה שצריך יעזרו לי להבין" });

export type IntakeAnswers = z.infer<typeof intakeSchema>;
export type Intake = IntakeAnswers & { at: string };

const title = <T extends readonly { id: string; title: string }[]>(list: T, id: string) => list.find((o) => o.id === id)?.title ?? id;
const ils = (n: number) => `${n.toLocaleString("en-US")} ILS`;

/** The budget range she gave; answers saved before the range was a single number. */
export function budgetRange(i: Pick<Intake, "adBudget"> | { adBudget: unknown }): { min: number; max: number } {
  const b = i.adBudget as { min?: unknown; max?: unknown } | number | undefined;
  if (typeof b === "number") return { min: b, max: b };
  const min = Number(b?.min) || 0;
  return { min, max: Math.max(min, Number(b?.max) || 0) };
}

const budgetText = ({ min, max }: { min: number; max: number }) =>
  !max ? "none yet" : min === max ? ils(max) : !min ? `up to ${ils(max)}` : `${ils(min)} to ${ils(max)}`;

/** For the brief: what she told us at signup, in plain lines. Her own words are quoted and kept short. */
export function intakeAsText(i: Intake | undefined): string {
  if (!i) return "";
  const own = (s?: string) => (s ? ` ("${s.replace(/["\n\r]/g, " ").slice(0, 120)}")` : "");
  const knowledge: Record<string, string> = {
    none: "no marketing knowledge: lead her step by step, plain words, no jargon",
    basic: "understands marketing but not the technical side: talk strategy plainly, handle the technical parts yourself and keep them out of her way",
    hands_on: "has run campaigns herself: you may use common terms (CPA, ad set, audience) briefly",
    pro: "a marketing professional: be concise and precise, professional terms are fine",
  };
  return [
    `What she told us when she signed up (${i.at.slice(0, 10)}; her answers, update with what you learn since):`,
    `- Business: ${title(BUSINESS, i.businessType)}${own(i.businessOther)}`,
    `- Wants help with: ${i.help.map((h) => title(HELP, h)).join(", ")}${own(i.helpOther)}`,
    `- Monthly budget in mind for paid ads: ${budgetText(budgetRange(i))} (a starting point only; the approved ceiling is the budget in the platform settings)`,
    `- Marketing today: ${title(STATE, i.state)}, ${STATE.find((s) => s.id === i.state)?.sub}`,
    `- Most important to achieve: ${i.goals.map((g) => title(GOALS, g)).join(", ")}`,
    `- Marketing knowledge: ${knowledge[i.knowledge]}`,
  ].join("\n");
}

/** The business type the rest of the platform uses (the marketing path, the results page), when the answer gives one. */
export const businessTypeOf = (i: IntakeAnswers) => (i.businessType === "other" ? undefined : i.businessType);
