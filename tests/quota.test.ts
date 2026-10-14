import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { GET, POST } from "@/app/api/credits/route";
import { setAnthropicForTests } from "@/lib/agent/loop";
import { runTool } from "@/lib/agent/tools";
import { appendMessage } from "@/lib/conversation";
import { createConversation } from "@/lib/conversations";
import { addPurchase, charge, cycleOf, dueNotice, NOT_ENOUGH, noticeSeen, quota, refundJob, release, reserve } from "@/lib/credits";
import { db, schema } from "@/lib/db";
import { setMediaGeneratorForTests } from "@/lib/higgsfield";
import { enqueue } from "@/lib/jobs";
import { approveProposal } from "@/lib/proposals";
import { recordUsage } from "@/lib/usage";
import { FakeMeta } from "./support/fake-meta";
import { createBusiness, drainJobs, fakeClaude, fakeGenerator, NOW, proposal, toolUse, TZ } from "./support/setup";

const t0 = NOW; // 2026-10-20, Jerusalem
let uninstall: () => void;
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: t0 });
  // Meta and the generated files' downloads, without the network.
  uninstall = new FakeMeta().install();
});
afterAll(() => {
  uninstall();
  vi.useRealTimers();
});
afterEach(() => {
  vi.setSystemTime(t0);
  setAnthropicForTests(null);
  setMediaGeneratorForTests(null);
});

/** A business on a cycle that starts on the 14th, with a set number of included credits. */
const business = (credits: number, extra: Record<string, unknown> = {}) => createBusiness({ settings: { credits, billingAnchor: "2026-06-14", ...extra } });
const media = { title: "תמונה לקולקציה", why: "לפוסט", type: "image", model: "gpt_image_2_5", prompt: "A dress on a soft beige background, studio light" };

describe("the billing cycle", () => {
  it("renews on the subscription's day each month, on the last day of a shorter month", () => {
    expect(cycleOf(14, TZ, new Date("2026-10-20T09:00:00Z"))).toEqual({ key: "2026-10-14", renewsOn: "2026-11-14" });
    expect(cycleOf(14, TZ, new Date("2026-10-10T09:00:00Z"))).toEqual({ key: "2026-09-14", renewsOn: "2026-10-14" });
    expect(cycleOf(31, TZ, new Date("2027-02-28T12:00:00Z"))).toEqual({ key: "2027-02-28", renewsOn: "2027-03-31" });
    expect(cycleOf(31, TZ, new Date("2026-12-31T12:00:00Z"))).toEqual({ key: "2026-12-31", renewsOn: "2027-01-31" });
  });

  it("renewal brings the included quota back in full; bought credits carry over", async () => {
    const ws = await business(1000);
    await addPurchase(ws, 200, "test");
    await recordUsage(ws, TZ, "claude", 11); // 1,100 credits: all included, then 100 bought
    let q = await quota(ws, TZ);
    expect([q.percent, q.includedLeft, q.purchasedLeft]).toEqual([100, 0, 100]);

    vi.setSystemTime(new Date("2026-11-15T09:00:00Z"));
    q = await quota(ws, TZ);
    expect([q.cycle, q.percent, q.includedLeft, q.purchasedLeft, q.available]).toEqual(["2026-11-14", 0, 1000, 100, 1100]);
  });

  it("bought credits expire on their date", async () => {
    const ws = await business(0);
    await addPurchase(ws, 100, "test", 1);
    expect((await quota(ws, TZ)).available).toBe(100);
    vi.setSystemTime(new Date("2026-12-01T09:00:00Z"));
    expect((await quota(ws, TZ)).available).toBe(0);
  });
});

describe("holds keep parallel work inside the quota", () => {
  it("two tasks at the same moment cannot both take what only one fits", async () => {
    const ws = await business(100);
    const [a, b] = await Promise.all([reserve(ws, TZ, "task:a", 70), reserve(ws, TZ, "task:b", 70)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect((await quota(ws, TZ)).available).toBe(30);
    // Charged under its hold, the work counts once; what it did not use comes back on release.
    const held = (a ?? b)!;
    await charge(ws, TZ, { kind: "claude", amount: 0.4, credits: 40, holdId: held.id });
    expect((await quota(ws, TZ)).available).toBe(30);
    await release(held.id);
    expect((await quota(ws, TZ)).available).toBe(60);
  });

  it("the same work asking again gets the same hold, not a second one", async () => {
    const ws = await business(100);
    const first = await reserve(ws, TZ, "proposal:x", 60);
    const again = await reserve(ws, TZ, "proposal:x", 60);
    expect(again?.id).toBe(first?.id);
    expect((await quota(ws, TZ)).available).toBe(40);
  });

  it("two generations she asked for at once: one runs, the other stops before starting", async () => {
    const ws = await business(100); // 8 Higgsfield credits = 56 Mikee credits each
    const { gen, state } = fakeGenerator({ cost: 8 });
    setMediaGeneratorForTests(gen);
    const ctx = { workspaceId: ws, tz: TZ };
    const [x, y] = await Promise.all([
      runTool(ctx, "propose_media", { ...media, clientAsked: true }),
      runTool(ctx, "propose_media", { ...media, prompt: "The same dress on a model, outdoors at sunset", clientAsked: true }),
    ]);
    const results = [JSON.parse(x.content), JSON.parse(y.content)];
    expect(results.filter((r) => r.started)).toHaveLength(1);
    expect(results.find((r) => !r.started).error).toContain(NOT_ENOUGH);
    await drainJobs();
    expect((await proposal(results.find((r) => r.started).proposalId)).status).toBe("done");
    expect(state.submits).toBe(1);
    const q = await quota(ws, TZ);
    expect([q.includedUsed, q.available]).toEqual([56, 44]);
  });
});

describe("charging only for what was delivered", () => {
  it("a failed generation is not charged; its cost stays recorded as ours", async () => {
    const ws = await business(1000);
    setMediaGeneratorForTests(fakeGenerator({ cost: 10, fail: true }).gen);
    const r = JSON.parse((await runTool({ workspaceId: ws, tz: TZ }, "propose_media", { ...media, clientAsked: true })).content);
    await drainJobs();
    expect((await proposal(r.proposalId)).status).toBe("failed");
    expect((await quota(ws, TZ)).includedUsed).toBe(0);
    const d = await db();
    const rows = await d.select().from(schema.usage).where(eq(schema.usage.workspaceId, ws));
    expect(rows.map((u) => [u.kind, Number(u.amount), u.credits])).toEqual([["higgsfield_lost", 10, null]]);
    // And its hold is gone: the whole quota is available again.
    expect((await quota(ws, TZ)).available).toBe(1000);
  });

  it("a conversation turn that failed with nothing to show is refunded", async () => {
    const ws = await business(1000);
    const conv = (await createConversation(ws, { firstText: "מה המצב" })).id;
    let calls = 0;
    setAnthropicForTests({
      beta: {
        messages: {
          stream() {
            calls++;
            const msg =
              calls === 1
                ? { id: "m1", model: "claude-haiku-5-5", stop_reason: "tool_use", usage: { input_tokens: 1_000_000, output_tokens: 0 }, content: [toolUse("t1", "journey_status", {})] }
                : null;
            return {
              on() {
                return this;
              },
              async finalMessage() {
                if (!msg) throw new Error("socket hang up");
                return msg;
              },
            };
          },
        },
      },
    } as any);
    await appendMessage(ws, conv, "user", "chat", [{ type: "text", text: "מה המצב" }]);
    await enqueue(ws, "turn", { conversationId: conv });
    await drainJobs();
    expect(calls).toBeGreaterThanOrEqual(2);
    const q = await quota(ws, TZ);
    expect(q.includedUsed).toBe(0);
    expect(q.available).toBe(1000); // the turn's hold was released too
    const d = await db();
    const rows = await d.select().from(schema.usage).where(and(eq(schema.usage.workspaceId, ws), eq(schema.usage.kind, "claude_lost")));
    expect(rows).toHaveLength(1); // our cost, kept for the books
  });

  it("a refund also returns bought credits it had used", async () => {
    const ws = await business(10);
    await addPurchase(ws, 50, "test");
    await charge(ws, TZ, { kind: "claude", amount: 0.3, credits: 30, detail: { jobId: "job-1" } });
    expect((await quota(ws, TZ)).purchasedLeft).toBe(30);
    await refundJob(ws, "job-1");
    const q = await quota(ws, TZ);
    expect([q.includedLeft, q.purchasedLeft]).toEqual([10, 50]);
  });
});

describe("when the quota runs out", () => {
  it("a request stops before it starts, with the plain sentence; no model call is made", async () => {
    const ws = await business(100);
    await recordUsage(ws, TZ, "claude", 1);
    const claude = fakeClaude([]);
    setAnthropicForTests(claude);
    const conv = (await createConversation(ws, { firstText: "היי" })).id;
    await appendMessage(ws, conv, "user", "chat", [{ type: "text", text: "היי" }]);
    const job = await enqueue(ws, "turn", { conversationId: conv });
    await drainJobs();
    expect(claude.requests).toHaveLength(0);
    const d = await db();
    const events = await d.select().from(schema.jobEvents).where(eq(schema.jobEvents.jobId, job.id));
    expect(events.map((e) => e.event).find((e: any) => e.t === "error")).toEqual({ t: "error", message: NOT_ENOUGH });
  });

  it("bought credits keep the work going after the included quota", async () => {
    const ws = await business(100);
    await recordUsage(ws, TZ, "claude", 1);
    expect((await quota(ws, TZ)).available).toBe(0);
    await addPurchase(ws, 300, "bought");
    const q = await quota(ws, TZ);
    expect([q.percent, q.available, q.purchasedLeft]).toEqual([100, 300, 300]);
  });
});

describe("what the client sees", () => {
  it("80% and 95% notices come once each per cycle", async () => {
    const ws = await business(1000);
    await recordUsage(ws, TZ, "claude", 8.1);
    let q = await quota(ws, TZ);
    expect(await dueNotice(ws, q)).toBe(80);
    await noticeSeen(ws, q.cycle, 80);
    expect(await dueNotice(ws, q)).toBeNull();
    await recordUsage(ws, TZ, "claude", 1.5);
    q = await quota(ws, TZ);
    expect(await dueNotice(ws, q)).toBe(95);
    await noticeSeen(ws, q.cycle, 95);
    expect(await dueNotice(ws, await quota(ws, TZ))).toBeNull();
  });

  it("the usage API shows the share, what is left and the renewal, and nothing about providers or costs", async () => {
    const ws = await business(1000);
    await recordUsage(ws, TZ, "claude", 3.8);
    const session = await signIn(ws);
    const res = await GET();
    const body = await res.json();
    expect(body).toMatchObject({ percent: 38, included: 1000, includedLeft: 620, purchasedLeft: 0, renewsOn: "2026-11-14" });
    expect(JSON.stringify(body)).not.toMatch(/usd|token|model|claude|higgsfield|cost/i);
    session.restore();
  });

  it("asking for credits or an upgrade buys nothing; it only records the request", async () => {
    const ws = await business(1000);
    const session = await signIn(ws);
    const res = await POST(new Request("http://localhost:3000/api/credits", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify({ action: "request", kind: "credits" }) }));
    expect(res.status).toBe(200);
    const d = await db();
    expect(await d.select().from(schema.creditPurchases).where(eq(schema.creditPurchases.workspaceId, ws))).toEqual([]);
    const asked = await d.select().from(schema.activity).where(and(eq(schema.activity.workspaceId, ws), eq(schema.activity.kind, "billing_request")));
    expect(asked).toHaveLength(1);
    expect((await quota(ws, TZ)).available).toBe(1000);
    session.restore();
  });
});

/** Signs in as the business's owner for the API routes. */
async function signIn(ws: string) {
  const auth = await import("@/lib/auth");
  const d = await db();
  const w = await d.query.workspaces.findFirst({ where: eq(schema.workspaces.id, ws) });
  const spy = vi.spyOn(auth, "getSession").mockResolvedValue({ user: { id: "00000000-0000-0000-0000-000000000001", email: "owner@example.com", name: "Owner" }, workspace: w } as any);
  return { restore: () => spy.mockRestore() };
}
