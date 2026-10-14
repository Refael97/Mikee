import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { appendMessage } from "@/lib/conversation";
import { createConversation } from "@/lib/conversations";
import { MIKEE_TOOLS, setAnthropicForTests } from "@/lib/agent/run";
import { SPECIALISTS } from "@/lib/agent/specialists";
import { BASE_TOOLS } from "@/lib/agent/tools";
import { enqueue } from "@/lib/jobs";
import { timeline } from "@/lib/conversation";
import { FakeMeta } from "./support/fake-meta";
import { campaignSpec, createBusiness, drainJobs, fakeTeam, NOW, toolUse } from "./support/setup";

let meta: FakeMeta;
let uninstall: () => void;

beforeAll(() => vi.useFakeTimers({ toFake: ["Date"], now: NOW }));
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  uninstall?.();
  meta = new FakeMeta();
  uninstall = meta.install();
});

const userSays = async (ws: string, text: string, conversationId?: string) => {
  const conv = conversationId ?? (await createConversation(ws, { firstText: text })).id;
  await appendMessage(ws, conv, "user", "chat", [{ type: "text", text }]);
  const job = await enqueue(ws, "turn", { conversationId: conv });
  return Object.assign(job, { conversationId: conv });
};

const effectOf = (name: string) => BASE_TOOLS.get(name)?.effect;

describe("who can do what", () => {
  it("Mikee manages: light tools plus delegation; the only card he makes himself is a simple campaign", () => {
    const names = MIKEE_TOOLS.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(SPECIALISTS.map((s) => s.tool)));
    for (const t of MIKEE_TOOLS) expect(["read", "memory", "delegate"].includes(t.effect) || ["request_budget_increase", "propose_campaign"].includes(t.name)).toBe(true);
    expect(names).toContain("get_campaign_context");
    for (const n of ["meta_write", "propose_post", "propose_change", "propose_media", "propose_video"]) expect(names).not.toContain(n);
  });

  it("each specialist gets only the tools of its craft, and none can delegate further", () => {
    const proposalsOf = (id: string) => SPECIALISTS.find((s) => s.id === id)!.tools.filter((n) => effectOf(n) === "proposal").sort();
    expect(proposalsOf("copywriter")).toEqual([]);
    expect(proposalsOf("analyst")).toEqual([]);
    expect(proposalsOf("media_buyer")).toEqual(["propose_campaign", "propose_change"]);
    expect(proposalsOf("creative")).toEqual(["propose_media"]);
    expect(proposalsOf("video_editor")).toEqual(["propose_video"]);
    expect(proposalsOf("social")).toEqual(["propose_post"]);
    for (const s of SPECIALISTS) {
      for (const n of s.tools) {
        expect(effectOf(n), `${s.id}:${n}`).toBeDefined(); // a base tool, never a delegation tool
        expect(n.startsWith("ask_")).toBe(false);
      }
      expect(s.tools.includes("meta_write")).toBe(s.id === "media_buyer");
      expect(s.tools.includes("request_budget_increase")).toBe(false);
    }
  });
});

describe("delegation", () => {
  it("Mikee briefs the media buyer, the card it creates reaches the client, and nothing runs at Meta", async () => {
    const ws = await createBusiness({ budget: 3000 });
    const d = await db();
    await d.insert(schema.facts).values({ workspaceId: ws, topic: "voice", text: "כותבים חם וקליל", kind: "preference", status: "confirmed", source: "client" });

    const team = fakeTeam({
      mikee: [
        () => ({
          stop_reason: "tool_use",
          content: [toolUse("m1", "ask_media_buyer", { task: "Build a traffic campaign for the new autumn collection, ₪50/day", materials: "Use the two approved ads: ..." })],
        }),
      ],
      // The buyer reads its context once, makes the card, and is done: no report call, no Mikee wrap-up call.
      media_buyer: [
        () => ({ stop_reason: "tool_use", content: [toolUse("b1", "get_campaign_context", {})] }),
        () => ({ stop_reason: "tool_use", content: [toolUse("b2", "propose_campaign", campaignSpec())] }),
      ],
    });
    setAnthropicForTests(team);
    const job = await userSays(ws, "יש קולקציה חדשה, בוא נקדם");
    await drainJobs();

    const mikeeReq = team.requests.find((r) => r.agent === "mikee")!.req;
    expect(mikeeReq.output_config.effort).toBe("low");
    const buyer = team.requests.filter((r) => r.agent === "media_buyer").map((r) => r.req);
    expect(buyer).toHaveLength(2);
    expect(team.requests.filter((r) => r.agent === "mikee")).toHaveLength(1);
    // The specialist got the business brief, its own instructions, Mikee's task, and only its tools.
    const sys = buyer[0].system.map((b: any) => b.text).join("\n");
    expect(sys).toContain("# Your role: media buyer");
    expect(sys).toContain("כותבים חם וקליל");
    expect(buyer[0].messages[0].content[0].text).toContain("Build a traffic campaign");
    expect(buyer[0].messages[0].content[0].text).toContain("Use the two approved ads");
    expect(buyer[0].tools.map((t: any) => t.name).sort()).toEqual([...SPECIALISTS.find((s) => s.id === "media_buyer")!.tools].sort());
    expect(buyer[0].output_config.effort).toBe("medium");
    // The specialist does not see the client conversation.
    expect(JSON.stringify(buyer[0].messages)).not.toContain("יש קולקציה חדשה");

    const proposals = await d.select().from(schema.proposals).where(eq(schema.proposals.workspaceId, ws));
    expect(proposals.map((p) => p.status)).toEqual(["pending"]);
    expect(meta.writes()).toEqual([]);

    // The client sees Mikee's words, a neutral activity line and the card: never the team.
    const items = await timeline(ws, job.conversationId);
    expect(items.map((i) => i.type)).toEqual(["user", "activity", "card"]);
    expect(JSON.stringify(items)).not.toMatch(/media buyer|media_buyer|specialist/i);

    const runs = await d.select().from(schema.agentRuns).where(eq(schema.agentRuns.workspaceId, ws));
    expect(runs.map((r) => [r.agent, r.proposalIds.length, r.steps])).toEqual([["media_buyer", 1, 2]]);
    const usage = await d.select().from(schema.usage).where(eq(schema.usage.workspaceId, ws)).orderBy(asc(schema.usage.id));
    expect(usage.map((u) => (u.detail as any).agent)).toEqual(["mikee", "media_buyer", "media_buyer"]);
    // Every model call is measured, tied to its task, and the task keeps its totals.
    const calls = await d.select().from(schema.modelCalls).where(eq(schema.modelCalls.workspaceId, ws)).orderBy(asc(schema.modelCalls.id));
    expect(calls.map((c) => [c.agent, c.inputTokens, c.outputTokens])).toEqual([
      ["mikee", 1000, 200],
      ["media_buyer", 1000, 200],
      ["media_buyer", 1000, 200],
    ]);
    expect(new Set(calls.map((c) => c.jobId))).toEqual(new Set([job.id]));
    const done = await d.query.jobs.findFirst({ where: eq(schema.jobs.id, job.id) });
    expect(done?.metrics).toMatchObject({ modelCalls: 3 });
  });

  it("parallel tasks: copy and visuals at the same time", async () => {
    const ws = await createBusiness({ budget: 3000 });
    const team = fakeTeam({
      mikee: [
        () => ({
          stop_reason: "tool_use",
          content: [
            toolUse("m1", "ask_copywriter", { task: "3 primary texts for the autumn collection, feed ads" }),
            toolUse("m2", "ask_creative", { task: "Pick the best existing visuals for feed and reels" }),
          ],
        }),
        (req) => {
          const results = req.messages.at(-1).content;
          expect(results.map((r: any) => r.tool_use_id).sort()).toEqual(["m1", "m2"]);
          expect(results.find((r: any) => r.tool_use_id === "m1").content).toContain("variant A");
          return { stop_reason: "end_turn", content: [{ type: "text", text: "יש טקסטים ותמונות." }] };
        },
      ],
      copywriter: [() => ({ stop_reason: "end_turn", content: [{ type: "text", text: "Recommend variant A. A: ... B: ... C: ..." }] })],
      creative: [() => ({ stop_reason: "end_turn", content: [{ type: "text", text: "Feed: https://cdn.example/a.jpg" }] })],
    });
    setAnthropicForTests(team);
    await userSays(ws, "תכין משהו לקולקציה");
    await drainJobs();
    expect(team.requests.map((r) => r.agent).sort()).toEqual(["copywriter", "creative", "mikee", "mikee"]);
    // Each role runs on its tier: writing on Haiku, deciding and building on Sonnet.
    const by = (agent: string) => team.requests.find((r) => r.agent === agent)!.req;
    expect(by("mikee").model).toBe("claude-haiku-5-5");
    expect(by("creative").model).toBe("claude-haiku-5-5");
    expect(by("copywriter").model).toBe("claude-haiku-5-5");
    // Haiku gets no server-side fallback and no web tools (Sonnet and Opus only), and compacts before 100K.
    expect(by("copywriter").fallbacks).toBeUndefined();
    expect(by("copywriter").betas).not.toContain("server-side-fallback-2026-07-01");
    expect(by("mikee").tools.some((t: any) => t.type?.startsWith("web_search"))).toBe(false);
    expect(by("mikee").context_management.edits.find((e: any) => e.type === "compact_20260112").trigger.value).toBeLessThan(100_000);
    // The conversation is cached for the following steps; Mikee's instructions stay the same within a turn.
    const mikee = team.requests.filter((r) => r.agent === "mikee").map((r) => r.req);
    expect(mikee.every((r) => r.cache_control?.type === "ephemeral")).toBe(true);
    expect(JSON.stringify(mikee[1].system)).toBe(JSON.stringify(mikee[0].system));
  });

  it("a specialist that fails reports back and Mikee carries on", async () => {
    const ws = await createBusiness({ budget: 3000 });
    const team = fakeTeam({
      mikee: [
        () => ({ stop_reason: "tool_use", content: [toolUse("m1", "ask_analyst", { task: "How did last week go compared to the week before?" })] }),
        (req) => {
          expect(req.messages.at(-1).content[0].content).toContain("stopped with an error");
          return { stop_reason: "end_turn", content: [{ type: "text", text: "לא הצלחתי למשוך נתונים כרגע, אנסה שוב בעוד רגע." }] };
        },
      ],
      analyst: [], // runs out immediately: simulates the specialist's call failing
    });
    setAnthropicForTests(team);
    const job = await userSays(ws, "איך היה השבוע?");
    await drainJobs();
    const d = await db();
    const runs = await d.select().from(schema.agentRuns).where(eq(schema.agentRuns.workspaceId, ws));
    expect(runs[0].error).toBeTruthy();
    const last = (await timeline(ws, job.conversationId)).at(-1);
    expect(last?.type).toBe("mikee");
  });
});

describe("model per role", () => {
  it("Haiku by default, Sonnet for the media buyer and the analyst, and any role can be moved for a comparison", async () => {
    const { tierFor, MODELS } = await import("@/lib/agent/loop");
    expect(["mikee", "copywriter", "social", "creative", "video_editor"].map(tierFor)).toEqual(["light", "light", "light", "light", "light"]);
    expect(["media_buyer", "analyst"].map(tierFor)).toEqual(["main", "main"]);
    expect([MODELS.light, MODELS.main]).toEqual(["claude-haiku-5-5", "claude-sonnet-5-5"]);
    process.env.MIKEE_TIERS = "mikee=main, creative=main";
    try {
      expect([tierFor("mikee"), tierFor("creative"), tierFor("copywriter")]).toEqual(["main", "main", "light"]);
    } finally {
      delete process.env.MIKEE_TIERS;
    }
  });
});
