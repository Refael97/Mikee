import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { appendMany, type Kind, loadHistory } from "../conversation";
import { AiBudgetExceeded } from "../usage";
import { businessBrief } from "./brief";
import { agentLoop, type LoopEvent, type Row } from "./loop";
import { MIKEE_CONSTITUTION, stageInstructions } from "./prompt";
import { TEAM_TOOLS } from "./team";
import { pick, type ToolDef } from "./tools";

export { MODEL, setAnthropicForTests, type Row } from "./loop";

export type AgentEvent = LoopEvent | { t: "done" } | { t: "error"; message: string };

/**
 * Mikee is the manager: he talks with the client, keeps the brain, and hands the actual work to his team.
 * His own tools are light (a quick look at results, the site, the store) plus one delegation tool per
 * specialist. He runs at medium effort; the specialists think hard about their narrow tasks.
 */
export const MIKEE_TOOLS: ToolDef[] = [
  ...pick(["remember", "forget", "set_stage", "budget_status", "read_results", "scan_website", "read_store", "read_social", "request_budget_increase"]),
  ...TEAM_TOOLS,
];

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
    const r = await agentLoop({
      ctx: { workspaceId, tz: ws.timezone },
      agent: "mikee",
      system: async () => {
        const stage = (await d.query.workspaces.findFirst({ where: eq(schema.workspaces.id, workspaceId) }))?.stage ?? ws.stage;
        return [
          { type: "text", text: MIKEE_CONSTITUTION, cache_control: { type: "ephemeral" } },
          { type: "text", text: `${await businessBrief(workspaceId, ws.timezone)}\n\n${stageInstructions(stage)}` },
        ];
      },
      history,
      pending,
      tools: MIKEE_TOOLS,
      effort: "medium",
      web: true,
      compaction: true,
      emit,
      onStep: (p) => opts.saveState?.(p) ?? Promise.resolve(),
    });
    written = r.text;
    if (r.refused) await emit({ t: "error", message: "מייקי לא יכול לעזור בבקשה הזאת." });
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

export type { Kind };
