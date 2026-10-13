import "server-only";
import { and, asc, eq, ne } from "drizzle-orm";
import { db, schema } from "./db";

/** Topics as the client sees them. Plain sentences under each, never a "memory database". */
export const TOPICS = {
  voice: { title: "איך אנחנו מדברים", hint: "הטון, המילים שאוהבים, מה לא כותבים" },
  business: { title: "מה אנחנו עושים", hint: "מה מוכרים, מה מייחד אותנו" },
  audience: { title: "מי הלקוחות שלנו", hint: "מי קונה, מה חשוב להם" },
  products: { title: "מה חשוב לקדם", hint: "מוצרים ושירותים מרכזיים, עונות" },
  goals: { title: "לאן אנחנו רוצים להגיע", hint: "מה נחשב הצלחה" },
  rules: { title: "מה אף פעם לא", hint: "דברים שמייקי לא יעשה" },
  notes: { title: "מה חשוב לדעת", hint: "אירועים, השקות, העדפות" },
  learnings: { title: "מה למדנו מהתוצאות", hint: "מה עבד ומה פחות, עם תאריך" },
} as const;

export type Topic = keyof typeof TOPICS;
export type Fact = typeof schema.facts.$inferSelect;
export type FactSource = "client" | "website" | "store" | "meta" | "mikee";
export type FactKind = "fact" | "preference" | "rule" | "insight";

/** Insights are observations from results at a point in time; after this long they are treated as stale. */
export const INSIGHT_TTL_DAYS = 60;

/**
 * Saves a sentence. What the client said herself is confirmed; anything Mikee read or concluded is a
 * suggestion until she confirms it. Results-based insights are never stored as rules.
 */
export async function remember(
  workspaceId: string,
  f: { topic: Topic; text: string; kind: FactKind; source: FactSource; sourceDetail?: string; replaces?: string },
) {
  const d = await db();
  const kind: FactKind = f.source !== "client" && f.kind === "rule" ? "insight" : f.kind;
  const status = f.source === "client" ? "confirmed" : "suggested";
  if (f.replaces) {
    await d
      .update(schema.facts)
      .set({ status: "archived", updatedAt: new Date() })
      .where(and(eq(schema.facts.id, f.replaces), eq(schema.facts.workspaceId, workspaceId)));
  }
  const [row] = await d
    .insert(schema.facts)
    .values({
      workspaceId,
      topic: f.topic,
      text: f.text.trim(),
      kind,
      status,
      source: f.source,
      sourceDetail: f.sourceDetail,
      confirmedAt: status === "confirmed" ? new Date() : null,
    })
    .returning();
  return row;
}

export async function listFacts(workspaceId: string, opts: { includeArchived?: boolean } = {}) {
  const d = await db();
  return d
    .select()
    .from(schema.facts)
    .where(and(eq(schema.facts.workspaceId, workspaceId), opts.includeArchived ? undefined : ne(schema.facts.status, "archived")))
    .orderBy(asc(schema.facts.topic), asc(schema.facts.createdAt));
}

export async function setFact(workspaceId: string, id: string, patch: { text?: string; status?: "confirmed" | "archived" }) {
  const d = await db();
  await d
    .update(schema.facts)
    .set({
      ...(patch.text != null ? { text: patch.text.trim(), source: "client", status: "confirmed", confirmedAt: new Date() } : {}),
      ...(patch.status ? { status: patch.status, confirmedAt: patch.status === "confirmed" ? new Date() : undefined } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.facts.id, id), eq(schema.facts.workspaceId, workspaceId)));
}

const SOURCE_HE: Record<string, string> = { client: "את אמרת", website: "מהאתר", store: "מהחנות", meta: "מהתוצאות", mikee: "מסקנה של מייקי" };

export function sourceLabel(f: Fact): string {
  const days = Math.floor((Date.now() - f.observedAt.getTime()) / 86400000);
  const when = days === 0 ? "היום" : days === 1 ? "אתמול" : `לפני ${days} ימים`;
  return `${SOURCE_HE[f.source] ?? f.source} · ${when}`;
}

/** The brain as the model reads it: provenance on every line, stale insights marked. */
export function brainAsText(facts: Fact[]): string {
  if (!facts.length) return "(empty - nothing learned about this business yet)";
  const lines: string[] = [];
  for (const topic of Object.keys(TOPICS) as Topic[]) {
    const rows = facts.filter((f) => f.topic === topic);
    if (!rows.length) continue;
    lines.push(`## ${topic}`);
    for (const f of rows) {
      const age = Math.floor((Date.now() - f.observedAt.getTime()) / 86400000);
      const stale = f.kind === "insight" && age > INSIGHT_TTL_DAYS ? ", STALE" : "";
      lines.push(`- ${f.text} [${f.status}, ${f.kind}, from ${f.source}${f.sourceDetail ? ` (${f.sourceDetail})` : ""}, ${f.observedAt.toISOString().slice(0, 10)}${stale}, id ${f.id}]`);
    }
  }
  return lines.join("\n");
}
