import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { MIKEE_CONSTITUTION } from "@/lib/agent/prompt";
import { MIKEE_TOOLS, setAnthropicForTests } from "@/lib/agent/run";
import { runTool } from "@/lib/agent/tools";
import { appendMessage } from "@/lib/conversation";
import { createConversation } from "@/lib/conversations";
import { db, schema } from "@/lib/db";
import { enqueue } from "@/lib/jobs";
import { approveProposal } from "@/lib/proposals";
import { FakeMeta } from "./support/fake-meta";
import { campaignSpec, createBusiness, drainJobs, fakeTeam, NOW, proposal, toolUse, TZ } from "./support/setup";

let meta: FakeMeta;
let uninstall: () => void;
beforeAll(() => vi.useFakeTimers({ toFake: ["Date"], now: NOW }));
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  meta = new FakeMeta();
  uninstall = meta.install();
  // A live campaign of this business, with one ad set and its two ads.
  meta.add("campaign", { id: "120252159674590503", name: "קולקציית חורף", account_id: "1", objective: "OUTCOME_TRAFFIC", status: "ACTIVE" });
  meta.add("adset", { id: "120252159679810503", name: "נשים תל אביב", account_id: "1", campaign_id: "120252159674590503", daily_budget: "5000", status: "ACTIVE", optimization_goal: "LINK_CLICKS", destination_type: "WEBSITE" });
  meta.add("ad", { id: "120252159700760503", name: "שמלה שחורה", account_id: "1", adset_id: "120252159679810503", status: "ACTIVE" });
  meta.add("ad", { id: "120252159700760504", name: "שמלה לבנה", account_id: "1", adset_id: "120252159679810503", status: "ACTIVE" });
});
afterEach(() => {
  uninstall();
  setAnthropicForTests(null);
});

const CAMPAIGN = "120252159674590503";
const SOURCE = "120252159679810503";
const men = { description: "גברים 30-50 בישראל", countries: ["IL"], genders: "men", ageMin: 30, ageMax: 50, advantage: false };
const ctx = (ws: string) => ({ workspaceId: ws, tz: TZ });
const sysOf = (req: any) => req.system.map((b: any) => b.text).join("\n");

async function campaignsCreated() {
  return meta.writes(/^\/act_1\/campaigns$/).length;
}

describe("duplicating an ad set (acceptance)", () => {
  it("'שכפל את הסדרה הזאת באותו קמפיין, כולל שתי המודעות, לקהל אחר': same campaign, a new ad set, two copied ads, zero new campaigns", async () => {
    const ws = await createBusiness({ budget: 5000 });
    const team = fakeTeam({
      mikee: [
        (req) => {
          expect(sysOf(req)).toContain("propose_adset_copy");
          // Only the source ad set: the server reads its campaign.
          return {
            stop_reason: "tool_use",
            content: [toolUse("m1", "propose_adset_copy", { title: "אותה סדרה, לקהל של גברים", why: "בודקים אם אותן מודעות עובדות גם אצל גברים", sourceAdsetId: SOURCE, includeAds: true, changes: { audience: men }, clientAsked: true })],
          };
        },
      ],
    });
    setAnthropicForTests(team);
    const conv = (await createConversation(ws, { firstText: "שכפל את הסדרה" })).id;
    await appendMessage(ws, conv, "user", "chat", [{ type: "text", text: "שכפל את הסדרה הזאת באותו קמפיין, כולל שתי המודעות, לקהל אחר." }]);
    await enqueue(ws, "turn", { conversationId: conv });
    await drainJobs();

    const d = await db();
    const [card] = await d.select().from(schema.proposals).where(and(eq(schema.proposals.workspaceId, ws), eq(schema.proposals.kind, "adset_copy")));
    expect(card.status).toBe("pending");
    const shown = JSON.stringify(card.card);
    expect(shown).toContain("אותו קמפיין");
    expect(shown).toContain("2 המודעות מועתקות");
    expect(shown).toContain("גברים 30-50");
    expect(meta.writes()).toEqual([]); // nothing at Meta before approval

    await approveProposal(ws, card.id, card.versionHash);
    await drainJobs();
    const done = await proposal(card.id);
    expect(done.status).toBe("done");
    const r = done.result as any;

    // Exactly the tested call, once: same campaign, with ads, paused.
    const copies = meta.writes(/\/copies$/);
    expect(copies).toHaveLength(1);
    expect(copies[0].path).toBe(`/${SOURCE}/copies`);
    expect(copies[0].params).toMatchObject({ campaign_id: CAMPAIGN, deep_copy: "true", status_option: "PAUSED" });

    // Same campaign id, a new ad set, the two ads copied, zero new campaigns.
    expect(r.campaignId).toBe(CAMPAIGN);
    expect(r.adsetId).not.toBe(SOURCE);
    expect(r.adIds).toHaveLength(2);
    expect(await campaignsCreated()).toBe(0);
    expect(meta.list("campaign")).toHaveLength(1);
    const copy = meta.nodes.get(r.adsetId)!;
    expect([copy.campaign_id, copy.status]).toEqual([CAMPAIGN, "PAUSED"]);
    expect(JSON.parse(copy.targeting)).toMatchObject({ genders: [1], age_min: 30, age_max: 50 }); // the new audience, set on the paused copy
    expect(meta.list("ad").filter((a) => a.adset_id === r.adsetId).map((a) => a.status)).toEqual(["PAUSED", "PAUSED"]);
    expect(Object.keys(r.adMap).sort()).toEqual(["120252159700760503", "120252159700760504"]);
    // The source is untouched.
    expect(meta.nodes.get(SOURCE)!.status).toBe("ACTIVE");

    // Going live is its own card, for the new ad set only; the campaign is left as it is.
    const act = await proposal(r.activationProposalId);
    expect([act.kind, act.status, (act.action as any).scope, (act.card as any).label]).toEqual(["activate", "pending", "adsets", "הפעלת סדרה"]);
    const before = meta.writes(new RegExp(`^/${CAMPAIGN}$`)).length;
    await approveProposal(ws, act.id, act.versionHash);
    await drainJobs();
    expect((await proposal(act.id)).status).toBe("done");
    expect(meta.nodes.get(r.adsetId)!.status).toBe("ACTIVE");
    expect(meta.writes(new RegExp(`^/${CAMPAIGN}$`)).length).toBe(before);
  });

  it("an answer lost after Meta made the copy: the retry finds the copy and does not send /copies again", async () => {
    const ws = await createBusiness({ budget: 5000 });
    const out = JSON.parse((await runTool(ctx(ws), "propose_adset_copy", { title: "עותק", why: "עוד קהל", sourceAdsetId: SOURCE, includeAds: true })).content);
    const p = await proposal(out.proposalId);
    // Meta makes the copy, but the answer never arrives.
    meta.failOn((c) => c.path === `/${SOURCE}/copies`, 1, "socket hang up");
    await approveProposal(ws, p.id, p.versionHash);
    await drainJobs();
    expect((await proposal(p.id)).status).toBe("failed");
    const made = meta.add("adset", { name: "נשים תל אביב - Copy", account_id: "1", campaign_id: CAMPAIGN, status: "PAUSED" });
    meta.add("ad", { account_id: "1", adset_id: made.id, status: "PAUSED" });
    meta.add("ad", { account_id: "1", adset_id: made.id, status: "PAUSED" });

    await approveProposal(ws, p.id, p.versionHash);
    await drainJobs();
    const done = await proposal(p.id);
    expect(done.status).toBe("done");
    expect((done.result as any).adsetId).toBe(made.id);
    expect(meta.calls.filter((c) => c.path === `/${SOURCE}/copies`)).toHaveLength(1); // only the first, lost one
    expect(meta.list("adset").filter((a) => a.campaign_id === CAMPAIGN)).toHaveLength(2);
  });

  it("when something new appeared that cannot be identified as the copy, the retry stops instead of copying again", async () => {
    const ws = await createBusiness({ budget: 5000 });
    const out = JSON.parse((await runTool(ctx(ws), "propose_adset_copy", { title: "עותק", why: "עוד קהל", sourceAdsetId: SOURCE, includeAds: true })).content);
    const p = await proposal(out.proposalId);
    meta.failOn((c) => c.path === `/${SOURCE}/copies`, 1, "socket hang up");
    await approveProposal(ws, p.id, p.versionHash);
    await drainJobs();
    meta.add("adset", { name: "שם אחר לגמרי", account_id: "1", campaign_id: CAMPAIGN, status: "PAUSED" });
    await approveProposal(ws, p.id, p.versionHash);
    await drainJobs();
    const failed = await proposal(p.id);
    expect(failed.status).toBe("failed");
    expect((failed.result as any).retryable).toBe(false);
    expect((failed.result as any).error).toMatch(/לא שלחתי אותה שוב/);
    expect(meta.calls.filter((c) => c.path === `/${SOURCE}/copies`)).toHaveLength(1);
  });

  it("a copy request Meta refused is sent again on retry (nothing was made)", async () => {
    const ws = await createBusiness({ budget: 5000 });
    const out = JSON.parse((await runTool(ctx(ws), "propose_adset_copy", { title: "עותק", why: "עוד קהל", sourceAdsetId: SOURCE, includeAds: false })).content);
    const p = await proposal(out.proposalId);
    meta.failOn((c) => c.path === `/${SOURCE}/copies`, 1, "temporary", 2);
    await approveProposal(ws, p.id, p.versionHash);
    await drainJobs();
    await approveProposal(ws, p.id, p.versionHash);
    await drainJobs();
    expect((await proposal(p.id)).status).toBe("done");
    expect(meta.list("adset").filter((a) => a.campaign_id === CAMPAIGN)).toHaveLength(2);
    expect(meta.writes(/\/copies$/).filter((c) => c.params.deep_copy === "false")).toHaveLength(2);
  });

  it("only this business's ad sets and matching campaigns; nothing else is prepared instead", async () => {
    const ws = await createBusiness({ budget: 5000 });
    meta.add("adset", { id: "999001", name: "של מישהו אחר", account_id: "999", campaign_id: "999000", status: "ACTIVE" });
    meta.add("campaign", { id: "777000", name: "קמפיין לידים", account_id: "1", objective: "OUTCOME_LEADS", status: "ACTIVE" });
    const foreign = JSON.parse((await runTool(ctx(ws), "propose_adset_copy", { title: "עותק", why: "עוד קהל", sourceAdsetId: "999001", includeAds: true })).content);
    expect(foreign.error).toMatch(/not in this business's ad account/);
    const mismatch = JSON.parse((await runTool(ctx(ws), "propose_adset_copy", { title: "עותק", why: "עוד קהל", sourceAdsetId: SOURCE, includeAds: true, targetCampaignId: "777000" })).content);
    expect(mismatch.error).toMatch(/different goal/);
    const d = await db();
    expect(await d.select().from(schema.proposals).where(eq(schema.proposals.workspaceId, ws))).toEqual([]);
  });
});

describe("adding an ad set to an existing campaign", () => {
  it("builds the ad set and its ads inside that campaign, paused, and opens a card for just that ad set", async () => {
    const ws = await createBusiness({ budget: 5000 });
    const out = JSON.parse(
      (
        await runTool(ctx(ws), "propose_adset", {
          title: "סדרה לגברים בקמפיין הקיים",
          why: "קהל חדש באותו קמפיין",
          campaignId: CAMPAIGN,
          adset: { name: "גברים 30-50", dailyBudget: 40, audience: men, ads: campaignSpec().ads },
        })
      ).content,
    );
    expect(out).toMatchObject({ campaignId: CAMPAIGN, newCampaign: false });
    const p = await proposal(out.proposalId);
    expect(JSON.stringify(p.card)).toContain("קמפיין קיים, לא נוצר קמפיין חדש");
    await approveProposal(ws, p.id, p.versionHash);
    await drainJobs();
    const r = (await proposal(p.id)).result as any;
    expect((await proposal(p.id)).status).toBe("done");
    expect(r.campaignId).toBe(CAMPAIGN);
    expect(await campaignsCreated()).toBe(0);
    const set = meta.nodes.get(r.adsetId)!;
    expect([set.campaign_id, set.status, set.daily_budget, set.optimization_goal]).toEqual([CAMPAIGN, "PAUSED", "4000", "LINK_CLICKS"]);
    expect(r.adIds).toHaveLength(2);
    expect((await proposal(r.activationProposalId)).action).toMatchObject({ scope: "adsets", adsetIds: [r.adsetId], dailyBudget: 40 });
  });
});

describe("a new campaign with several ad sets", () => {
  it("one campaign, three ad sets with their ads, and one activation for all of them", async () => {
    const ws = await createBusiness({ budget: 9000 });
    const extra = (name: string, audience: object) => ({ name, dailyBudget: 30, audience, ads: campaignSpec().ads.slice(0, 1) });
    const out = JSON.parse(
      (await runTool(ctx(ws), "propose_campaign", campaignSpec({ moreAdsets: [extra("גברים", men), extra("נשים 25-45", { description: "נשים 25-45", genders: "women", ageMin: 25, ageMax: 45 })] }))).content,
    );
    const p = await proposal(out.proposalId);
    expect(JSON.stringify(p.card)).toContain("סדרה 3");
    await approveProposal(ws, p.id, p.versionHash);
    await drainJobs();
    const r = (await proposal(p.id)).result as any;
    expect((await proposal(p.id)).status).toBe("done");
    expect(await campaignsCreated()).toBe(1);
    const sets = meta.list("adset").filter((a) => a.campaign_id === r.campaignId);
    expect(sets.map((x) => x.daily_budget).sort()).toEqual(["3000", "3000", "5000"]);
    expect(r.adIds).toHaveLength(4);
    const act = await proposal(r.activationProposalId);
    expect((act.action as any).adsetIds).toHaveLength(3);
    expect((act.action as any).dailyBudget).toBe(110);
    await approveProposal(ws, act.id, act.versionHash);
    await drainJobs();
    expect(sets.map((x) => meta.nodes.get(x.id)!.status)).toEqual(["ACTIVE", "ACTIVE", "ACTIVE"]);
    expect(meta.nodes.get(r.campaignId)!.status).toBe("ACTIVE");
  });
});

describe("saying it straight", () => {
  it("a wrong card is withdrawn and cannot be approved; the wording is plain", async () => {
    const ws = await createBusiness({ budget: 5000 });
    const out = JSON.parse((await runTool(ctx(ws), "propose_campaign", campaignSpec())).content);
    const w = JSON.parse((await runTool(ctx(ws), "withdraw_card", { proposalId: out.proposalId, reason: "she asked for an ad set in the existing campaign" })).content);
    expect(w.withdrawn).toBe(true);
    const p = await proposal(out.proposalId);
    expect(p.status).toBe("withdrawn");
    await expect(approveProposal(ws, p.id, p.versionHash)).rejects.toThrow(/לא תבוצע/);
    expect(MIKEE_TOOLS.map((t) => t.name)).toEqual(expect.arrayContaining(["propose_adset", "propose_adset_copy", "withdraw_card"]));
    expect(MIKEE_CONSTITUTION).toContain("ביקשת סדרה באותו קמפיין; הכנתי קמפיין נפרד. זו טעות, וההצעה הזאת לא תבוצע.");
    expect(MIKEE_CONSTITUTION).toContain("answer plainly in one short sentence");
    expect(MIKEE_CONSTITUTION).toContain('without hedging or "את לא צודקת לגמרי"');
  });
});
