import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/lib/db";
import { runTool } from "@/lib/agent/tools";
import { budgetStatus, deliveryDays, syncMetaSpendCap } from "@/lib/budget";
import { metaContext } from "@/lib/meta/context";
import { approveProposal } from "@/lib/proposals";
import { getSettings } from "@/lib/settings";
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

const tool = (ws: string, name: string, input: unknown) => runTool({ workspaceId: ws, tz: TZ }, name, input);
const status = async (ws: string) => budgetStatus(ws, TZ, await metaContext(ws));

describe("projection of the month", () => {
  it("counts the days left, from a scheduled start, and up to an end date", () => {
    expect(deliveryDays(TZ)).toBe(12); // 20..31 October, today counted in full
    expect(deliveryDays(TZ, "2026-10-25T00:00:00Z")).toBe(7);
    expect(deliveryDays(TZ, null, "2026-10-22T21:00:00Z")).toBe(3);
    expect(deliveryDays(TZ, "2026-11-02T00:00:00Z")).toBe(0);
  });

  it("counts running budgets, ignores paused ones, includes changes made outside Mikee", async () => {
    const ws = await createBusiness({ budget: 3000 });
    meta.monthSpend = 800;
    meta.add("campaign", { name: "Running", status: "ACTIVE", daily_budget: "10000" }); // ₪100/day
    meta.add("campaign", { name: "Paused", status: "PAUSED", daily_budget: "50000" }); // ₪500/day, not spending
    const abo = meta.add("campaign", { name: "Ad-set budgets", status: "ACTIVE" });
    meta.add("adset", { name: "Starts on the 25th", campaign_id: abo.id, status: "ACTIVE", daily_budget: "5000", start_time: "2026-10-25T00:00:00Z" });

    let s = await status(ws);
    expect(s.committed).toBe(100 * 12 + 50 * 7);
    expect(s.paused.map((p) => p.name)).toEqual(["Paused"]);
    expect(s.buffer).toBeCloseTo(s.committed * 0.1);
    expect(s.headroom).toBeCloseTo(3000 - 800 - 1550 - 155);

    // Someone raises a budget directly in Ads Manager: the next check sees it.
    meta.add("campaign", { name: "Made in Ads Manager", status: "ACTIVE", daily_budget: "2000" });
    s = await status(ws);
    expect(s.committed).toBe(100 * 12 + 50 * 7 + 20 * 12);
  });
});

describe("the monthly ceiling", () => {
  it("blocks a campaign that does not fit, before the card is shown", async () => {
    const ws = await createBusiness({ budget: 1000 });
    meta.monthSpend = 500;
    const r = await tool(ws, "propose_campaign", campaignSpec({ dailyBudget: 50 })); // 50 × 12 = 600 > 500
    expect(r.isError).toBe(true);
    expect(r.content).toMatch(/Blocked by the monthly budget/);
    const d = await db();
    expect(await d.select().from(schema.proposals)).toHaveLength(0);
  });

  it("cards waiting for approval hold their amount, so two cards cannot overshoot together", async () => {
    const ws = await createBusiness({ budget: 1500 });
    const first = await tool(ws, "propose_campaign", campaignSpec({ dailyBudget: 50 })); // 600
    expect(first.isError).toBe(false);
    const second = await tool(ws, "propose_campaign", campaignSpec({ dailyBudget: 60, ads: [{ ...campaignSpec().ads[0], media: { type: "image", url: "https://cdn.example/c.jpg" } }] })); // 720
    expect(second.isError).toBe(false); // 600 + 720 = 1320 <= 1500
    const third = await tool(ws, "propose_campaign", campaignSpec({ dailyBudget: 20, ads: [{ ...campaignSpec().ads[0], media: { type: "image", url: "https://cdn.example/d.jpg" } }] })); // 240
    expect(third.isError).toBe(true);
    expect(third.content).toMatch(/waiting cards/);
  });

  it("re-checks at the moment of approval with live numbers", async () => {
    const ws = await createBusiness({ budget: 2000 });
    const r = await tool(ws, "propose_campaign", campaignSpec({ dailyBudget: 100 })); // 1200
    const id = JSON.parse(r.content).proposalId;
    meta.add("campaign", { name: "Started in Ads Manager meanwhile", status: "ACTIVE", daily_budget: "8000" }); // +960
    await approveProposal(ws, id, (await proposal(id)).versionHash);
    await drainJobs();

    const p = await proposal(id);
    expect(p.status).toBe("failed");
    expect((p.result as any).detail).toMatch(/monthly budget/);
    expect((p.result as any).error).toMatch(/התקציב החודשי/); // the client reads plain Hebrew
    expect(meta.writes(/campaigns|adsets|ads$/)).toEqual([]);
  });

  it("resuming a paused campaign is new spend and is checked", async () => {
    const ws = await createBusiness({ budget: 2000 });
    const paused = meta.add("campaign", { name: "Old campaign", status: "PAUSED", daily_budget: "30000" }); // ₪300/day × 12
    const r = await tool(ws, "propose_change", { title: "מחזירים", why: "עבד טוב", target: { type: "campaign", id: paused.id, name: "Old campaign" }, change: { kind: "resume" } });
    expect(r.isError).toBe(true);
    expect(r.content).toMatch(/Blocked by the monthly budget/);
  });

  it("only an increase the client approved raises the ceiling", async () => {
    const ws = await createBusiness({ budget: 500 });
    expect((await tool(ws, "propose_campaign", campaignSpec({ dailyBudget: 50 }))).isError).toBe(true);

    const req = await tool(ws, "request_budget_increase", { amount: 300, reason: "הקולקציה החדשה נמכרת מהר" });
    const id = JSON.parse(req.content).proposalId;
    expect((await tool(ws, "propose_campaign", campaignSpec({ dailyBudget: 50 }))).isError).toBe(true); // asked, not approved

    await approveProposal(ws, id, (await proposal(id)).versionHash);
    await drainJobs();
    expect((await status(ws)).limit).toBe(800);
    expect((await tool(ws, "propose_campaign", campaignSpec({ dailyBudget: 50 }))).isError).toBe(false);
  });

  it("without a budget set, nothing that spends can be proposed", async () => {
    const ws = await createBusiness();
    const r = await tool(ws, "propose_campaign", campaignSpec());
    expect(r.content).toMatch(/has not set a monthly budget/);
  });
});

describe("hard stop at Meta", () => {
  it("sets the ad account spending limit to what is left this month, and verifies it", async () => {
    const ws = await createBusiness({ budget: 3000 });
    meta.monthSpend = 1200;
    meta.account.amount_spent = "1000000"; // ₪10,000 lifetime
    const r = await syncMetaSpendCap(ws, TZ, await metaContext(ws));
    expect(r).toMatchObject({ ok: true, remaining: 1800, targetMajor: 11800 });
    expect(meta.account.spend_cap).toBe("1180000");
    expect((await getSettings(ws)).metaSpendCapStatus?.ok).toBe(true);

    await setBudget(ws, 2000);
    await syncMetaSpendCap(ws, TZ, await metaContext(ws));
    expect(meta.account.spend_cap).toBe("1080000");
  });
});
