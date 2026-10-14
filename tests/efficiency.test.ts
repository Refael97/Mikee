import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { appendMessage } from "@/lib/conversation";
import { createConversation } from "@/lib/conversations";
import { setAnthropicForTests } from "@/lib/agent/run";
import { runTool } from "@/lib/agent/tools";
import { claimNext, enqueue, heartbeat } from "@/lib/jobs";
import { assertTaskWithinLimits, newTask, runInTask, TaskLimit } from "@/lib/telemetry";
import { metaContext } from "@/lib/meta/context";
import { FakeMeta } from "./support/fake-meta";
import { campaignSpec, createBusiness, drainJobs, fakeTeam, NOW, toolUse, TZ } from "./support/setup";

let meta: FakeMeta;
let uninstall: () => void;
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  uninstall?.();
  meta = new FakeMeta();
  uninstall = meta.install();
});

const says = async (ws: string, text: string) => {
  const conv = (await createConversation(ws, { firstText: text })).id;
  await appendMessage(ws, conv, "user", "chat", [{ type: "text", text }]);
  return enqueue(ws, "turn", { conversationId: conv });
};

describe("the simple campaign: Mikee builds the card himself", () => {
  it("one context read, one card, and the turn ends: two model calls, no specialist, nothing written to Meta", async () => {
    const ws = await createBusiness({ budget: 3000 });
    meta.add("adimage", { hash: "abc123def456", url: "https://scontent.example/a.jpg", name: "a.jpg" });
    meta.add("leadform", { name: "טופס מעסיקים", status: "ACTIVE" });
    const team = fakeTeam({
      mikee: [
        () => ({ stop_reason: "tool_use", content: [toolUse("m1", "get_campaign_context", {})] }),
        (req) => {
          const ctx = JSON.parse(req.messages.at(-1).content[0].content);
          expect(ctx.leadForms.status).toBe("ok");
          expect(ctx.adImages.items[0].hash).toBe("abc123def456");
          expect(ctx.budget.status).toBe("ok");
          return { stop_reason: "tool_use", content: [toolUse("m2", "propose_campaign", campaignSpec({ goal: "leads", leadFormId: ctx.leadForms.items[0].id }))] };
        },
      ],
    });
    setAnthropicForTests(team);
    const job = await says(ws, "צור קמפיין לידים עם המדיה והטופס הקיימים, 50 ש״ח ליום, מושהה");
    await drainJobs();

    expect(team.requests.map((r) => r.agent)).toEqual(["mikee", "mikee"]);
    const d = await db();
    expect((await d.select().from(schema.proposals).where(eq(schema.proposals.workspaceId, ws))).map((p) => p.status)).toEqual(["pending"]);
    expect(meta.writes()).toEqual([]);
    const done = await d.query.jobs.findFirst({ where: eq(schema.jobs.id, job.id) });
    expect(done?.metrics).toMatchObject({ modelCalls: 2, metaPosts: 0 });
    // The budget was read once for the context; the card's own budget check reused it within the task.
    expect(meta.calls.filter((c) => c.path === "/act_1/insights")).toHaveLength(1);
    expect((done?.metrics as any).metaMemoHits).toBeGreaterThan(0);
  });

  it("asks the API to clear old tool results server-side (keeping cards and reports) and to drop, not fail, stale thinking blocks", async () => {
    const ws = await createBusiness({ budget: 3000 });
    const team = fakeTeam({ mikee: [() => ({ stop_reason: "end_turn", content: [{ type: "text", text: "בסדר." }] })] });
    setAnthropicForTests(team);
    await says(ws, "היי");
    await drainJobs();
    const req = team.requests[0].req;
    const clear = req.context_management.edits.find((e: any) => e.type === "clear_tool_uses_20250919");
    expect(clear.exclude_tools).toEqual(expect.arrayContaining(["propose_campaign", "ask_media_buyer"]));
    expect(req.thinking.block_binding).toEqual({ prefix_mismatch_behavior: "drop_block" });
    expect(req.betas).toEqual(expect.arrayContaining(["context-management-2025-06-27", "thinking-binding-controls-2026-08-01"]));
  });

  it("if the API refuses an optional control, the call is retried without it instead of failing the turn", async () => {
    const ws = await createBusiness({ budget: 3000 });
    let first = true;
    const team = fakeTeam({ mikee: [() => ({ stop_reason: "end_turn", content: [{ type: "text", text: "בסדר." }] })] });
    const stream = team.beta.messages.stream.bind(team.beta.messages);
    team.beta.messages.stream = (req: any) => {
      if (first && req.context_management?.edits?.some((e: any) => e.type === "clear_tool_uses_20250919")) {
        first = false;
        throw new Anthropic.BadRequestError(400, { error: { message: "context_management: clear_tool_uses_20250919 is not supported" } }, "context_management: clear_tool_uses_20250919 is not supported", new Headers());
      }
      return stream(req);
    };
    setAnthropicForTests(team);
    const job = await says(ws, "היי");
    await drainJobs();
    const d = await db();
    expect((await d.query.jobs.findFirst({ where: eq(schema.jobs.id, job.id) }))?.status).toBe("done");
  });
});

describe("one task, no repeated reads; executions always fresh", () => {
  it("identical Meta reads in a preparation task are made once; a write clears them", async () => {
    const ws = await createBusiness({ budget: 3000 });
    const task = newTask({ memo: true });
    await runInTask(task, async () => {
      await runTool({ workspaceId: ws, tz: TZ }, "get_campaign_context", {});
      await runTool({ workspaceId: ws, tz: TZ }, "budget_status", {});
      await runTool({ workspaceId: ws, tz: TZ }, "get_campaign_context", {});
    });
    expect(meta.calls.filter((c) => c.path === "/act_1/insights")).toHaveLength(1);
    expect(task.metaMemoHits).toBeGreaterThan(0);

    const exec = newTask({ memo: false });
    await runInTask(exec, async () => {
      const ctx = await metaContext(ws);
      await ctx.graph.get("/act_1", { fields: "id" });
      await ctx.graph.get("/act_1", { fields: "id" });
    });
    expect(exec.metaGets).toBe(2);
  });
});

describe("a job belongs to one worker at a time", () => {
  it("a reclaimed job's old lease no longer holds, and that copy cannot write to Meta", async () => {
    const ws = await createBusiness();
    await enqueue(ws, "describe", { mediaId: "x" });
    const job = (await claimNext(["describe"]))!;
    expect(job.lease).toBeTruthy();
    expect(await heartbeat(job.id, job.lease)).toBe(true);
    expect(await heartbeat(job.id, "someone-else")).toBe(false);

    const task = newTask({});
    task.leaseLost = true;
    await runInTask(task, async () => {
      const ctx = await metaContext(ws);
      await expect(ctx.graph.post("/act_1/campaigns", { name: "x" })).rejects.toThrow(/taken over/);
      expect(() => assertTaskWithinLimits()).toThrow(TaskLimit);
    });
    expect(meta.writes()).toEqual([]);
  });

  it("a task stops at its time or cost limit", async () => {
    const slow = newTask({});
    slow.startedAt = Date.now() - slow.maxMs - 1;
    await runInTask(slow, async () => expect(() => assertTaskWithinLimits()).toThrow(/longer than/));
    const costly = newTask({});
    costly.costUsd = costly.maxUsd + 0.01;
    await runInTask(costly, async () => expect(() => assertTaskWithinLimits()).toThrow(/cost passed/));
  });
});

describe("measurement", () => {
  it("each model call records tokens, cache reads and writes, time and cost", async () => {
    const ws = await createBusiness({ budget: 3000 });
    const team = fakeTeam({ mikee: [() => ({ stop_reason: "end_turn", content: [{ type: "text", text: "בסדר." }], usage: { input_tokens: 500, output_tokens: 80, cache_read_input_tokens: 9000, cache_creation_input_tokens: 1200 } } as any)] });
    setAnthropicForTests(team);
    await says(ws, "היי");
    await drainJobs();
    const d = await db();
    const [c] = await d.select().from(schema.modelCalls).where(eq(schema.modelCalls.workspaceId, ws)).orderBy(asc(schema.modelCalls.id));
    expect(c).toMatchObject({ agent: "mikee", inputTokens: 500, outputTokens: 80, cacheReadTokens: 9000, cacheWriteTokens: 1200, model: "claude-sonnet-5-5" });
    expect(c.costUsd).toBeGreaterThan(0);
    expect(c.ms).toBeGreaterThanOrEqual(0);
  });
});
