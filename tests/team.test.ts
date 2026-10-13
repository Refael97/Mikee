import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
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

const userSays = async (ws: string, text: string) => {
  const d = await db();
  await d.insert(schema.messages).values({ workspaceId: ws, role: "user", kind: "chat", content: [{ type: "text", text }] });
  return enqueue(ws, "turn");
};

const effectOf = (name: string) => BASE_TOOLS.get(name)?.effect;

describe("who can do what", () => {
  it("Mikee manages: light tools plus delegation, and cannot build or publish himself", () => {
    const names = MIKEE_TOOLS.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(SPECIALISTS.map((s) => s.tool)));
    for (const t of MIKEE_TOOLS) expect(["read", "memory", "delegate"].includes(t.effect) || t.name === "request_budget_increase").toBe(true);
    expect(names).not.toContain("propose_campaign");
    expect(names).not.toContain("meta_write");
  });

  it("each specialist gets only the tools of its craft, and none can delegate further", () => {
    const proposalsOf = (id: string) => SPECIALISTS.find((s) => s.id === id)!.tools.filter((n) => effectOf(n) === "proposal").sort();
    expect(proposalsOf("copywriter")).toEqual([]);
    expect(proposalsOf("analyst")).toEqual([]);
    expect(proposalsOf("media_buyer")).toEqual(["propose_campaign", "propose_change"]);
    expect(proposalsOf("creative")).toEqual(["propose_media"]);
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
        () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "הכנתי לך קמפיין, הוא מחכה לאישור שלך." }] }),
      ],
      media_buyer: [
        () => ({ stop_reason: "tool_use", content: [toolUse("b1", "budget_status", {})] }),
        () => ({ stop_reason: "tool_use", content: [toolUse("b2", "propose_campaign", campaignSpec())] }),
        () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "Built a ₪50/day traffic campaign; card created." }] }),
      ],
    });
    setAnthropicForTests(team);
    await userSays(ws, "יש קולקציה חדשה, בוא נקדם");
    await drainJobs();

    const mikeeReq = team.requests.find((r) => r.agent === "mikee")!.req;
    expect(mikeeReq.output_config.effort).toBe("medium");
    const buyer = team.requests.filter((r) => r.agent === "media_buyer").map((r) => r.req);
    expect(buyer).toHaveLength(3);
    // The specialist got the business brief, its own instructions, Mikee's task, and only its tools.
    const sys = buyer[0].system.map((b: any) => b.text).join("\n");
    expect(sys).toContain("# Your role: media buyer");
    expect(sys).toContain("כותבים חם וקליל");
    expect(buyer[0].messages[0].content[0].text).toContain("Build a traffic campaign");
    expect(buyer[0].messages[0].content[0].text).toContain("Use the two approved ads");
    expect(buyer[0].tools.map((t: any) => t.name).sort()).toEqual([...SPECIALISTS.find((s) => s.id === "media_buyer")!.tools].sort());
    expect(buyer[0].output_config.effort).toBe("high");
    // The specialist does not see the client conversation.
    expect(JSON.stringify(buyer[0].messages)).not.toContain("יש קולקציה חדשה");

    const proposals = await d.select().from(schema.proposals).where(eq(schema.proposals.workspaceId, ws));
    expect(proposals.map((p) => p.status)).toEqual(["pending"]);
    expect(meta.writes()).toEqual([]);

    // The client sees Mikee's words, a neutral activity line and the card: never the team.
    const items = await timeline(ws);
    expect(items.map((i) => i.type)).toEqual(["user", "activity", "card", "mikee"]);
    expect(JSON.stringify(items)).not.toMatch(/media buyer|media_buyer|specialist/i);

    const runs = await d.select().from(schema.agentRuns).where(eq(schema.agentRuns.workspaceId, ws));
    expect(runs.map((r) => [r.agent, r.proposalIds.length, r.steps])).toEqual([["media_buyer", 1, 3]]);
    const usage = await d.select().from(schema.usage).where(eq(schema.usage.workspaceId, ws)).orderBy(asc(schema.usage.id));
    expect(usage.map((u) => (u.detail as any).agent)).toEqual(["mikee", "media_buyer", "media_buyer", "media_buyer", "mikee"]);
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
    await userSays(ws, "איך היה השבוע?");
    await drainJobs();
    const d = await db();
    const runs = await d.select().from(schema.agentRuns).where(eq(schema.agentRuns.workspaceId, ws));
    expect(runs[0].error).toBeTruthy();
    const last = (await timeline(ws)).at(-1);
    expect(last?.type).toBe("mikee");
  });
});
