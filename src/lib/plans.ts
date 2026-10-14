/**
 * What each subscription includes. The plan is set by us (MIKEE admin, `npm run set-plan`), not by the client.
 *
 * AI plans: the price and the Mikee credits included each billing cycle. A credit is a fixed unit (one cent
 * of our cost, src/lib/credits.ts) in every plan; the plan only decides how many are included. The amounts
 * live here and in MIKEE_PLAN_CREDITS (JSON, e.g. {"ai_299":2700,"ai_499":6700}), never in the screens.
 *
 * Human guidance is a separate add-on on top of any AI plan. It does not change the AI quota.
 */
export type PlanId = "ai_299" | "ai_499";

const DEFAULT_CREDITS: Record<PlanId, number> = {
  // About ₪100 and ₪249 of provider cost a cycle at a cent a credit.
  ai_299: 2700,
  ai_499: 6700,
};

function configuredCredits(): Record<PlanId, number> {
  try {
    const raw = JSON.parse(process.env.MIKEE_PLAN_CREDITS ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(
      (Object.keys(DEFAULT_CREDITS) as PlanId[]).map((id) => {
        const n = Number(raw[id]);
        return [id, Number.isFinite(n) && n >= 0 ? n : DEFAULT_CREDITS[id]];
      }),
    ) as Record<PlanId, number>;
  } catch {
    return DEFAULT_CREDITS;
  }
}

const BASE: Record<PlanId, { name: string; priceIls: number; storageGb: number }> = {
  ai_299: { name: "מייקי AI", priceIls: 299, storageGb: 2 },
  ai_499: { name: "מייקי AI פלוס", priceIls: 499, storageGb: 5 },
};

export const PLANS = (): Record<PlanId, { name: string; priceIls: number; storageGb: number; credits: number }> => {
  const credits = configuredCredits();
  return {
    ai_299: { ...BASE.ai_299, credits: credits.ai_299 },
    ai_499: { ...BASE.ai_499, credits: credits.ai_499 },
  };
};

/** Plans from before the AI plans keep working, on the nearest AI plan. */
const LEGACY: Record<string, PlanId> = { starter: "ai_299", growth: "ai_499", pro: "ai_499" };

const isPlan = (v: unknown): v is PlanId => v === "ai_299" || v === "ai_499";
const DEFAULT_PLAN: PlanId = isPlan(process.env.MIKEE_DEFAULT_PLAN) ? process.env.MIKEE_DEFAULT_PLAN : LEGACY[process.env.MIKEE_DEFAULT_PLAN ?? ""] ?? "ai_499";

export const planIdOf = (settings: { plan?: string }): PlanId => (isPlan(settings.plan) ? settings.plan : LEGACY[settings.plan ?? ""] ?? DEFAULT_PLAN);
export const planOf = (settings: { plan?: string }) => PLANS()[planIdOf(settings)];
export const GB = 1024 * 1024 * 1024;

/**
 * Human guidance, sold on top of an AI plan. What a call includes is written out so nothing is vague: the
 * weekly add-on is four calls a month, also in a month with five weeks.
 */
export const GUIDANCE = {
  monthly: {
    name: "ליווי חודשי",
    priceIls: 350,
    callsPerMonth: 1,
    callMinutes: 60,
  },
  weekly: {
    name: "ליווי שבועי",
    priceIls: 999,
    callsPerMonth: 4,
    callMinutes: 45,
  },
} as const;

/** What every guidance call includes, in the client's words. */
export const GUIDANCE_INCLUDES = [
  "סקירה של התוצאות והכנה לשיחה",
  "אסטרטגיה והמלצות תוכן",
  "כיוון של מייקי, בחירת סקילים ושיפור ההגדרות",
  "תוכנית פעולה שמייקי ממשיך לבצע אחרי השיחה",
  "מענה לשאלות בכתב בין השיחות, תוך יום עסקים",
];
