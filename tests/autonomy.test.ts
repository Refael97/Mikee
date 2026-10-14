import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { approveProposal } from "@/lib/proposals";
import { runTool } from "@/lib/agent/tools";
import { removeConnection, saveConnection } from "@/lib/connections";
import { updateSettings } from "@/lib/settings";
import { startSuggestions } from "@/lib/suggestions";
import { AUTONOMY_RULES } from "@/lib/autonomy";
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

async function approvedCampaign(ws: string) {
  const r = await runTool({ workspaceId: ws, tz: TZ }, "propose_campaign", campaignSpec());
  const id = JSON.parse(r.content).proposalId as string;
  await approveProposal(ws, id, (await proposal(id)).versionHash);
  await drainJobs();
  return proposal(id);
}

describe("approval levels", () => {
  it("by default a built campaign stays paused and waits for its activation card", async () => {
    const ws = await createBusiness({ budget: 5000 });
    const p = await approvedCampaign(ws);
    expect(p.status).toBe("done");
    const activation = await proposal((p.result as any).activationProposalId);
    expect(activation.status).toBe("pending");
    expect(meta.list("campaign")[0].status).toBe("PAUSED");
  });

  it("at final approval only, one approval builds the campaign and takes it live after the check", async () => {
    const ws = await createBusiness({ budget: 5000 });
    await updateSettings(ws, { autonomy: "final" });
    const p = await approvedCampaign(ws);
    expect(p.result).toMatchObject({ autoActivated: true, paused: false });
    const activation = await proposal((p.result as any).activationProposalId);
    expect(activation.status).toBe("done");
    expect(meta.list("campaign")[0].status).toBe("ACTIVE");
    const d = await db();
    const log = await d.query.activity.findFirst({ where: and(eq(schema.activity.workspaceId, ws), eq(schema.activity.kind, "approval")), orderBy: (a, { desc }) => desc(a.id) });
    expect(log?.summary).toMatch(/אושר אוטומטית/);
  });

  it("every level still keeps spending and publishing behind a card", () => {
    for (const rule of Object.values(AUTONOMY_RULES)) expect(rule).not.toMatch(/without (a )?card|skip the card/i);
    expect(AUTONOMY_RULES.every_step).toMatch(/wait for her OK/);
  });
});

describe("home suggestions fit the business", () => {
  it("no store: no products or collections; leads, posts and messages instead", async () => {
    const ws = await createBusiness();
    const s = (await startSuggestions(ws)).map((x) => x.title).join(" | ");
    expect(s).not.toMatch(/קולקציה|מוצר|מלאי/);
    expect(s).toMatch(/פניות/);
    expect(s).toMatch(/איך הולך החודש/);
  });

  it("a store gets product suggestions; without Meta the first step is connecting", async () => {
    const ws = await createBusiness();
    await saveConnection(ws, "store", { domain: "studio.myshopify.com" }, "shop-token");
    expect((await startSuggestions(ws)).map((x) => x.title)).toContain("מוצר שרוצים לקדם");
    await removeConnection(ws, "meta");
    expect((await startSuggestions(ws))[0].title).toBe("לחבר את פייסבוק ואינסטגרם");
  });
});
