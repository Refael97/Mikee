import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Kind } from "../conversation";
import { AiBudgetExceeded, assertAiBudget, claudeCostUsd, recordUsage } from "../usage";
import { runToolIn, toolDefinitions, type ToolContext, type ToolDef } from "./tools";
import { db, schema } from "../db";
import { assertTaskWithinLimits, currentTask } from "../telemetry";

/**
 * Two tiers, chosen per role for cost. "main" (Claude Sonnet 5.5) for Mikee and the specialists that decide
 * or spend; "light" (Claude Haiku 5.5, about 20x cheaper) for writing copy and posts and for describing
 * images. Either can be changed without code: MIKEE_MODEL_MAIN, MIKEE_MODEL_LIGHT.
 */
export type Tier = "main" | "light";
export const MODELS: Record<Tier, string> = {
  main: process.env.MIKEE_MODEL_MAIN || "claude-sonnet-5-5",
  light: process.env.MIKEE_MODEL_LIGHT || "claude-haiku-5-5",
};
export const MODEL = MODELS.main;

/**
 * Which tier each role runs on. Haiku by default (conversation, choosing tools, a regular campaign spec,
 * drafts); Sonnet where judgment is the job: the media buyer (campaign strategy) and the analyst
 * (performance). Any role can be moved without code for an A/B comparison, e.g.
 * MIKEE_TIERS="mikee=main,creative=main". model_calls records the model of every call to compare by.
 */
export const DEFAULT_TIERS: Record<string, Tier> = {
  mikee: "light",
  media_buyer: "main",
  analyst: "main",
  copywriter: "light",
  social: "light",
  creative: "light",
  video_editor: "light",
};

export function tierFor(role: string): Tier {
  const override = (process.env.MIKEE_TIERS ?? "")
    .split(",")
    .map((p) => p.trim().split("="))
    .find(([r]) => r === role)?.[1];
  return override === "main" || override === "light" ? override : (DEFAULT_TIERS[role] ?? "main");
}

/** Server-side refusal fallback and the newer web tools exist on Sonnet and Opus, not on Haiku. */
const isHaiku = (model: string) => model.startsWith("claude-haiku");

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export type Row = { role: "user" | "assistant" | "system"; kind: Kind; content: unknown[] };

/**
 * Postgres jsonb keeps object keys shorter first, then in byte order. Messages built in memory have another
 * order; sorting them the same way makes a stored turn and a fresh one identical on the wire.
 */
export function canonical<T>(value: T): T {
  if (Array.isArray(value)) return value.map(canonical) as T;
  if (!value || typeof value !== "object") return value;
  const keys = Object.keys(value as Record<string, unknown>).sort((a, b) => Buffer.byteLength(a) - Buffer.byteLength(b) || Buffer.compare(Buffer.from(a), Buffer.from(b)));
  return Object.fromEntries(keys.map((k) => [k, canonical((value as Record<string, unknown>)[k])])) as T;
}

/** Models that take a role "system" message inside the conversation (no beta header). */
export function supportsMidConversationSystem(model: string): boolean {
  return /^claude-(sonnet-5-5|haiku-5-5|opus-5|opus-5-5|opus-4-8|fable-5|fable-5-1|mythos-5|mythos-5-1)$/.test(model);
}
/** `agent` is set when a specialist (not Mikee) runs the tool, so the client sees who is doing what. */
export type LoopEvent = { t: "text"; v: string } | { t: "tool"; name: string; state: "start" | "done" | "error"; agent?: string } | { t: "proposal"; id: string };

let client: Pick<Anthropic, "beta"> | null = null;
export const anthropic = () => (client ??= new Anthropic());

/** Tests only: replace the Claude client with a scripted fake. */
export function setAnthropicForTests(fake: unknown) {
  client = fake as Pick<Anthropic, "beta">;
}

const PROPOSAL_IDS = /"proposalId":"([0-9a-f-]{36})"/g;
export const proposalIdsIn = (text: string) => [...text.matchAll(PROPOSAL_IDS)].map((m) => m[1]);

/**
 * One agent's tool loop, shared by Mikee and every specialist. The model only gets the tools passed in,
 * plus web search when allowed; never MCP servers, so anything that costs money goes through the platform.
 * `pending` is appended to as the loop runs; `onStep` is called after each completed tool round.
 */
export async function agentLoop(opts: {
  ctx: ToolContext;
  agent: string;
  system: Anthropic.Beta.BetaTextBlockParam[] | (() => Promise<Anthropic.Beta.BetaTextBlockParam[]>);
  history: Anthropic.Beta.BetaMessageParam[];
  pending: Row[];
  tools: ToolDef[];
  effort: Effort;
  /** Which model tier runs this loop (default main). */
  tier?: Tier;
  web?: boolean;
  compaction?: boolean;
  maxSteps?: number;
  /** End the loop once every tool call of a step produced a card, instead of asking the model to comment. */
  stopAfterCard?: boolean;
  emit?: (e: LoopEvent) => void | Promise<void>;
  onStep?: (pending: Row[]) => Promise<void>;
}): Promise<{ text: string; lastText: string; refused: boolean; endedOnCard: boolean }> {
  const { ctx, pending } = opts;
  const emit = async (e: LoopEvent) => {
    await opts.emit?.(e);
  };
  let text = "";
  let lastText = "";
  const definitions = toolDefinitions(opts.tools);

  // Tool results the model must keep seeing: cards and the specialists' reports (decisions, card ids).
  const keepTools = opts.tools.filter((t) => t.effect === "proposal" || t.name.startsWith("ask_")).map((t) => t.name);

  for (let step = 0; step < (opts.maxSteps ?? 40); step++) {
    assertTaskWithinLimits();
    await assertAiBudget(ctx.workspaceId, ctx.tz);
    const system = typeof opts.system === "function" ? await opts.system() : opts.system;
    const model = MODELS[opts.tier ?? "main"];
    const haiku = isHaiku(model);
    const request = (features: typeof FEATURES) => {
      const edits = [
        // Old tool results are cleared on the server once the context grows: no client-side history edits
        // (which would invalidate thinking blocks), and cards and reports are always kept.
        ...(features.clearToolUses
          ? [
              {
                type: "clear_tool_uses_20250919" as const,
                // Earlier on Haiku: its price is five times higher past 100K prompt tokens.
                trigger: { type: "input_tokens" as const, value: haiku ? 30_000 : 40_000 },
                keep: { type: "tool_uses" as const, value: 4 },
                clear_at_least: { type: "input_tokens" as const, value: 10_000 },
                exclude_tools: keepTools,
              },
            ]
          : []),
        ...(opts.compaction ? [{ type: "compact_20260112" as const, ...(haiku ? { trigger: { type: "input_tokens" as const, value: 80_000 } } : {}) }] : []),
      ];
      return anthropic().beta.messages.stream({
        model,
        max_tokens: 64000,
        // Caches everything up to the newest block: each step of a turn rereads the conversation and tool
        // results at about a tenth of the price instead of paying for them again.
        cache_control: { type: "ephemeral" },
        // The brief in the system prompt changes between turns; a thinking block from before such a change is
        // dropped by the API instead of failing the request.
        thinking: features.blockBinding ? { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } } : { type: "adaptive" },
        output_config: { effort: opts.effort },
        system,
        // In the key order Postgres stores them in, so a turn read back from the database next time is the same bytes
        // as the turn sent now, and the cached conversation still matches.
        messages: canonical([...opts.history, ...pending.map((r) => ({ role: r.role, content: r.content as Anthropic.Beta.BetaContentBlockParam[] }))]),
        tools: [
          ...definitions,
          ...(opts.web && !haiku
            ? ([
                { type: "web_search_20260209", name: "web_search", max_uses: 5 },
                { type: "web_fetch_20260209", name: "web_fetch", max_uses: 5 },
              ] as const)
            : []),
        ],
        ...(edits.length ? { context_management: { edits } } : {}),
        ...(haiku ? {} : { fallbacks: "default" as const }),
        betas: [
          ...(haiku ? [] : (["server-side-fallback-2026-07-01"] as const)),
          ...(opts.compaction ? (["compact-2026-01-12"] as const) : []),
          ...(features.clearToolUses ? (["context-management-2025-06-27"] as const) : []),
          ...(features.blockBinding ? (["thinking-binding-controls-2026-08-01"] as const) : []),
        ],
      } as never) as ReturnType<ReturnType<typeof anthropic>["beta"]["messages"]["stream"]>;
    };

    const started = Date.now();
    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await streamOnce(request(FEATURES), (delta) => {
        text += delta;
        void emit({ t: "text", v: delta });
      });
    } catch (err) {
      // If the API refuses one of the optional controls, run without it from now on rather than failing.
      const off = unsupportedFeature(err);
      if (!off) throw err;
      FEATURES[off] = false;
      console.warn(`[agent] ${off} turned off: ${(err as Error).message.slice(0, 200)}`);
      message = await streamOnce(request(FEATURES), (delta) => {
        text += delta;
        void emit({ t: "text", v: delta });
      });
    }
    const cost = claudeCostUsd(message.usage, message.model);
    await recordUsage(ctx.workspaceId, ctx.tz, "claude", cost, { agent: opts.agent, model: message.model, step });
    const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    await recordModelCall(ctx.workspaceId, opts.agent, step, message, cost, Date.now() - started, toolUses.map((t) => t.name));
    pending.push({ role: "assistant", kind: "chat", content: message.content });
    lastText = message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    if (message.stop_reason === "pause_turn") continue;
    if (message.stop_reason === "refusal") return { text, lastText, refused: true, endedOnCard: false };
    if (!toolUses.length) break;
    if (message.stop_reason === "max_tokens") {
      pending.pop(); // never run tools from a cut-off answer
      throw new Error(`${opts.agent}: answer was cut off`);
    }

    const results = await Promise.all(
      toolUses.map(async (b) => {
        const agent = opts.agent === "mikee" ? undefined : opts.agent;
        await emit({ t: "tool", name: b.name, state: "start", agent });
        const r = await runToolIn(opts.tools, ctx, b.name, b.input);
        await emit({ t: "tool", name: b.name, state: r.isError ? "error" : "done", agent });
        for (const id of proposalIdsIn(r.content)) await emit({ t: "proposal", id });
        return { type: "tool_result" as const, tool_use_id: b.id, content: r.content, is_error: r.isError || undefined };
      }),
    );
    pending.push({ role: "user", kind: "chat", content: results });
    await opts.onStep?.(pending);

    // A card is in front of the client and nothing else was asked: the turn ends here, without another
    // model call just to say so. The card speaks for itself.
    if (opts.stopAfterCard && results.every((r, i) => !r.is_error && producedCard(opts.tools, toolUses[i].name, r.content))) {
      return { text, lastText, refused: false, endedOnCard: true };
    }
  }
  return { text, lastText, refused: false, endedOnCard: false };
}

/** Optional request controls; one the API refuses is turned off for the rest of the process. */
const FEATURES = { clearToolUses: true, blockBinding: true };

function unsupportedFeature(err: unknown): keyof typeof FEATURES | null {
  if (!(err instanceof Anthropic.BadRequestError)) return null;
  const m = err.message;
  if (FEATURES.clearToolUses && /clear_tool_uses|context_management|context-management/i.test(m)) return "clearToolUses";
  if (FEATURES.blockBinding && /block_binding|thinking-binding/i.test(m)) return "blockBinding";
  return null;
}

async function streamOnce(stream: ReturnType<ReturnType<typeof anthropic>["beta"]["messages"]["stream"]>, onText: (t: string) => void) {
  stream.on("text", onText);
  return stream.finalMessage();
}

/** A proposal tool that created a card, or a delegation whose specialist created one. */
function producedCard(tools: ToolDef[], name: string, content: string): boolean {
  const def = tools.find((t) => t.name === name);
  if (!def) return false;
  if (def.effect !== "proposal" && !name.startsWith("ask_")) return false;
  return proposalIdsIn(content).length > 0;
}

/** Every model call, measured: tokens as reported (thinking is inside output), cache use, time, cost, task. */
async function recordModelCall(workspaceId: string, agent: string, step: number, message: Anthropic.Beta.BetaMessage, cost: number, ms: number, tools: string[]) {
  const task = currentTask();
  if (task) {
    task.modelCalls++;
    task.costUsd += cost;
  }
  const u = message.usage;
  const d = await db();
  await d.insert(schema.modelCalls).values({
    workspaceId,
    jobId: task?.jobId ?? null,
    agent,
    model: message.model,
    step,
    inputTokens: u.input_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    ms,
    costUsd: cost,
    stopReason: message.stop_reason ?? null,
    tools,
  });
}

export { AiBudgetExceeded };
