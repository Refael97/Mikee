import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "./db";
import type { ProposalCard } from "./specs";

type Block = Anthropic.Beta.BetaContentBlockParam;
export type Kind = "chat" | "event" | "kickoff";

export async function appendMessage(workspaceId: string, role: "user" | "assistant", kind: Kind, content: Block[] | unknown[]) {
  const d = await db();
  await d.insert(schema.messages).values({ workspaceId, role, kind, content: content as unknown[] });
}

export async function appendMany(workspaceId: string, rows: { role: "user" | "assistant"; kind: Kind; content: unknown[] }[]) {
  if (!rows.length) return;
  const d = await db();
  await d.insert(schema.messages).values(rows.map((r) => ({ workspaceId, ...r })));
}

/** Full conversation in Claude API shape. Consecutive same-role turns are merged by the API. */
export async function loadHistory(workspaceId: string): Promise<Anthropic.Beta.BetaMessageParam[]> {
  const d = await db();
  const rows = await d
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.workspaceId, workspaceId))
    .orderBy(asc(schema.messages.id));
  return rows.map((r) => ({ role: r.role, content: r.content as Block[] }));
}

export type TimelineItem =
  | { type: "user"; id: string; text: string }
  | { type: "mikee"; id: string; text: string }
  | { type: "activity"; id: string; label: string }
  | { type: "card"; id: string; proposal: CardView };

export type CardView = { id: string; status: string; version: string; card: ProposalCard; error?: string; retryable?: boolean };

/** Labels for what Mikee is doing behind the scenes, as the client sees it. */
export const TOOL_LABELS: Record<string, string> = {
  remember: "מייקי רשם לעצמו",
  forget: "מייקי עדכן את מה שהוא יודע",
  scan_website: "מייקי קרא את האתר",
  read_store: "מייקי בדק את החנות",
  read_results: "מייקי בדק את התוצאות",
  read_insights: "מייקי העמיק בנתונים",
  read_social: "מייקי עבר על הפוסטים",
  budget_status: "מייקי בדק את התקציב",
  search_targeting: "מייקי חיפש קהלים",
  list_audiences: "מייקי בדק את הקהלים השמורים",
  meta_read: "מייקי בדק משהו מאחורי הקלעים",
  meta_write: "מייקי סידר משהו מאחורי הקלעים",
  set_stage: "",
  // The team stays invisible: the client sees what is being done, not who does it.
  ask_copywriter: "מייקי כתב טקסטים",
  ask_media_buyer: "מייקי עבד על הקמפיינים",
  ask_creative: "מייקי הכין ויז׳ואל",
  ask_social: "מייקי הכין פוסט",
  ask_analyst: "מייקי ניתח את התוצאות",
  web_search: "מייקי חיפש ברשת",
  web_fetch: "מייקי קרא עמוד ברשת",
};

/** What the chat screen shows: plain bubbles, quiet activity notes, and proposal cards. */
export async function timeline(workspaceId: string): Promise<TimelineItem[]> {
  const d = await db();
  const rows = await d
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.workspaceId, workspaceId))
    .orderBy(asc(schema.messages.id));

  // Proposal ids come back inside tool results (a specialist's task can create several);
  // map them to the tool call that created them.
  const proposalByToolUse = new Map<string, string[]>();
  for (const r of rows) {
    if (r.role !== "user") continue;
    for (const b of r.content as any[]) {
      if (b?.type !== "tool_result" || b.is_error) continue;
      const text = typeof b.content === "string" ? b.content : b.content?.map((c: any) => c.text).join("");
      const found = [...new Set([...(text ?? "").matchAll(/"proposalId":"([0-9a-f-]{36})"/g)].map((m) => m[1]))];
      if (found.length) proposalByToolUse.set(b.tool_use_id, found);
    }
  }
  const ids = [...proposalByToolUse.values()].flat();
  const proposals = ids.length
    ? await d.select().from(schema.proposals).where(inArray(schema.proposals.id, ids))
    : [];
  const byId = new Map(proposals.map((p) => [p.id, p]));

  const items: TimelineItem[] = [];
  for (const r of rows) {
    if (r.kind !== "chat") continue;
    const blocks = r.content as any[];
    if (r.role === "user") {
      const text = blocks.filter((b) => b?.type === "text").map((b) => b.text).join("\n").trim();
      if (text) items.push({ type: "user", id: `m${r.id}`, text });
      continue;
    }
    const seen = new Set<string>();
    blocks.forEach((b, i) => {
      const id = `m${r.id}-${i}`;
      if (b?.type === "text" && b.text.trim()) items.push({ type: "mikee", id, text: b.text });
      if (b?.type === "tool_use" || b?.type === "server_tool_use" || b?.type === "mcp_tool_use") {
        const label0 = TOOL_LABELS[b.name];
        const cards = (proposalByToolUse.get(b.id) ?? []).map((pid) => byId.get(pid)).filter(Boolean) as (typeof proposals)[number][];
        if (cards.length) {
          if (label0 && !seen.has(label0) && b.name.startsWith("ask_")) {
            seen.add(label0);
            items.push({ type: "activity", id: `${id}-label`, label: label0 });
          }
          for (const p of cards) {
            items.push({
              type: "card",
              id: `${id}-${p.id}`,
              proposal: {
                id: p.id,
                status: p.status,
                version: p.versionHash,
                card: p.card as ProposalCard,
                error: (p.result as any)?.error,
                retryable: (p.result as any)?.retryable,
              },
            });
          }
          return;
        }
        const label = b.type === "mcp_tool_use" ? "מייקי יצר מדיה" : TOOL_LABELS[b.name];
        if (label && !seen.has(label)) {
          seen.add(label);
          const prev = items[items.length - 1];
          // Fold consecutive notes into one quiet line: "מייקי בדק את התוצאות · את החנות"
          if (prev?.type === "activity") prev.label += ` · ${label.replace(/^מייקי \S+ /, "")}`;
          else items.push({ type: "activity", id, label });
        }
      }
    });
  }
  return items;
}
