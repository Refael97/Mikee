import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db, schema } from "../db";
import { brainAsText, getBrain } from "../brain";
import { getConnection, type MetaConfig, type StoreConfig, type WebsiteConfig } from "../connections";
import { appendMany, type Kind, loadHistory } from "../conversation";
import { MIKEE_CONSTITUTION, stageInstructions } from "./prompt";
import { runTool, TOOL_DEFINITIONS } from "./tools";

const MODEL = "claude-opus-5-5";
const MAX_STEPS = 40;

export type AgentEvent =
  | { t: "text"; v: string }
  | { t: "tool"; name: string; state: "start" | "done" | "error" }
  | { t: "proposal"; id: string }
  | { t: "done" }
  | { t: "error"; message: string };

type Row = { role: "user" | "assistant"; kind: Kind; content: unknown[] };

const client = new Anthropic();

async function situation(workspaceId: string, stage: string, tz: string): Promise<string> {
  const [brain, meta, site, store] = await Promise.all([
    getBrain(workspaceId),
    getConnection<MetaConfig>(workspaceId, "meta"),
    getConnection<WebsiteConfig>(workspaceId, "website"),
    getConnection<StoreConfig>(workspaceId, "store"),
  ]);
  const m = meta?.config;
  const today = new Intl.DateTimeFormat("he-IL", { timeZone: tz, dateStyle: "full", timeStyle: "short" }).format(new Date());
  const connections = [
    m?.adAccountId ? `Ad account: ${m.adAccountName ?? ""} (${m.adAccountId}), currency ${m.currency ?? "ILS"}` : "Ad account: not connected",
    m?.pageId ? `Facebook page: ${m.pageName ?? ""} (${m.pageId})` : "Facebook page: not connected",
    m?.igUserId ? `Instagram: @${m.igUsername ?? ""} (${m.igUserId})` : "Instagram: not connected",
    m?.pixelId ? `Website pixel: ${m.pixelId}` : "Website pixel: none selected",
    m?.catalogId ? `Product catalog: ${m.catalogId}` : "Product catalog: none selected",
    site?.config.url ? `Website: ${site.config.url} (${site.config.platform ?? "unknown platform"})` : "Website: not connected",
    store?.config.domain ? `Store orders: ${store.config.platform} connected` : "Store orders: not connected",
  ].join("\n");
  return `# Now\n${today} (${tz})\n\n# Connections (internal, never show ids to the client)\n${connections}\n\n${stageInstructions(stage)}\n\n# Brain\n${brainAsText(brain)}`;
}

/** One-at-a-time lock per workspace so a scheduled check-in never interleaves with a live chat. */
export async function acquire(workspaceId: string, minutes = 10): Promise<boolean> {
  const d = await db();
  const now = new Date();
  const res = await d
    .update(schema.workspaces)
    .set({ busyUntil: new Date(now.getTime() + minutes * 60000) })
    .where(and(eq(schema.workspaces.id, workspaceId), or(isNull(schema.workspaces.busyUntil), lt(schema.workspaces.busyUntil, now))))
    .returning({ id: schema.workspaces.id });
  return res.length > 0;
}

export async function release(workspaceId: string) {
  const d = await db();
  await d.update(schema.workspaces).set({ busyUntil: null }).where(eq(schema.workspaces.id, workspaceId));
}

function requestTools(): Anthropic.Beta.BetaToolUnion[] {
  const tools: Anthropic.Beta.BetaToolUnion[] = [
    ...TOOL_DEFINITIONS,
    { type: "web_search_20260209", name: "web_search", max_uses: 5 },
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: 5 },
  ];
  if (process.env.HIGGSFIELD_MCP_URL) tools.push({ type: "mcp_toolset", mcp_server_name: "higgsfield" });
  return tools;
}

function mcpServers(): Anthropic.Beta.BetaRequestMCPServerURLDefinition[] | undefined {
  if (!process.env.HIGGSFIELD_MCP_URL) return undefined;
  return [
    {
      type: "url",
      name: "higgsfield",
      url: process.env.HIGGSFIELD_MCP_URL,
      authorization_token: process.env.HIGGSFIELD_MCP_TOKEN || undefined,
    },
  ];
}

/**
 * Runs Mikee for one turn: the new input is appended, then the model and tools loop until Mikee is done.
 * New messages are stored together at the end so the saved history is always a valid conversation.
 * Returns the text Mikee wrote (used by the check-in to detect "NOTHING").
 */
export async function runMikee(opts: {
  workspaceId: string;
  input: { kind: Kind; text: string };
  emit?: (e: AgentEvent) => void;
  /** Drop the whole turn instead of saving it (used when a check-in has nothing to say). */
  discardIf?: (text: string) => boolean;
}): Promise<string> {
  const { workspaceId, emit = () => {} } = opts;
  const d = await db();
  const ws = await d.query.workspaces.findFirst({ where: eq(schema.workspaces.id, workspaceId) });
  if (!ws) throw new Error("Workspace not found");

  const history = await loadHistory(workspaceId);
  const pending: Row[] = [{ role: "user", kind: opts.input.kind, content: [{ type: "text", text: opts.input.text }] }];
  const messages = (): Anthropic.Beta.BetaMessageParam[] => [
    ...history,
    ...pending.map((r) => ({ role: r.role, content: r.content as Anthropic.Beta.BetaContentBlockParam[] })),
  ];
  let written = "";
  let committed = pending.length; // rows safe to save (complete turns)

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const stage = (await d.query.workspaces.findFirst({ where: eq(schema.workspaces.id, workspaceId) }))?.stage ?? ws.stage;
      const servers = mcpServers();
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 64000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        system: [
          { type: "text", text: MIKEE_CONSTITUTION, cache_control: { type: "ephemeral" } },
          { type: "text", text: await situation(workspaceId, stage, ws.timezone) },
        ],
        messages: messages(),
        tools: requestTools(),
        ...(servers ? { mcp_servers: servers } : {}),
        context_management: { edits: [{ type: "compact_20260112" }] },
        fallbacks: "default",
        betas: [
          "server-side-fallback-2026-07-01",
          "compact-2026-01-12",
          ...(servers ? (["mcp-client-2025-11-20"] as const) : []),
        ],
      });
      stream.on("text", (delta) => {
        written += delta;
        emit({ t: "text", v: delta });
      });

      const message = await stream.finalMessage();
      pending.push({ role: "assistant", kind: "chat", content: message.content });

      if (message.stop_reason === "pause_turn") continue;
      if (message.stop_reason === "refusal") {
        committed = pending.length;
        emit({ t: "error", message: "מייקי לא יכול לעזור בבקשה הזאת." });
        break;
      }

      const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (!toolUses.length) {
        committed = pending.length;
        break;
      }
      if (message.stop_reason === "max_tokens") throw new Error("Mikee's answer was cut off. Please try again.");

      const results = await Promise.all(
        toolUses.map(async (b) => {
          emit({ t: "tool", name: b.name, state: "start" });
          const r = await runTool({ workspaceId, tz: ws.timezone }, b.name, b.input);
          emit({ t: "tool", name: b.name, state: r.isError ? "error" : "done" });
          const pid = /"proposalId":"([0-9a-f-]{36})"/.exec(r.content)?.[1];
          if (pid) emit({ t: "proposal", id: pid });
          return { type: "tool_result" as const, tool_use_id: b.id, content: r.content, is_error: r.isError || undefined };
        }),
      );
      pending.push({ role: "user", kind: "chat", content: results });
      committed = pending.length;
    }
  } catch (err) {
    console.error("[mikee] turn failed", err);
    const message =
      err instanceof Anthropic.RateLimitError
        ? "מייקי עמוס כרגע, נסי שוב בעוד דקה."
        : err instanceof Anthropic.APIError
          ? `תקלה זמנית בחיבור למייקי (${err.status}). נסי שוב בעוד רגע.`
          : "משהו השתבש אצלי. נסי שוב בעוד רגע.";
    emit({ t: "error", message });
  } finally {
    if (!opts.discardIf?.(written)) await appendMany(workspaceId, pending.slice(0, committed));
    emit({ t: "done" });
  }
  return written;
}
