import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "./db";

/** The sections of the client's brain. Free text inside each, so Mikee can write naturally. */
export const BRAIN_SECTIONS = {
  business: "What the business is, what it sells, price range, locations, what makes it different",
  audience: "Who buys, what they want, what holds them back, how they talk",
  voice: "Writing style the client likes: tone, emoji, words to use and avoid, example lines she approved",
  products: "Hero products/services, collections, seasonality, what sells best",
  history: "What worked and what did not in past campaigns and posts, with numbers",
  goals: "Business goals, targets, what success means this month and this quarter",
  rules: "Things the client asked never to do, approvals she wants, sensitivities",
  notes: "Anything else worth remembering (events, launches, people, preferences)",
} as const;

export type BrainSection = keyof typeof BRAIN_SECTIONS;
export type Brain = Partial<Record<BrainSection, string>> & { updatedAt?: string };

export async function getBrain(workspaceId: string): Promise<Brain> {
  const d = await db();
  const row = await d.query.brains.findFirst({ where: eq(schema.brains.workspaceId, workspaceId) });
  return { ...(row?.profile as Brain | undefined), updatedAt: row?.updatedAt?.toISOString() };
}

export async function writeBrain(workspaceId: string, section: BrainSection, content: string, mode: "replace" | "append") {
  const d = await db();
  const current = await getBrain(workspaceId);
  const next = mode === "append" && current[section] ? `${current[section]}\n${content}` : content;
  const profile = { ...current, [section]: next };
  delete profile.updatedAt;
  await d
    .insert(schema.brains)
    .values({ workspaceId, profile })
    .onConflictDoUpdate({ target: schema.brains.workspaceId, set: { profile, updatedAt: sql`now()` } });
}

export function brainAsText(brain: Brain): string {
  const filled = (Object.keys(BRAIN_SECTIONS) as BrainSection[]).filter((k) => brain[k]?.trim());
  if (!filled.length) return "(empty - nothing learned about this business yet)";
  return filled.map((k) => `## ${k}\n${brain[k]!.trim()}`).join("\n\n");
}
