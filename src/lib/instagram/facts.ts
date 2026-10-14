import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "../db";
import type { FactTopic, WorkspaceSettings } from "../db/schema";
import { getSettings, updateSettings } from "../settings";

/**
 * The business facts the client approved (address, opening hours, phone, website, and other short
 * answers). Only she writes them, in Settings; nothing Mikee read from a website scan counts until she
 * enters or confirms it here. Automatic Instagram replies may use these and nothing else.
 */
export const FACT_TOPICS: FactTopic[] = ["address", "hours", "phone", "website", "other"];

export const TOPIC_LABEL: Record<FactTopic, string> = {
  address: "כתובת",
  hours: "שעות פתיחה",
  phone: "טלפון",
  website: "אתר",
  other: "מידע נוסף",
};

export type Fact = typeof schema.businessFacts.$inferSelect;
export type FactInput = { topic: FactTopic; label?: string | null; value: string };

export async function listFacts(workspaceId: string): Promise<Fact[]> {
  const d = await db();
  return d.query.businessFacts.findMany({ where: eq(schema.businessFacts.workspaceId, workspaceId), orderBy: [asc(schema.businessFacts.topic), asc(schema.businessFacts.approvedAt)] });
}

/** Replaces the business's facts with the list the client saved (approved by her, now). */
export async function saveFacts(workspaceId: string, userId: string, facts: FactInput[]): Promise<Fact[]> {
  const clean = facts
    .map((f) => ({ topic: f.topic, label: f.label?.trim().slice(0, 60) || null, value: f.value.trim().slice(0, 400) }))
    .filter((f) => FACT_TOPICS.includes(f.topic) && f.value)
    .slice(0, 40);
  const d = await db();
  await d.transaction(async (tx) => {
    await tx.delete(schema.businessFacts).where(eq(schema.businessFacts.workspaceId, workspaceId));
    if (clean.length) await tx.insert(schema.businessFacts).values(clean.map((f) => ({ ...f, workspaceId, approvedBy: userId })));
  });
  return listFacts(workspaceId);
}

export type AutoReply = NonNullable<WorkspaceSettings["instagramAutoReply"]>;

export async function autoReplySettings(workspaceId: string): Promise<AutoReply> {
  const s = await getSettings(workspaceId);
  return s.instagramAutoReply ?? { enabled: false, topics: [], updatedAt: "" };
}

export async function setAutoReply(workspaceId: string, patch: Partial<AutoReply>): Promise<AutoReply> {
  const current = await autoReplySettings(workspaceId);
  const next: AutoReply = {
    ...current,
    ...patch,
    topics: (patch.topics ?? current.topics).filter((t) => FACT_TOPICS.includes(t)),
    updatedAt: new Date().toISOString(),
  };
  await updateSettings(workspaceId, { instagramAutoReply: next });
  return next;
}
