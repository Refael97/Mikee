import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { appendMessage } from "@/lib/conversation";
import { createConversation } from "@/lib/conversations";
import { enqueue } from "@/lib/jobs";
import { setAnthropicForTests } from "@/lib/agent/run";
import { runTool } from "@/lib/agent/tools";
import { approveProposal } from "@/lib/proposals";
import { getConnection, saveConnection, type MetaConfig } from "@/lib/connections";
import { CampaignSpec } from "@/lib/specs";
import { metaContext } from "@/lib/meta/context";
import { verifyBuild } from "@/lib/meta/actions";
import { resolveCatalog } from "@/lib/meta/catalog";
import { CATALOG_GUIDANCE } from "@/lib/agent/catalog-guidance";
import { MIKEE_CONSTITUTION } from "@/lib/agent/prompt";
import { SPECIALISTS } from "@/lib/agent/specialists";
import { FakeMeta } from "./support/fake-meta";
import { campaignSpec, createBusiness, drainJobs, fakeTeam, NOW, proposal, setBudget, toolUse, TZ } from "./support/setup";

let meta: FakeMeta;
let uninstall: () => void;
beforeAll(() => vi.useFakeTimers({ toFake: ["Date"], now: NOW }));
afterAll(() => { uninstall?.(); vi.useRealTimers(); });
beforeEach(() => {
  uninstall?.(); meta = new FakeMeta(); uninstall = meta.install();
  meta.add("catalog", { id: "9001", name: "המוצרים שלנו", vertical: "commerce", product_count: 7 });
  meta.add("productset", { id: "9002", name: "כל המוצרים", product_catalog: { id: "9001" }, product_count: 7 });
});

const input = (over: Record<string, unknown> = {}) => campaignSpec({
  goal: "sales", buildOnly: true,
  catalog: { catalogId: "9001", productSetId: "9002", format: "carousel" },
  ads: [{ primaryText: "גלו את המוצרים שלנו", headline: "{{product.name}}", link: "https://studio.example/", cta: "SHOP_NOW" }],
  ...over,
});
async function business(settings: Record<string, unknown> = {}) {
  const ws = await createBusiness({ budget: 5000, settings });
  const conn = (await getConnection<MetaConfig>(ws, "meta"))!;
  // A catalog campaign uses the catalog's event sources, not a mandatory manually selected pixel.
  await saveConnection(ws, "meta", { ...conn.config, pixelId: undefined, catalogId: "9001" }, conn.secret!);
  return ws;
}
async function propose(ws: string, spec = input()) {
  const result = await runTool({ workspaceId: ws, tz: TZ }, "propose_campaign", spec);
  return result.isError ? { error: result.content } : JSON.parse(result.content);
}
async function approve(ws: string, id: string) {
  await approveProposal(ws, id, (await proposal(id)).versionHash);
  await drainJobs();
  return proposal(id);
}

describe("catalog campaigns, from the agent's tool to the Meta build", () => {
  it("discovers the selected catalog and real product sets without hiding other context", async () => {
    const ws = await business();
    const result = JSON.parse((await runTool({ workspaceId: ws, tz: TZ }, "get_campaign_context", {})).content);
    expect(result.catalog).toMatchObject({ status: "ok", id: "9001", productSets: [{ id: "9002", product_count: 7 }] });
    meta.failOn((c) => c.path === "/9001/product_sets", 1, "Missing catalog permission", 200);
    const partial = JSON.parse((await runTool({ workspaceId: ws, tz: TZ }, "get_campaign_context", {})).content);
    expect(partial.catalog.status).toBe("error");
    expect(partial.budget.status).toBe("ok");
  });

  it("builds actual product templates only after approval, all paused, even with final autonomy", async () => {
    const ws = await business({ autonomy: "final" });
    const { proposalId } = await propose(ws);
    expect(proposalId).toBeTruthy();
    expect(meta.writes()).toHaveLength(0);
    const card = JSON.stringify((await proposal(proposalId)).card);
    expect(card).toContain("כל המוצרים");
    expect(card).toContain("המוצרים שלנו");
    const built = await approve(ws, proposalId);
    expect(built.status, JSON.stringify(built.result)).toBe("done");
    expect((built.result as any).activationProposalId).toBeFalsy();
    expect(meta.list("campaign")[0]).toMatchObject({ objective: "OUTCOME_SALES", promoted_object: { product_catalog_id: "9001" }, status: "PAUSED" });
    expect(meta.list("adset")[0]).toMatchObject({ promoted_object: { product_set_id: "9002", custom_event_type: "PURCHASE" }, optimization_goal: "OFFSITE_CONVERSIONS", status: "PAUSED" });
    const creative = meta.list("creative")[0];
    expect(creative.product_set_id).toBe("9002");
    expect(creative.object_story_spec.template_data).toMatchObject({ name: "{{product.name}}", message: "גלו את המוצרים שלנו", call_to_action: { type: "SHOP_NOW" } });
    expect(creative.object_story_spec.template_data.call_to_action).not.toHaveProperty("value");
    expect(creative.object_story_spec.template_data).not.toHaveProperty("force_single_link");
    expect(meta.list("ad")[0].status).toBe("PAUSED");
    expect(meta.writes(/adimages|advideos/)).toHaveLength(0);
    expect(meta.writes().some((c) => c.params.status === "ACTIVE")).toBe(false);
  });

  it("supports single-product format and a separate owner-approved activation", async () => {
    const ws = await business();
    const { proposalId } = await propose(ws, input({ buildOnly: false, catalog: { catalogId: "9001", productSetId: "9002", format: "single_image" } }));
    const built = await approve(ws, proposalId);
    expect(built.status, JSON.stringify(built.result)).toBe("done");
    expect(meta.list("creative")[0].object_story_spec.template_data.force_single_link).toBe(true);
    const activationId = (built.result as any).activationProposalId;
    const activation = await proposal(activationId);
    expect(activation.status).toBe("pending");
    expect(JSON.stringify(activation.card)).toContain("כל המוצרים");
    expect(meta.list("campaign")[0].status).toBe("PAUSED");
    expect((await approve(ws, activationId)).status).toBe("done");
    expect(meta.list("campaign")[0].status).toBe("ACTIVE");
  });

  it("resumes a failed catalog build without duplicating the campaign or ad set", async () => {
    const ws = await business();
    const { proposalId } = await propose(ws);
    meta.failOn((c) => c.method === "POST" && c.path === "/act_1/ads", 1, "Bad ad parameter", 100);
    expect((await approve(ws, proposalId)).status).toBe("failed");
    const campaignId = meta.list("campaign")[0].id;
    expect((await approve(ws, proposalId)).status).toBe("done");
    expect(meta.list("campaign").map((c) => c.id)).toEqual([campaignId]);
    expect(meta.list("adset")).toHaveLength(1);
    expect(meta.list("ad")).toHaveLength(1);
  });

  it("rechecks catalog ownership after approval and blocks changed or foreign assets before writes", async () => {
    const ws = await business();
    const { proposalId } = await propose(ws);
    meta.nodes.get("9002")!.product_catalog = { id: "9999" };
    expect((await approve(ws, proposalId)).status).toBe("failed");
    expect(meta.writes()).toHaveLength(0);
  });

  it("rejects another business's catalog, a foreign set, and an empty set without creating a card", async () => {
    const ws = await business();
    expect((await propose(ws, input({ catalog: { catalogId: "9999", productSetId: "9002" } }))).error).toBeTruthy();
    meta.nodes.get("9002")!.product_catalog = { id: "9999" };
    expect((await propose(ws)).error).toBeTruthy();
    meta.nodes.get("9002")!.product_catalog = { id: "9001" };
    meta.nodes.get("9002")!.product_count = 0;
    expect((await propose(ws)).error).toBeTruthy();
    expect(meta.writes()).toHaveLength(0);
  });

  it("checks a product when Meta omits its count, rather than guessing", async () => {
    const ws = await business(); const ctx = await metaContext(ws);
    meta.nodes.get("9002")!.product_count = null;
    const spec = CampaignSpec.parse(input()).catalog!;
    await expect(resolveCatalog(ctx, spec)).rejects.toThrow(/ריק/);
    meta.nodes.get("9002")!.products = [{ id: "9003" }];
    await expect(resolveCatalog(ctx, spec)).resolves.toMatchObject({ productSetName: "כל המוצרים" });
  });

  it("detects a mismatched product set in Meta readback", async () => {
    const ws = await business(); const { proposalId } = await propose(ws);
    const built = await approve(ws, proposalId);
    meta.list("adset")[0].promoted_object.product_set_id = "9999";
    const result = await verifyBuild(await metaContext(ws), CampaignSpec.parse(input()), built.result as any);
    expect(result.ok).toBe(false);
    expect(result.mismatches.join(" ")).toContain("product set");
  });

  it("builds multiple catalog ad sets under one campaign", async () => {
    const ws = await business();
    const spec = input({ buildOnly: false, moreAdsets: [{ name: "קהל נוסף", dailyBudget: 30, audience: campaignSpec().audience, ads: input().ads }] });
    const { proposalId } = await propose(ws, spec);
    const built = await approve(ws, proposalId);
    expect(built.status, JSON.stringify(built.result)).toBe("done");
    expect(meta.list("campaign")).toHaveLength(1);
    expect(meta.list("adset")).toHaveLength(2);
    expect(meta.list("ad")).toHaveLength(2);
    expect((await approve(ws, (built.result as any).activationProposalId)).status).toBe("done");
    expect(meta.list("adset").every((s) => s.status === "ACTIVE")).toBe(true);
  });

  it("blocks activation if someone changes the catalog template after the build", async () => {
    const ws = await business();
    const { proposalId } = await propose(ws, input({ buildOnly: false }));
    const built = await approve(ws, proposalId);
    meta.list("ad")[0].creative.object_story_spec.template_data.link = "https://changed.example/";
    expect((await approve(ws, (built.result as any).activationProposalId)).status).toBe("failed");
    expect(meta.list("campaign")[0].status).toBe("PAUSED");
    expect(meta.writes().some((c) => c.params.status === "ACTIVE")).toBe(false);
  });

  it("can retry an approved activation that stopped after activating its ads", async () => {
    const ws = await business(); const { proposalId } = await propose(ws, input({ buildOnly: false }));
    const built = await approve(ws, proposalId);
    const activationId = (built.result as any).activationProposalId;
    meta.failOn((c) => c.method === "POST" && c.path === `/${meta.list("adset")[0].id}` && c.params.status === "ACTIVE", 1, "Temporary failure", 100);
    expect((await approve(ws, activationId)).status).toBe("failed");
    expect(meta.list("campaign")[0].status).toBe("PAUSED");
    expect((await approve(ws, activationId)).status).toBe("done");
    expect(meta.list("campaign")[0].status).toBe("ACTIVE");
    expect(meta.list("campaign")).toHaveLength(1);
  });

  it("keeps the fresh budget gate before catalog writes", async () => {
    const ws = await business(); const { proposalId } = await propose(ws);
    await setBudget(ws, 10);
    expect((await approve(ws, proposalId)).status).toBe("failed");
    expect(meta.writes()).toHaveLength(0);
  });

  it("can use the short two-call agent path for a catalog test, without a creative specialist", async () => {
    const ws = await business();
    const team = fakeTeam({ mikee: [req => {
      expect(req.tools.some((t: { name: string }) => t.name === "propose_campaign")).toBe(true);
      expect(req.system.map((b: any) => b.text).join(" ")).toContain("Catalog campaigns ARE supported");
      return { stop_reason: "tool_use", content: [toolUse("context", "get_campaign_context", {})] };
    }, () => ({ stop_reason: "tool_use", content: [toolUse("catalog", "propose_campaign", { ...input(), clientAsked: true })] })] });
    setAnthropicForTests(team);
    const conv = await createConversation(ws);
    await appendMessage(ws, conv.id, "user", "chat", [{ type: "text", text: "בנה קמפיין קטלוג למוצרים שלנו, 50 שקל ביום, כמבחן מושהה בלבד" }]);
    await enqueue(ws, "turn", { conversationId: conv.id });
    await drainJobs();
    expect(team.requests.map((r) => r.agent)).toEqual(["mikee", "mikee"]);
    const d = await db();
    const cards = await d.select().from(schema.proposals).where(eq(schema.proposals.workspaceId, ws));
    expect(cards).toHaveLength(1);
    expect(cards[0].action).toMatchObject({ goal: "sales", catalog: { productSetId: "9002" }, buildOnly: true });
    expect(meta.writes()).toHaveLength(0);
    expect((await approve(ws, cards[0].id)).status).toBe("done");
  });

  it("keeps ordinary ads strict, rejects mixed catalog/media specs, and requires sales", () => {
    expect(CampaignSpec.safeParse(input({ catalog: undefined })).success).toBe(false);
    expect(CampaignSpec.safeParse(input({ goal: "traffic" })).success).toBe(false);
    expect(CampaignSpec.safeParse(input({ ads: campaignSpec().ads })).success).toBe(false);
    expect(CampaignSpec.safeParse(campaignSpec()).success).toBe(true);
  });

  it.each(["commerce", "services"])("builds a %s catalog using the Page's real Instagram identity, even if the saved IG selection is empty", async (vertical) => {
    const ws = await business();
    meta.nodes.get("9001")!.vertical = vertical;
    const conn = (await getConnection<MetaConfig>(ws, "meta"))!;
    await saveConnection(ws, "meta", { ...conn.config, igUserId: undefined }, conn.secret!);
    const spec = input({ ads: [{ primaryText: "בדיקת קטלוג", link: "https://studio.example/", cta: vertical === "services" ? "LEARN_MORE" : "SHOP_NOW" }] });
    const { proposalId } = await propose(ws, spec);
    const p = await proposal(proposalId);
    expect(p.action.catalog).toMatchObject({ vertical, instagramUserId: "ig_1" });
    const built = await approve(ws, proposalId);
    expect(built.status, JSON.stringify(built.result)).toBe("done");
    expect(meta.list("creative")[0].object_story_spec).toMatchObject({ page_id: "page_1", instagram_user_id: "ig_1", template_data: { name: vertical === "services" ? "השירותים שלנו" : "{{product.name}}" } });
    expect(meta.list("ad")).toHaveLength(1);
    expect(meta.writes(/adimages|advideos/)).toHaveLength(0);
    expect(meta.writes().some((c) => c.params.status === "ACTIVE")).toBe(false);
  });

  it.each([["commerce", "products"], ["services", "professional_services"]])("checks unknown item count for %s through /%s", async (vertical, edge) => {
    const ws = await business(); meta.nodes.get("9001")!.vertical = vertical;
    meta.nodes.get("9002")!.product_count = null;
    meta.nodes.get("9002")!.products = [{ id: "9003" }];
    const { proposalId } = await propose(ws);
    expect(proposalId).toBeTruthy();
    expect(meta.calls.some((c) => c.path === `/9002/${edge}`)).toBe(true);
    expect(meta.calls.some((c) => c.path === `/9002/${edge === "products" ? "professional_services" : "products"}`)).toBe(false);
  });

  it("uses Facebook-only placements when the business has no Instagram, and says so on the card", async () => {
    const ws = await business(); const conn = (await getConnection<MetaConfig>(ws, "meta"))!;
    await saveConnection(ws, "meta", { ...conn.config, igUserId: undefined }, conn.secret!);
    delete meta.nodes.get("page_1")!.instagram_business_account;
    const { proposalId } = await propose(ws);
    expect(JSON.stringify((await proposal(proposalId)).card)).toContain("פייסבוק בלבד");
    const built = await approve(ws, proposalId);
    expect(built.status, JSON.stringify(built.result)).toBe("done");
    expect(meta.list("adset")[0].targeting.publisher_platforms).toEqual(["facebook"]);
    expect(meta.list("creative")[0].object_story_spec).not.toHaveProperty("instagram_user_id");
  });

  it("blocks a stored Instagram belonging to another Page before creating a card", async () => {
    const ws = await business();
    meta.nodes.get("page_1")!.instagram_business_account = { id: "foreign_ig" };
    expect((await propose(ws)).error).toMatch(/אינסטגרם/);
    expect(meta.writes()).toHaveLength(0);
  });

  it("blocks an Instagram identity change between approval and execution before writes", async () => {
    const ws = await business(); const { proposalId } = await propose(ws);
    const conn = (await getConnection<MetaConfig>(ws, "meta"))!;
    await saveConnection(ws, "meta", { ...conn.config, igUserId: undefined }, conn.secret!);
    meta.nodes.get("page_1")!.instagram_business_account = { id: "new_ig" };
    expect((await approve(ws, proposalId)).status).toBe("failed");
    expect(meta.writes()).toHaveLength(0);
  });

  it("reports an unsupported vertical instead of treating it as commerce", async () => {
    const ws = await business(); meta.nodes.get("9001")!.vertical = "hotels";
    expect((await propose(ws)).error).toMatch(/hotels/);
    expect(meta.writes()).toHaveLength(0);
  });

  it("verifies the actual Instagram identity in Meta readback", async () => {
    const ws = await business(); const { proposalId } = await propose(ws);
    const built = await approve(ws, proposalId);
    meta.list("ad")[0].creative.object_story_spec.instagram_user_id = "foreign_ig";
    const checked = await verifyBuild(await metaContext(ws), CampaignSpec.parse((await proposal(proposalId)).action), built.result as any);
    expect(checked.ok).toBe(false);
    expect(checked.mismatches.join(" ")).toContain("identity");
  });

  it("shares the same services/ecommerce instructions between Mikee and the media buyer", () => {
    expect(MIKEE_CONSTITUTION).toContain(CATALOG_GUIDANCE);
    expect(SPECIALISTS.find((s) => s.id === "media_buyer")!.instructions).toContain(CATALOG_GUIDANCE);
    expect(CATALOG_GUIDANCE).toContain("vertical=services");
    expect(CATALOG_GUIDANCE).toContain("vertical=commerce");
    expect(CATALOG_GUIDANCE).toContain("1772103");
  });
});
