/**
 * What each subscription includes. The business can lower its own limits in settings but never raise them
 * above its plan: the plan is set by us (MIKEE admin), not by the client.
 */
export type PlanId = "starter" | "growth" | "pro";

export const PLANS: Record<PlanId, { name: string; storageGb: number; aiUsd: number; mediaCredits: number }> = {
  starter: { name: "בסיסי", storageGb: 2, aiUsd: 60, mediaCredits: 300 },
  growth: { name: "צמיחה", storageGb: 5, aiUsd: 150, mediaCredits: 1000 },
  pro: { name: "מקצועי", storageGb: 10, aiUsd: 400, mediaCredits: 3000 },
};

const DEFAULT_PLAN = ((process.env.MIKEE_DEFAULT_PLAN as PlanId) in PLANS ? process.env.MIKEE_DEFAULT_PLAN : "growth") as PlanId;
export const planIdOf = (settings: { plan?: string }): PlanId => ((settings.plan as PlanId) in PLANS ? (settings.plan as PlanId) : DEFAULT_PLAN);
export const planOf = (settings: { plan?: string }) => PLANS[planIdOf(settings)];
export const GB = 1024 * 1024 * 1024;
