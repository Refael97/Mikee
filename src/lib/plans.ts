/**
 * What each subscription includes. The business can lower its own limits in settings but never raise them
 * above its plan: the plan is set by us (MIKEE admin), not by the client.
 */
export type PlanId = "starter" | "growth" | "pro";

/** credits: Mikee credits a month for everything Mikee does (src/lib/credits.ts); one credit is about a cent of our cost. */
export const PLANS: Record<PlanId, { name: string; storageGb: number; credits: number }> = {
  starter: { name: "בסיסי", storageGb: 2, credits: 1000 },
  growth: { name: "צמיחה", storageGb: 5, credits: 2500 },
  pro: { name: "מקצועי", storageGb: 10, credits: 6000 },
};

const DEFAULT_PLAN = ((process.env.MIKEE_DEFAULT_PLAN as PlanId) in PLANS ? process.env.MIKEE_DEFAULT_PLAN : "growth") as PlanId;
export const planIdOf = (settings: { plan?: string }): PlanId => ((settings.plan as PlanId) in PLANS ? (settings.plan as PlanId) : DEFAULT_PLAN);
export const planOf = (settings: { plan?: string }) => PLANS[planIdOf(settings)];
export const GB = 1024 * 1024 * 1024;
