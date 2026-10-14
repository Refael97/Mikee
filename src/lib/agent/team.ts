import "server-only";
import { z } from "zod";
import { db, schema } from "../db";
import { businessBrief } from "./brief";
import { getPlaybook } from "../playbooks";
import { agentLoop, proposalIdsIn, type Row, tierFor } from "./loop";
import { SPECIALISTS, type Specialist, TEAM_PREAMBLE } from "./specialists";
import { pick, tool, type ToolDef } from "./tools";

/** Runs one specialist on one task, with a fresh context: the business brief, its instructions, the task. */
export async function runSpecialist(spec: Specialist, ctx: Parameters<ToolDef["run"]>[0], task: string, materials?: string) {
  const tools = pick(spec.tools);
  const pending: Row[] = [
    {
      role: "user",
      kind: "chat",
      content: [{ type: "text", text: `Task from Mikee:\n${task}${materials ? `\n\nMaterials:\n${materials}` : ""}` }],
    },
  ];
  const [brief, playbook] = await Promise.all([businessBrief(ctx.workspaceId, ctx.tz), getPlaybook(ctx.workspaceId, spec.id)]);
  const startedAt = new Date();
  let output = "";
  let error: string | undefined;
  try {
    const r = await agentLoop({
      ctx: { workspaceId: ctx.workspaceId, tz: ctx.tz, conversationId: ctx.conversationId, agent: spec.id },
      agent: spec.id,
      system: [
        { type: "text", text: `${TEAM_PREAMBLE}\n\n${spec.instructions}`, cache_control: { type: "ephemeral" } },
        { type: "text", text: brief },
        { type: "text", text: playbookBlock(playbook) },
      ],
      history: [],
      pending,
      tools,
      effort: spec.effort,
      tier: tierFor(spec.id),
      web: spec.web,
      maxSteps: 20,
      // After its card is created the specialist is done; the report is the card itself.
      stopAfterCard: true,
    });
    output = r.refused ? "The specialist could not help with this request." : r.endedOnCard ? `${r.lastText ? `${r.lastText}\n` : ""}Card created and shown to the client.` : r.lastText || r.text;
  } catch (e) {
    error = (e as Error).message;
    output = `The specialist stopped with an error: ${error}`;
  }

  // Cards the specialist created during this task.
  const proposalIds = [
    ...new Set(
      pending
        .filter((r) => r.role === "user")
        .flatMap((r) => (r.content as any[]).filter((b) => b?.type === "tool_result" && !b.is_error).flatMap((b) => proposalIdsIn(String(b.content)))),
    ),
  ];
  const d = await db();
  await d.insert(schema.agentRuns).values({
    workspaceId: ctx.workspaceId,
    agent: spec.id,
    task,
    output,
    proposalIds,
    steps: pending.filter((r) => r.role === "assistant").length,
    error: error ?? null,
    startedAt,
  });
  return { report: output, cards: proposalIds.map((proposalId) => ({ proposalId })), ...(error ? { error } : {}) };
}

/**
 * The specialist's own file for this business, written by Mikee from what the client likes and dislikes.
 * It guides the work; the hard limits above it still win.
 */
export function playbookBlock(p: { content: string; version: number; updatedAt: Date } | undefined) {
  if (!p) return "# Your playbook for this business\nMikee has not written one yet. Work from the brief and the task, and in your report mention anything about the client's taste you had to guess.";
  return `# Your playbook for this business (version ${p.version}, ${p.updatedAt.toISOString().slice(0, 10)}, written by Mikee from the client's feedback)\nFollow it before your own defaults; it never overrides the hard limits.\n\n${p.content}`;
}

/** One delegation tool per specialist, for Mikee. */
export const TEAM_TOOLS: ToolDef[] = SPECIALISTS.map((spec) =>
  tool({
    name: spec.tool,
    effect: "delegate",
    description: `${spec.purpose} Returns the specialist's report and the ids of any cards it created (already shown to the client).`,
    input: z.object({
      task: z.string().min(10).describe("A complete brief: what to do, why (the business goal), and constraints. The specialist does not see the conversation."),
      materials: z.string().optional().describe("Anything to use as-is: approved copy, media URLs, links, numbers, the client's exact words"),
    }),
    run: async (ctx, i) => runSpecialist(spec, ctx, i.task, i.materials),
  }),
);

export function specialistByTool(name: string) {
  return SPECIALISTS.find((s) => s.tool === name);
}
