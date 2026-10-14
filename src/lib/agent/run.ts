import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { appendMany, type Kind, loadHistory } from "../conversation";
import { recentConversationsText } from "../conversations";
import { AiBudgetExceeded } from "../usage";
import { TaskLimit } from "../telemetry";
import { businessBrief } from "./brief";
import { playbookStatus } from "../playbooks";
import { agentLoop, type LoopEvent, type Row, tierFor } from "./loop";
import { LEAK_MARKERS, LEAK_REPLACEMENT, MIKEE_CONSTITUTION, stageInstructions } from "./prompt";
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
  ...pick(["file_conversation", "remember", "forget", "team_playbook", "update_playbook", "set_stage", "journey_status", "update_journey", "set_dashboard", "search_library", "get_campaign_context", "meta_media", "list_instagram_conversations", "read_instagram_conversation", "advertiser_identity", "budget_status", "propose_campaign", "read_results", "scan_website", "read_store", "read_social", "request_budget_increase"]),
  ...TEAM_TOOLS,
];

/**
 * Runs Mikee for one turn inside a background job. After each completed step the new rows are saved to
 * the job's state, so if the process restarts the turn continues from there instead of starting over.
 * The rows are appended to the conversation together at the end, so the saved history is always valid.
 */
export async function runMikee(opts: {
  workspaceId: string;
  conversationId: string;
  /** Rows to add before Mikee answers (a kickoff instruction). The client's own message is already stored. */
  prepend?: Row[];
  resume?: Row[];
  saveState?: (pending: Row[]) => Promise<void>;
  emit?: (e: AgentEvent) => void | Promise<void>;
  discardIf?: (text: string) => boolean;
}): Promise<string> {
  const { workspaceId, conversationId } = opts;
  const emit = async (e: AgentEvent) => {
    await opts.emit?.(e);
  };
  const d = await db();
  const ws = await d.query.workspaces.findFirst({ where: eq(schema.workspaces.id, workspaceId) });
  if (!ws) throw new Error("Workspace not found");

  const history = await loadHistory(workspaceId, conversationId);
  const pending: Row[] = opts.resume?.length ? [...opts.resume] : [...(opts.prepend ?? [])];
  let written = "";
  let failed = false;

  try {
    const r = await agentLoop({
      ctx: { workspaceId, tz: ws.timezone, conversationId, agent: "mikee" },
      agent: "mikee",
      // Built once per turn, not at every step: the brief carries the time, and any change at the front of
      // the request would make the cached conversation behind it count again at full price.
      system: await (async () => {
        const stage = ws.stage;
        return [
          { type: "text", text: MIKEE_CONSTITUTION, cache_control: { type: "ephemeral" } },
          {
            type: "text",
            text: `${await businessBrief(workspaceId, ws.timezone)}\n\n# Your team's playbooks for this business\n${await playbookStatus(workspaceId)}\n\n# Other recent conversations\n${await recentConversationsText(workspaceId, conversationId)}\n\n${stageInstructions(stage)}`,
          },
        ];
      })(),
      history,
      pending,
      tools: MIKEE_TOOLS,
      // Mikee talks and delegates; the specialists do the heavy thinking.
      effort: "low",
      tier: tierFor("mikee"),
      web: true,
      // Once a card is in front of the client the turn is over: no extra model call to announce it.
      stopAfterCard: true,
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
          : err instanceof TaskLimit
            ? `עצרתי את המשימה כדי לא לבזבז: ${err.message}`
            : err instanceof Anthropic.APIError && /credit balance/i.test(err.message)
            ? "נגמר הקרדיט בחשבון Anthropic שמפעיל את מייקי. צריך להטעין אותו ב־console.anthropic.com, בעמוד Plans & Billing."
            : err instanceof Anthropic.APIError
            ? `תקלה בחיבור למייקי (${err.status}). נסי שוב בעוד רגע. (${failureNote(err)})`
            : /ANTHROPIC_API_KEY|apiKey|authToken/i.test(String((err as Error)?.message))
              ? "מייקי לא מחובר ל־Claude: חסר בשרת המשתנה ANTHROPIC_API_KEY."
              : `משהו השתבש אצלי. נסי שוב בעוד רגע. (${failureNote(err)})`;
    await emit({ t: "error", message });
  }

  // Save only complete turns: drop a trailing assistant message whose tool calls never got results.
  const last = pending[pending.length - 1];
  if (last?.role === "assistant" && (last.content as any[]).some((b) => b?.type === "tool_use")) pending.pop();
  // An answer that quotes the instructions is never stored or shown again.
  for (const row of pending) {
    if (row.role !== "assistant") continue;
    for (const b of row.content as any[]) {
      if (b?.type === "text" && LEAK_MARKERS.some((m) => b.text.includes(m))) {
        b.text = LEAK_REPLACEMENT;
        await emit({ t: "error", message: LEAK_REPLACEMENT });
      }
    }
  }
  if (!opts.discardIf?.(written) || failed) await appendMany(workspaceId, conversationId, pending);
  await emit({ t: "done" });
  return written;
}

export type { Kind };

/**
 * Pilot only: a short note on what failed, so a problem can be fixed without server logs. Anything that looks
 * like a key or token is blanked out. Before Mikee opens beyond the pilot, show only the kind of failure.
 */
function failureNote(err: unknown): string {
  const e = err as Error;
  const text = `${e?.name ?? "Error"}: ${e?.message ?? String(err)}`
    .replace(/[A-Za-z0-9_\-]{24,}/g, "…")
    .replace(/\s+/g, " ")
    .slice(0, 160);
  return text;
}
