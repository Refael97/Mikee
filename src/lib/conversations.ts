import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "./db";
import type { Category } from "./db/schema";

export type { Category };

export const CATEGORIES: Record<Category, { title: string; hint: string }> = {
  campaigns: { title: "קמפיינים", hint: "מודעות ממומנות, תקציבים, קהלים" },
  content: { title: "תוכן ופוסטים", hint: "פוסטים, רילס, טקסטים, תמונות" },
  results: { title: "תוצאות ונתונים", hint: "ביצועים, דוחות, המלצות" },
  business: { title: "העסק", hint: "מוצרים, מטרות, מותג" },
  general: { title: "כללי", hint: "כל השאר" },
};

export const CATEGORY_ORDER: Category[] = ["campaigns", "content", "results", "business", "general"];

const KEYWORDS: [Category, RegExp][] = [
  ["campaigns", /קמפיי|מודע|ממומן|תקציב|קהל|פרסום|לידים|פניות|ממיר|קידום|לקדם|ads?\b|campaign/i],
  ["content", /פוסט|רילס|ריל|סטורי|תוכן|קרוסלה|כיתוב|טקסט|קופי|תמונה|סרטון|וידאו|אינסטגרם|post|reel|story/i],
  ["results", /תוצא|ביצוע|דוח|נתונ|איך הולך|איך היה|מכירות|הכנסות|עלות ל|החזר|השבוע|החודש|insight/i],
  ["business", /מוצר|קולקצי|מלאי|מחיר|מותג|הסגנון|קהל היעד|מטרה|מטרות|העסק|אתר/i],
];

/** A fast first guess so a new conversation lands in a sensible place at once; Mikee refines it in his first turn. */
export function guessCategory(text: string): Category {
  let best: Category = "general";
  let score = 0;
  for (const [cat, re] of KEYWORDS) {
    const hits = text.match(new RegExp(re.source, "gi"))?.length ?? 0;
    if (hits > score) {
      best = cat;
      score = hits;
    }
  }
  return best;
}

export function titleFrom(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 42 ? `${t.slice(0, 40).trimEnd()}…` : t || "שיחה חדשה";
}

export async function createConversation(workspaceId: string, opts: { title?: string; category?: Category; firstText?: string } = {}) {
  const d = await db();
  const [row] = await d
    .insert(schema.conversations)
    .values({
      workspaceId,
      title: opts.title ?? (opts.firstText ? titleFrom(opts.firstText) : "שיחה חדשה"),
      category: opts.category ?? (opts.firstText ? guessCategory(opts.firstText) : "general"),
    })
    .returning();
  return row;
}

export async function getConversation(workspaceId: string, id: string) {
  const d = await db();
  return d.query.conversations.findFirst({ where: and(eq(schema.conversations.id, id), eq(schema.conversations.workspaceId, workspaceId)) });
}

export async function listConversations(workspaceId: string, limit = 200) {
  const d = await db();
  return d
    .select()
    .from(schema.conversations)
    .where(and(eq(schema.conversations.workspaceId, workspaceId), eq(schema.conversations.archived, false)))
    .orderBy(desc(schema.conversations.updatedAt))
    .limit(limit);
}

export async function touchConversation(id: string) {
  const d = await db();
  await d.update(schema.conversations).set({ updatedAt: new Date() }).where(eq(schema.conversations.id, id));
}

/** Mikee files a conversation. A category the client chose herself is never overridden. */
export async function fileConversation(workspaceId: string, id: string, f: { title?: string; category?: Category }) {
  const d = await db();
  const conv = await getConversation(workspaceId, id);
  if (!conv) return null;
  await d
    .update(schema.conversations)
    .set({
      ...(f.title ? { title: titleFrom(f.title) } : {}),
      ...(f.category && conv.auto ? { category: f.category } : {}),
    })
    .where(eq(schema.conversations.id, id));
  return getConversation(workspaceId, id);
}

/** The client's own changes: moving it to a category locks the filing. */
export async function updateConversation(workspaceId: string, id: string, patch: { title?: string; category?: Category; archived?: boolean }) {
  const d = await db();
  await d
    .update(schema.conversations)
    .set({
      ...(patch.title ? { title: titleFrom(patch.title) } : {}),
      ...(patch.category ? { category: patch.category, auto: false } : {}),
      ...(patch.archived != null ? { archived: patch.archived } : {}),
    })
    .where(and(eq(schema.conversations.id, id), eq(schema.conversations.workspaceId, workspaceId)));
}

export async function deleteIfEmpty(id: string) {
  const d = await db();
  const [{ n }] = await d.select({ n: sql<number>`count(*)::int` }).from(schema.messages).where(eq(schema.messages.conversationId, id));
  if (!n) await d.delete(schema.conversations).where(eq(schema.conversations.id, id));
}

/** For Mikee's brief: what else has been discussed lately, so a new conversation does not start blind. */
export async function recentConversationsText(workspaceId: string, exceptId?: string) {
  const rows = (await listConversations(workspaceId, 12)).filter((c) => c.id !== exceptId);
  if (!rows.length) return "No other conversations yet.";
  return rows.map((c) => `- [${c.category}] "${c.title}" (${c.updatedAt.toISOString().slice(0, 10)})`).join("\n");
}
