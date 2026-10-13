import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { brainAsText, listFacts } from "../brain";
import { getConnection, type MetaConfig, type StoreConfig, type WebsiteConfig } from "../connections";
import { appendMany, type Kind, loadHistory } from "../conversation";
import { openAndRecent } from "../proposals";
import { AiBudgetExceeded, assertAiBudget, claudeCostUsd, recordUsage } from "../usage";
import { MIKEE_CONSTITUTION, stageInstructions } from "./prompt";
import { runTool, TOOL_DEFINITIONS } from "./tools";

export const MODEL = "claude-opus-5-5";
const MAX_STEPS = 40;

export type AgentEvent =
  | { t: "text"; v: string }
  | { t: "tool"; name: string; state: "start" | "done" | "error" }
  | { t: "proposal"; id: string }
  | { t: "done" }
  | { t: "error"; message: string };

export type Row = { role: "user" | "assistant"; kind: Kind; content: unknown[] };

let client: Pick<Anthropic, "beta"> | null = null;
const anthropic = () => (client ??= new Anthropic());

/** Tests only: replace the Claude client with a scripted fake. */
export function setAnthropicForTests(fake: unknown) {
  client = fake as Pick<Anthropic, "beta">;
}

async function situation(workspaceId: string, stage: string, tz: string): Promise<string> {
  const [facts, meta, site, store, cards] = await Promise.all([
    listFacts(workspaceId),
    getConnection<MetaConfig>(workspaceId, "meta"),
    getConnection<WebsiteConfig>(workspaceId, "website"),
    getConnection<StoreConfig>(workspaceId, "store"),
    openAndRecent(workspaceId),
  ]);
  const m = meta?.config;
  const today = new Intl.DateTimeFormat("he-IL", { timeZone: tz, dateStyle: "full", timeStyle: "short" }).format(new Date());
  const connections = [
    meta?.status === "broken" ? `!! Facebook/Instagram access is LOST: ${meta.statusReason}. Tell the client to reconnect in Settings.` : "",
    m?.adAccountId ? `Ad account: ${m.adAccountName ?? ""} (${m.adAccountId}), currency ${m.currency ?? "ILS"}` : "Ad account: not connected",
    m?.pageId ? `Facebook page: ${m.pageName ?? ""} (${m.pageId})` : "Facebook page: not connected",
    m?.igUserId ? `Instagram: @${m.igUsername ?? ""} (${m.igUserId})` : "Instagram: not connected",
    m?.pixelId ? `Website pixel: ${m.pixelId}` : "Website pixel: none",
    m?.catalogId ? `Product catalog: ${m.catalogId}` : "Product catalog: none",
    site?.config.url ? `Website: ${site.config.url} (${site.config.platform ?? "unknown platform"})` : "Website: not connected",
    store?.config.domain ? `Store orders: ${store.config.platform} connected` : "Store orders: not connected",
  ]
    .filter(Boolean)
    .join("\n");
  const open = cards.filter((c) => c.status === "pending");
  const recent = cards.filter((c) => c.status !== "pending").slice(0, 12);
  const cardLines = [
    open.length ? "Waiting for the client (do not suggest these again; refer to them):" : "No cards are waiting for the client.",
    ...open.map((c) => `- [${c.kind}] "${c.card.title}" id ${c.id}, since ${c.createdAt.toISOString().slice(0, 16)}`),
    ...(recent.length ? ["Recently decided:", ...recent.map((c) => `- [${c.kind}] "${c.card.title}": ${c.status} ${c.decidedAt?.toISOString().slice(0, 10) ?? ""}`)] : []),
  ].join("\n");
  return `# Now\n${today} (${tz})\n\n# Connections (internal, never show ids to the client)\n${connections}\n\n# Cards\n${cardLines}\n\n${stageInstructions(stage)}\n\n# Brain\n${brainAsText(facts)}`;
}

/**
 * Runs Mikee for one turn inside a background job. After each completed step the new rows are saved to
 * the job's state, so if the process restarts the turn continues from there instead of starting over.
 * The rows are appended to the conversation together at the end, so the saved history is always valid.
 */
export async function runMikee(opts: {
  workspaceId: string;
  /** Rows to add before Mikee answers (a kickoff instruction). The client's own message is already stored. */
  prepend?: Row[];
  resume?: Row[];
  saveState?: (pending: Row[]) => Promise<void>;
  emit?: (e: AgentEvent) => void | Promise<void>;
  discardIf?: (text: string) => boolean;
}): Promise<string> {
  const { workspaceId } = opts;
  const emit = async (e: AgentEvent) => {
    await opts.emit?.(e);
  };
  const d = await db();
  const ws = await d.query.workspaces.findFirst({ where: eq(schema.workspaces.id, workspaceId) });
  if (!ws) throw new Error("Workspace not found");

  const history = await loadHistory(workspaceId);
  const pending: Row[] = opts.resume?.length ? [...opts.resume] : [...(opts.prepend ?? [])];
  let written = "";
  let failed = false;

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      await assertAiBudget(workspaceId, ws.timezone);
      const stage = (await d.query.workspaces.findFirst({ where: eq(schema.workspaces.id, workspaceId) }))?.stage ?? ws.stage;
      const stream = anthropic().beta.messages.stream({
        model: MODEL,
        max_tokens: 64000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        system: [
          { type: "text", text: MIKEE_CONSTITUTION, cache_control: { type: "ephemeral" } },
          { type: "text", text: await situation(workspaceId, stage, ws.timezone) },
        ],
        messages: [...history, ...pending.map((r) => ({ role: r.role, content: r.content as Anthropic.Beta.BetaContentBlockParam[] }))],
        // Only our own tools plus web search/fetch. No MCP servers: anything that costs money goes through the platform.
        tools: [
          ...TOOL_DEFINITIONS,
          { type: "web_search_20260209", name: "web_search", max_uses: 5 },
          { type: "web_fetch_20260209", name: "web_fetch", max_uses: 5 },
        ],
        context_management: { edits: [{ type: "compact_20260112" }] },
        fallbacks: "default",
        betas: ["server-side-fallback-2026-07-01", "compact-2026-01-12"],
      });
      stream.on("text", (delta) => {
        written += delta;
        void emit({ t: "text", v: delta });
      });

      const message = await stream.finalMessage();
      await recordUsage(workspaceId, ws.timezone, "claude", claudeCostUsd(message.usage), { model: message.model, step });
      pending.push({ role: "assistant", kind: "chat", content: message.content });

      if (message.stop_reason === "pause_turn") continue;
      if (message.stop_reason === "refusal") {
        await emit({ t: "error", message: "מייקי לא יכול לעזור בבקשה הזאת." });
        break;
      }
      const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (!toolUses.length) break;
      if (message.stop_reason === "max_tokens") {
        pending.pop(); // never run tools from a cut-off answer
        throw new Error("Mikee's answer was cut off");
      }

      const results = await Promise.all(
        toolUses.map(async (b) => {
          await emit({ t: "tool", name: b.name, state: "start" });
          const r = await runTool({ workspaceId, tz: ws.timezone }, b.name, b.input);
          await emit({ t: "tool", name: b.name, state: r.isError ? "error" : "done" });
          const pid = /"proposalId":"([0-9a-f-]{36})"/.exec(r.content)?.[1];
          if (pid) await emit({ t: "proposal", id: pid });
          return { type: "tool_result" as const, tool_use_id: b.id, content: r.content, is_error: r.isError || undefined };
        }),
      );
      pending.push({ role: "user", kind: "chat", content: results });
      await opts.saveState?.(pending);
    }
  } catch (err) {
    failed = true;
    console.error("[mikee] turn failed", err);
    const message =
      err instanceof AiBudgetExceeded
        ? err.message
        : err instanceof Anthropic.RateLimitError
          ? "מייקי עמוס כרגע, נסי שוב בעוד דקה."
          : err instanceof Anthropic.APIError
            ? `תקלה זמנית בחיבור למייקי (${err.status}). נסי שוב בעוד רגע.`
            : "משהו השתבש אצלי. נסי שוב בעוד רגע.";
    await emit({ t: "error", message });
  }

  // Save only complete turns: drop a trailing assistant message whose tool calls never got results.
  const last = pending[pending.length - 1];
  if (last?.role === "assistant" && (last.content as any[]).some((b) => b?.type === "tool_use")) pending.pop();
  if (!opts.discardIf?.(written) || failed) await appendMany(workspaceId, pending);
  await emit({ t: "done" });
  return written;
}
