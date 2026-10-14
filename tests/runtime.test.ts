import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { appendMessage } from "@/lib/conversation";
import { createConversation } from "@/lib/conversations";
import { runTool } from "@/lib/agent/tools";
import { setAnthropicForTests } from "@/lib/agent/run";
import { claimNext, enqueue, eventsSince, TurnInProgress } from "@/lib/jobs";
import { setMediaGeneratorForTests } from "@/lib/higgsfield";
import { approveProposal } from "@/lib/proposals";
import { recordUsage } from "@/lib/usage";
import { FakeMeta } from "./support/fake-meta";
import { campaignSpec, createBusiness, drainJobs, fakeClaude, fakeGenerator, NOW, proposal, toolUse, TZ } from "./support/setup";

let meta: FakeMeta;
let uninstall: () => void;

beforeAll(() => vi.useFakeTimers({ toFake: ["Date"], now: NOW }));
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  uninstall?.();
  meta = new FakeMeta();
  uninstall = meta.install();
  setMediaGeneratorForTests(null);
});

/** Mikee's own turn calls, without the short call that names a new conversation afterwards. */
const turnCalls = (c: { requests: any[] }) => c.requests.filter((r) => !String(r.system ?? "").startsWith("Name a marketing conversation"));

const userSays = async (ws: string, text: string, conversationId?: string) => {
  const conv = conversationId ?? (await createConversation(ws, { firstText: text })).id;
  await appendMessage(ws, conv, "user", "chat", [{ type: "text", text }]);
  const job = await enqueue(ws, "turn", { conversationId: conv });
  return Object.assign(job, { conversationId: conv });
};

describe("background jobs", () => {
  it("one turn at a time per conversation; different conversations run in parallel", async () => {
    const ws = await createBusiness({ budget: 1000 });
    const a = await createConversation(ws, { firstText: "קמפיין" });
    const b = await createConversation(ws, { firstText: "פוסט" });
    await enqueue(ws, "turn", { conversationId: a.id });
    await expect(enqueue(ws, "turn", { conversationId: a.id })).rejects.toThrow(TurnInProgress);
    await enqueue(ws, "turn", { conversationId: b.id });
    await enqueue(ws, "checkin", { conversationId: "c1" });
    await expect(enqueue(ws, "checkin", { conversationId: "c2" })).rejects.toThrow(TurnInProgress); // one check-in per business
    await enqueue(ws, "execute", { proposalId: "x" }); // executions are independent
  });

  it("each job is claimed by exactly one worker", async () => {
    const d = await db();
    await d.update(schema.jobs).set({ status: "done" }); // isolate from jobs queued by earlier tests
    const ws = await createBusiness();
    await enqueue(ws, "turn", { conversationId: (await createConversation(ws)).id });
    const claims = await Promise.all(Array.from({ length: 5 }, () => claimNext()));
    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it("a job whose worker died (no heartbeat) is picked up again; a live one is not", async () => {
    const d0 = await db();
    await d0.update(schema.jobs).set({ status: "done" });
    const ws = await createBusiness();
    const job = await enqueue(ws, "turn", { conversationId: (await createConversation(ws)).id });
    expect((await claimNext())?.id).toBe(job.id);
    expect(await claimNext()).toBeNull(); // heartbeat is fresh
    const d = await db();
    await d.update(schema.jobs).set({ heartbeatAt: sql`now() - interval '5 minutes'` }).where(eq(schema.jobs.id, job.id));
    const again = await claimNext();
    expect(again?.id).toBe(job.id);
    expect(again?.attempts).toBe(2);
  });
});

describe("a Mikee turn", () => {
  it("runs as a job and stores a valid conversation, with no MCP access for the model", async () => {
    const ws = await createBusiness({ budget: 3000 });
    const claude = fakeClaude([
      () => ({ stop_reason: "tool_use", content: [{ type: "text", text: "בודק רגע" }, toolUse("t1", "budget_status", {})] }),
      () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "נשאר מקום יפה בתקציב." }] }),
    ]);
    setAnthropicForTests(claude);
    const job = await userSays(ws, "כמה נשאר בתקציב?");
    await drainJobs();

    for (const req of turnCalls(claude)) {
      expect(req.mcp_servers).toBeUndefined();
      expect(req.tools.some((t: any) => t.type === "mcp_toolset")).toBe(false);
    }
    expect((await eventsSince(job.id)).map((e) => e.event.t).at(-1)).toBe("done");
    const d = await db();
    const rows = await d.select().from(schema.messages).where(eq(schema.messages.conversationId, job.conversationId)).orderBy(asc(schema.messages.id));
    expect(rows.map((r) => r.role)).toEqual(["user", "assistant", "user", "assistant"]);
    const usage = await d.select().from(schema.usage).where(eq(schema.usage.workspaceId, ws));
    expect(usage.filter((u) => (u.detail as { purpose?: string } | null)?.purpose !== "conversation_title")).toHaveLength(2);
  });

  it("after a restart, continues from the last completed step instead of redoing it", async () => {
    const ws = await createBusiness({ budget: 3000 });
    const job = await userSays(ws, "מה כדאי לקדם השבוע?");
    // State saved by the previous worker before it died: one tool round already done.
    const d = await db();
    await d
      .update(schema.jobs)
      .set({
        state: {
          pending: [
            { role: "assistant", kind: "chat", content: [toolUse("t1", "propose_campaign", campaignSpec())] },
            { role: "user", kind: "chat", content: [{ type: "tool_result", tool_use_id: "t1", content: '{"proposalId":"00000000-0000-4000-8000-000000000000"}' }] },
          ],
        },
      })
      .where(eq(schema.jobs.id, job.id));
    const claude = fakeClaude([() => ({ stop_reason: "end_turn", content: [{ type: "text", text: "סיימתי" }] })]);
    setAnthropicForTests(claude);
    await drainJobs();

    expect(turnCalls(claude)).toHaveLength(1);
    const sent = claude.requests[0].messages;
    expect(sent.at(-1).content[0].type).toBe("tool_result"); // resumed after the saved tool round
    const proposals = await d.select().from(schema.proposals).where(eq(schema.proposals.workspaceId, ws));
    expect(proposals).toHaveLength(0); // the tool was not run a second time
  });

  it("stops before calling the model once the monthly AI limit is reached", async () => {
    const ws = await createBusiness({ budget: 3000, settings: { aiMonthlyLimitUsd: 5 } });
    await recordUsage(ws, TZ, "claude", 5.01);
    const claude = fakeClaude([]);
    setAnthropicForTests(claude);
    const job = await userSays(ws, "היי");
    await drainJobs();
    expect(claude.requests).toHaveLength(0);
    const errors = (await eventsSince(job.id)).filter((e) => e.event.t === "error");
    expect(String(errors[0].event.message)).toMatch(/מגבלת השימוש/);
  });
});

describe("media generation costs credits, so it is gated too", () => {
  const mediaInput = { title: "סרטון לקולקציה", why: "צריך סרטון קצר לרילס", type: "video", model: "seedance_2_5", prompt: "A slow pan over the new autumn dresses on a rack", aspectRatio: "9:16" };

  it("without a pre-approved allowance, shows the price and generates nothing", async () => {
    const ws = await createBusiness({ settings: { mediaMonthlyCredits: 100, mediaAutoCredits: 0 } });
    const { gen, state } = fakeGenerator({ cost: 12 });
    setMediaGeneratorForTests(gen);
    const r = await runTool({ workspaceId: ws, tz: TZ }, "propose_media", mediaInput);
    const p = await proposal(JSON.parse(r.content).proposalId);
    expect(p.status).toBe("pending");
    expect(state.submits).toBe(0);
    expect((p.card as any).rows.find((x: any) => x.label === "עלות").value).toBe("12 קרדיטים");

    await approveProposal(ws, p.id, p.versionHash);
    await drainJobs();
    expect(state.submits).toBe(1);
    const done = await proposal(p.id);
    expect(done.status).toBe("done");
    expect((done.result as any).media[0].url).toMatch(/^https:\/\/mikee\.test\/api\/media\//); // stored on our side
  });

  it("within the allowance it runs at once; beyond the monthly limit it is refused", async () => {
    const ws = await createBusiness({ settings: { mediaMonthlyCredits: 20, mediaAutoCredits: 10 } });
    const { gen, state } = fakeGenerator({ cost: 8 });
    setMediaGeneratorForTests(gen);
    const r = JSON.parse((await runTool({ workspaceId: ws, tz: TZ }, "propose_media", mediaInput)).content);
    expect(r.autoApproved).toBe(true);
    await drainJobs();
    expect(state.submits).toBe(1);

    // 8 used: 2 auto credits left, so the next one needs a card...
    const second = JSON.parse((await runTool({ workspaceId: ws, tz: TZ }, "propose_media", { ...mediaInput, prompt: "Close-up of fabric texture in morning light" })).content);
    expect(second.autoApproved).toBeUndefined();
    // ...and something costing more than what is left this month is refused outright.
    setMediaGeneratorForTests(fakeGenerator({ cost: 50 }).gen);
    const third = JSON.parse((await runTool({ workspaceId: ws, tz: TZ }, "propose_media", { ...mediaInput, prompt: "A long brand film with many scenes" })).content);
    expect(third.error).toMatch(/left in this month's media budget/);
  });

  it("a retry waits for the same Higgsfield job and never pays twice", async () => {
    process.env.MIKEE_MEDIA_WAIT_MS = "50";
    const ws = await createBusiness({ settings: { mediaMonthlyCredits: 100 } });
    const { gen, state } = fakeGenerator({ cost: 10, terminalAfter: 1000 });
    setMediaGeneratorForTests(gen);
    const id = JSON.parse((await runTool({ workspaceId: ws, tz: TZ }, "propose_media", mediaInput)).content).proposalId;
    const { versionHash } = await proposal(id);
    await approveProposal(ws, id, versionHash);
    await drainJobs();
    expect((await proposal(id)).status).toBe("failed"); // still rendering when the wait ran out

    await approveProposal(ws, id, versionHash);
    await drainJobs();
    expect(state.submits).toBe(1);
    const d = await db();
    const usage = await d.select().from(schema.usage).where(eq(schema.usage.workspaceId, ws));
    expect(usage.map((u) => Number(u.amount))).toEqual([10]);
    delete process.env.MIKEE_MEDIA_WAIT_MS;
  });
});
