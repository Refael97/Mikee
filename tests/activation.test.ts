import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runTool, TOOLS } from "@/lib/agent/tools";
import { approveProposal, declineProposal } from "@/lib/proposals";
import { createConversation } from "@/lib/conversations";
import { timeline } from "@/lib/conversation";
import { friendlyError } from "@/lib/errors";
import { MetaError } from "@/lib/meta/graph";
import { FakeMeta } from "./support/fake-meta";
import { campaignSpec, createBusiness, drainJobs, NOW, proposal, setBudget, TZ } from "./support/setup";

let meta: FakeMeta;
let uninstall: () => void;
beforeAll(() => vi.useFakeTimers({ toFake: ["Date"], now: NOW }));
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  uninstall?.();
  meta = new FakeMeta();
  uninstall = meta.install();
});

async function buildOne(ws: string, conversationId?: string) {
  const r = await runTool({ workspaceId: ws, tz: TZ, conversationId }, "propose_campaign", campaignSpec());
  const id = JSON.parse(r.content).proposalId as string;
  await approveProposal(ws, id, (await proposal(id)).versionHash);
  await drainJobs();
  const built = await proposal(id);
  return { id, built, activationId: (built.result as any).activationProposalId as string };
}

describe("a campaign goes live in two approved steps", () => {
  it("the first approval builds every object paused and reads it back; nothing can spend", async () => {
    const ws = await createBusiness({ budget: 5000 });
    const { built } = await buildOne(ws);
    expect(built.status).toBe("done");
    expect((built.result as any).paused).toBe(true);
    expect(meta.list("campaign").every((c) => c.status === "PAUSED")).toBe(true);
    expect(meta.list("adset").every((a) => a.status === "PAUSED")).toBe(true);
    expect(meta.list("ad").every((a) => a.status === "PAUSED")).toBe(true);
    expect(meta.writes(/status/).some((w: any) => JSON.stringify(w).includes("ACTIVE"))).toBe(false);
  });

  it("the activation card waits in the same conversation, explains Meta's review, and reserves the budget", async () => {
    const ws = await createBusiness({ budget: 5000 });
    const conv = await createConversation(ws);
    const { activationId } = await buildOne(ws, conv.id);
    const act = await proposal(activationId);
    expect(act.status).toBe("pending");
    expect(Number(act.reserved)).toBeGreaterThan(0);
    expect(JSON.stringify(act.card)).toContain("אישור שלה לא מובטח");
    const items = await timeline(ws, conv.id);
    expect(items.some((i) => i.type === "card" && i.proposal.id === activationId)).toBe(true);
  });

  it("going live re-checks the budget against live numbers", async () => {
    const ws = await createBusiness({ budget: 5000 });
    const { activationId } = await buildOne(ws);
    await setBudget(ws, 100); // the client lowered the ceiling meanwhile
    const act = await proposal(activationId);
    await approveProposal(ws, activationId, act.versionHash);
    await drainJobs();
    const after = await proposal(activationId);
    expect(after.status).toBe("failed");
    expect((after.result as any).error).toMatch(/התקציב/);
    expect(meta.list("campaign")[0].status).toBe("PAUSED");
  });

  it("declining the activation leaves the campaign built and paused, never deleted", async () => {
    const ws = await createBusiness({ budget: 5000 });
    const { activationId } = await buildOne(ws);
    await declineProposal(ws, activationId);
    await drainJobs();
    expect(meta.list("campaign")).toHaveLength(1);
    expect(meta.list("campaign")[0].status).toBe("PAUSED");
  });

  it("the model has no way to create or approve an activation itself", () => {
    expect(TOOLS.some((t) => /activate/.test(t.name))).toBe(false);
  });
});

describe("errors the client reads", () => {
  it("are plain Hebrew with the way forward, while the technical detail is kept separately", () => {
    expect(friendlyError(new MetaError("App in development mode", 100, 1885183))).toMatch(/מצב פיתוח/);
    expect(friendlyError(new MetaError("Invalid OAuth access token", 190))).toMatch(/לחבר מחדש/);
    expect(friendlyError(new MetaError("Too many calls", 17))).toMatch(/להאט/);
    expect(friendlyError(new Error("anything"))).not.toMatch(/[A-Za-z]{4,}/);
  });
});
