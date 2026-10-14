import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Kind } from "../conversation";
import { AiBudgetExceeded, assertAiBudget, claudeCostUsd, recordUsage } from "../usage";
import { runToolIn, toolDefinitions, type ToolContext, type ToolDef } from "./tools";

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

/** Server-side refusal fallback and the newer web tools exist on Sonnet and Opus, not on Haiku. */
const isHaiku = (model: string) => model.startsWith("claude-haiku");

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export type Row = { role: "user" | "assistant"; kind: Kind; content: unknown[] };
export type LoopEvent = { t: "text"; v: string } | { t: "tool"; name: string; state: "start" | "done" | "error" } | { t: "proposal"; id: string };

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
  emit?: (e: LoopEvent) => void | Promise<void>;
  onStep?: (pending: Row[]) => Promise<void>;
}): Promise<{ text: string; lastText: string; refused: boolean }> {
  const { ctx, pending } = opts;
  const emit = async (e: LoopEvent) => {
    await opts.emit?.(e);
  };
  let text = "";
  let lastText = "";
  const definitions = toolDefinitions(opts.tools);

  for (let step = 0; step < (opts.maxSteps ?? 40); step++) {
    await assertAiBudget(ctx.workspaceId, ctx.tz);
    const system = typeof opts.system === "function" ? await opts.system() : opts.system;
    const model = MODELS[opts.tier ?? "main"];
    const haiku = isHaiku(model);
    const stream = anthropic().beta.messages.stream({
      model,
      max_tokens: 64000,
      thinking: { type: "adaptive" },
      output_config: { effort: opts.effort },
      system,
      messages: [...opts.history, ...pending.map((r) => ({ role: r.role, content: r.content as Anthropic.Beta.BetaContentBlockParam[] }))],
      tools: [
        ...definitions,
        ...(opts.web && !haiku
          ? ([
              { type: "web_search_20260209", name: "web_search", max_uses: 5 },
              { type: "web_fetch_20260209", name: "web_fetch", max_uses: 5 },
            ] as const)
          : []),
      ],
      ...(opts.compaction ? { context_management: { edits: [{ type: "compact_20260112" as const }] } } : {}),
      ...(haiku ? {} : { fallbacks: "default" as const }),
      betas: [...(haiku ? [] : (["server-side-fallback-2026-07-01"] as const)), ...(opts.compaction ? (["compact-2026-01-12"] as const) : [])],
    });
    stream.on("text", (delta) => {
      text += delta;
      void emit({ t: "text", v: delta });
    });

    const message = await stream.finalMessage();
    await recordUsage(ctx.workspaceId, ctx.tz, "claude", claudeCostUsd(message.usage, message.model), { agent: opts.agent, model: message.model, step });
    pending.push({ role: "assistant", kind: "chat", content: message.content });
    lastText = message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    if (message.stop_reason === "pause_turn") continue;
    if (message.stop_reason === "refusal") return { text, lastText, refused: true };
    const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (!toolUses.length) break;
    if (message.stop_reason === "max_tokens") {
      pending.pop(); // never run tools from a cut-off answer
      throw new Error(`${opts.agent}: answer was cut off`);
    }

    const results = await Promise.all(
      toolUses.map(async (b) => {
        await emit({ t: "tool", name: b.name, state: "start" });
        const r = await runToolIn(opts.tools, ctx, b.name, b.input);
        await emit({ t: "tool", name: b.name, state: r.isError ? "error" : "done" });
        for (const id of proposalIdsIn(r.content)) await emit({ t: "proposal", id });
        return { type: "tool_result" as const, tool_use_id: b.id, content: r.content, is_error: r.isError || undefined };
      }),
    );
    pending.push({ role: "user", kind: "chat", content: results });
    await opts.onStep?.(pending);
  }
  return { text, lastText, refused: false };
}

export { AiBudgetExceeded };
