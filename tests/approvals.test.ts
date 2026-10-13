import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { runTool, TOOLS } from "@/lib/agent/tools";
import { approveProposal, ApprovalRejected, declineProposal } from "@/lib/proposals";
import { executeProposal } from "@/lib/executor";
import { FakeMeta } from "./support/fake-meta";
import { campaignSpec, createBusiness, drainJobs, NOW, proposal, TZ } from "./support/setup";

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

const propose = async (ws: string, name: string, input: unknown) => {
  const r = await runTool({ workspaceId: ws, tz: TZ }, name, input);
  if (r.isError) throw new Error(r.content);
  return JSON.parse(r.content).proposalId as string;
};

describe("every tool is either read-only or produces a card", () => {
  it("classifies every tool, and only meta_write may write to Meta directly", () => {
    const effects = Object.fromEntries(TOOLS.map((t) => [t.name, t.effect]));
    expect(Object.values(effects).every((e) => ["read", "memory", "setup", "proposal"].includes(e))).toBe(true);
    expect(TOOLS.filter((t) => t.effect === "setup").map((t) => t.name)).toEqual(["meta_write"]);
    expect(TOOLS.filter((t) => t.effect === "proposal").map((t) => t.name).sort()).toEqual(
      ["propose_campaign", "propose_change", "propose_media", "propose_post", "request_budget_increase"].sort(),
    );
  });

  it("proposal tools create a pending card and send nothing to Meta", async () => {
    const ws = await createBusiness({ budget: 5000 });
    meta.add("campaign", { id: "c_live", name: "Running", status: "ACTIVE", daily_budget: "4000" });
    await propose(ws, "propose_campaign", campaignSpec());
    await propose(ws, "propose_post", { title: "פוסט", channels: ["facebook", "instagram"], text: "שלום", media: [{ type: "image", url: "https://cdn.example/a.jpg" }] });
    await propose(ws, "propose_change", { title: "עוצרים", why: "לא מביא פניות", target: { type: "campaign", id: "c_live", name: "Running" }, change: { kind: "pause" } });
    await propose(ws, "request_budget_increase", { amount: 500, reason: "הקולקציה מוכרת מצוין השבוע" });

    expect(meta.writes()).toEqual([]);
    const d = await db();
    const rows = await d.select().from(schema.proposals).where(eq(schema.proposals.workspaceId, ws));
    expect(rows.map((r) => r.status)).toEqual(["pending", "pending", "pending", "pending"]);
  });

  it("meta_write refuses anything that spends, changes what runs, publishes or touches the account", async () => {
    const ws = await createBusiness({ budget: 5000 });
    const blocked = [
      { path: "/act_1/campaigns", params: { name: "x" } },
      { path: "/act_1/adsets", params: {} },
      { path: "/act_1/ads", params: {} },
      { path: "/123456", params: { name: "rename" } },
      { path: "/act_1", params: { spend_cap: 99999 } },
      { path: "/page_1/feed", params: { message: "hi" } },
      { path: "/page_1/photos", params: {} },
      { path: "/ig_1/media", params: {} },
      { path: "/ig_1/media_publish", params: {} },
      { path: "/act_1/customaudiences", params: { name: "x", status: "ACTIVE" } },
      { path: "/act_1/customaudiences", params: { name: "x", daily_budget: 100 } },
    ];
    for (const b of blocked) {
      const r = await runTool({ workspaceId: ws, tz: TZ }, "meta_write", { ...b, purpose: "test" });
      expect(JSON.parse(r.content).error, b.path).toMatch(/propose_/);
    }
    expect(meta.writes()).toEqual([]);

    const ok = await runTool({ workspaceId: ws, tz: TZ }, "meta_write", {
      path: "/act_1/customaudiences",
      params: { name: "Website visitors 30d", subtype: "WEBSITE" },
      purpose: "audience for retargeting",
    });
    expect(ok.isError).toBe(false);
    expect(meta.writes().map((c) => c.path)).toEqual(["/act_1/customaudiences"]);
  });
});

describe("approval is bound to the exact version of the card", () => {
  it("rejects an approval for a different version", async () => {
    const ws = await createBusiness({ budget: 5000 });
    const id = await propose(ws, "propose_campaign", campaignSpec());
    await expect(approveProposal(ws, id, "0".repeat(32))).rejects.toThrow(ApprovalRejected);
    expect((await proposal(id)).status).toBe("pending");
    expect(meta.writes()).toEqual([]);
  });

  it("any material change produces a new version and needs a new approval", async () => {
    const ws = await createBusiness({ budget: 5000 });
    const firstId = await propose(ws, "propose_campaign", campaignSpec());
    const first = await proposal(firstId);
    const secondId = await propose(ws, "propose_campaign", { ...campaignSpec({ dailyBudget: 60 }), replaces: firstId });
    const second = await proposal(secondId);

    expect(second.versionHash).not.toBe(first.versionHash);
    expect((await proposal(firstId)).status).toBe("superseded");
    await expect(approveProposal(ws, firstId, first.versionHash)).rejects.toThrow(/החליף/);

    // Changing only the ad text also changes the version.
    const thirdId = await propose(ws, "propose_campaign", {
      ...campaignSpec({ dailyBudget: 60, ads: [{ ...campaignSpec().ads[0], primaryText: "טקסט אחר" }, campaignSpec().ads[1]] }),
      replaces: secondId,
    });
    expect((await proposal(thirdId)).versionHash).not.toBe(second.versionHash);
  });

  it("the card shows every material detail of what will run", async () => {
    const ws = await createBusiness({ budget: 5000 });
    const p = await proposal(await propose(ws, "propose_campaign", campaignSpec({ endTime: "2026-10-30T20:00:00Z" })));
    const card = p.card as any;
    const rows = Object.fromEntries(card.rows.map((r: any) => [r.label, r.value]));
    expect(rows["תקציב"]).toContain("50");
    expect(rows["למי נגיע"]).toBe("קהל חדש בישראל, עם התאמה אוטומטית");
    expect(rows["מתי"]).toContain("עד");
    expect(rows["לאן מגיעים"]).toBe("studio.example");
    expect(card.media.map((m: any) => [m.url, m.text])).toEqual([
      ["https://cdn.example/a.jpg", "הקולקציה החדשה כאן"],
      ["https://cdn.example/b.jpg", "מה לובשים כשמתקרר?"],
    ]);
  });
});

/** Approves the activation card the platform opened after a campaign card was built. */
async function activate(ws: string, campaignProposalId: string) {
  const built = await proposal(campaignProposalId);
  const actId = (built.result as any).activationProposalId as string;
  expect(actId).toBeTruthy();
  const act = await proposal(actId);
  expect(act.kind).toBe("activate");
  expect(act.status).toBe("pending");
  await approveProposal(ws, actId, act.versionHash);
  await drainJobs();
  expect((await proposal(actId)).status).toBe("done");
}

describe("no duplicate actions", () => {
  it("five simultaneous approvals run the campaign once", async () => {
    const ws = await createBusiness({ budget: 5000 });
    const id = await propose(ws, "propose_campaign", campaignSpec());
    const { versionHash } = await proposal(id);

    const results = await Promise.all(Array.from({ length: 5 }, () => approveProposal(ws, id, versionHash)));
    expect(results.filter((r) => !("duplicate" in r)).length).toBe(1);
    await drainJobs();

    expect(meta.list("campaign")).toHaveLength(1);
    expect(meta.list("adset")).toHaveLength(1);
    expect(meta.list("ad")).toHaveLength(2);
    // Built, but nothing is live: going live is its own card.
    expect(meta.list("campaign")[0].status).toBe("PAUSED");
    expect((await proposal(id)).status).toBe("done");
    await activate(ws, id);
    expect(meta.list("campaign")[0].status).toBe("ACTIVE");

    // Approving again after it is done changes nothing.
    await approveProposal(ws, id, versionHash);
    await drainJobs();
    expect(meta.list("campaign")).toHaveLength(1);
  });

  it("a retry after a failure in the middle resumes and does not duplicate", async () => {
    const ws = await createBusiness({ budget: 5000 });
    const id = await propose(ws, "propose_campaign", campaignSpec());
    const { versionHash } = await proposal(id);
    let adCalls = 0;
    meta.failOn((c) => c.method === "POST" && c.path === "/act_1/ads" && ++adCalls === 2);

    await approveProposal(ws, id, versionHash);
    await drainJobs();
    const failed = await proposal(id);
    expect(failed.status).toBe("failed");
    expect((failed.result as any).retryable).toBe(true);
    // Half-built campaign exists but is paused: it spends nothing while waiting.
    expect(meta.list("campaign")).toHaveLength(1);
    expect(meta.list("campaign")[0].status).toBe("PAUSED");

    await approveProposal(ws, id, versionHash);
    await drainJobs();
    expect((await proposal(id)).status).toBe("done");
    expect(meta.list("campaign")).toHaveLength(1);
    expect(meta.list("adset")).toHaveLength(1);
    expect(meta.list("ad")).toHaveLength(2);
    expect(meta.list("campaign")[0].status).toBe("PAUSED");
    await activate(ws, id);
    expect(meta.list("campaign")[0].status).toBe("ACTIVE");
  });

  it("a crash after Meta created the campaign but before the id was saved adopts it instead of creating another", async () => {
    const ws = await createBusiness({ budget: 5000 });
    const id = await propose(ws, "propose_campaign", campaignSpec());
    const tag = `mk-${id.slice(0, 8)}`;
    // What an earlier attempt left behind at Meta, with nothing recorded on our side.
    const orphan = meta.add("campaign", { name: `Mikee · something · ${tag}`, status: "PAUSED" });
    const d = await db();
    await d.update(schema.proposals).set({ status: "executing", attempts: 1 }).where(eq(schema.proposals.id, id));

    await executeProposal(id);
    expect(meta.list("campaign").map((c) => c.id)).toEqual([orphan.id]);
    expect(meta.list("ad")).toHaveLength(2);
    expect((await proposal(id)).status).toBe("done");
  });

  it("a failed post is retried only for the channel that failed", async () => {
    const ws = await createBusiness({ budget: 5000 });
    const id = await propose(ws, "propose_post", { title: "פוסט", channels: ["facebook", "instagram"], text: "קולקציה חדשה ✨", media: [{ type: "image", url: "https://cdn.example/a.jpg" }] });
    const { versionHash } = await proposal(id);
    meta.failOn((c) => c.path === "/ig_1/media_publish");

    await approveProposal(ws, id, versionHash);
    await drainJobs();
    expect((await proposal(id)).status).toBe("failed");
    expect(meta.list("fbpost")).toHaveLength(1);

    await approveProposal(ws, id, versionHash);
    await drainJobs();
    expect((await proposal(id)).status).toBe("done");
    expect(meta.list("fbpost")).toHaveLength(1);
    expect(meta.list("igpost")).toHaveLength(1);
    expect(meta.list("igcontainer")).toHaveLength(1); // the prepared container is reused
  });

  it("if a post was published but not recorded, the retry finds it instead of posting twice", async () => {
    const ws = await createBusiness({ budget: 5000 });
    const id = await propose(ws, "propose_post", { title: "פוסט", channels: ["facebook"], text: "מבצע סוף עונה" });
    meta.add("fbpost", { message: "מבצע סוף עונה" }); // published by an attempt that died before saving
    const d = await db();
    await d.update(schema.proposals).set({ status: "executing", attempts: 2 }).where(eq(schema.proposals.id, id));

    await executeProposal(id);
    expect(meta.list("fbpost")).toHaveLength(1);
    expect((await proposal(id)).status).toBe("done");
  });

  it("a budget increase approved twice is added once", async () => {
    const ws = await createBusiness({ budget: 1000 });
    const id = await propose(ws, "request_budget_increase", { amount: 400, reason: "הסרטון החדש מביא פניות בזול" });
    const { versionHash } = await proposal(id);
    await Promise.all([approveProposal(ws, id, versionHash), approveProposal(ws, id, versionHash)]);
    await drainJobs();
    const d = await db();
    const ext = await d.select().from(schema.budgetExtensions).where(eq(schema.budgetExtensions.workspaceId, ws));
    expect(ext.map((e) => Number(e.amount))).toEqual([400]);
  });

  it("cancelling a failed launch removes the paused half-built campaign", async () => {
    const ws = await createBusiness({ budget: 5000 });
    const id = await propose(ws, "propose_campaign", campaignSpec());
    meta.failOn((c) => c.path === "/act_1/ads");
    await approveProposal(ws, id, (await proposal(id)).versionHash);
    await drainJobs();
    expect(meta.list("campaign")).toHaveLength(1);

    await declineProposal(ws, id);
    await drainJobs();
    expect((await proposal(id)).status).toBe("cancelled");
    expect(meta.list("campaign")).toHaveLength(0);
  });
});

describe("no repeated suggestions", () => {
  it("blocks the same suggestion while a card is waiting", async () => {
    const ws = await createBusiness({ budget: 5000 });
    meta.add("campaign", { id: "c_live", name: "Running", status: "ACTIVE", daily_budget: "4000" });
    const change = { title: "עוצרים", why: "לא מביא", target: { type: "campaign", id: "c_live", name: "Running" }, change: { kind: "pause" } };
    await propose(ws, "propose_change", change);
    const again = await runTool({ workspaceId: ws, tz: TZ }, "propose_change", { ...change, title: "בוא נעצור" });
    expect(again.isError).toBe(true);
    expect(again.content).toMatch(/already waiting/);

    await propose(ws, "propose_campaign", campaignSpec());
    const dup = await runTool({ workspaceId: ws, tz: TZ }, "propose_campaign", campaignSpec({ title: "כותרת אחרת" }));
    expect(dup.isError).toBe(true);
  });

  it("does not bring back a declined suggestion for a week, unless the client asks", async () => {
    const ws = await createBusiness({ budget: 5000 });
    const id = await propose(ws, "propose_post", { title: "פוסט", channels: ["facebook"], text: "אותו טקסט" });
    await declineProposal(ws, id);
    const again = await runTool({ workspaceId: ws, tz: TZ }, "propose_post", { title: "פוסט", channels: ["facebook"], text: "אותו טקסט" });
    expect(again.content).toMatch(/declined/);
    await propose(ws, "propose_post", { title: "פוסט", channels: ["facebook"], text: "אותו טקסט", clientAsked: true });
  });
});
