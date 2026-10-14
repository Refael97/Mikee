import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { metaContext } from "@/lib/meta/context";
import { discoverIdentities, IdentityProblem, resolveIdentity, saveIdentity } from "@/lib/meta/identities";
import { runTool } from "@/lib/agent/tools";
import { approveProposal } from "@/lib/proposals";
import { FakeMeta } from "./support/fake-meta";
import { campaignSpec, createBusiness, drainJobs, NOW, proposal, TZ } from "./support/setup";

const NAMED = "610217812514916"; // Meta returns its name
const UNNAMED = "1750989859474449"; // Meta answers "Unsupported get request"

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
  // Existing ad sets in the account carry the identities, as in the real account.
  meta.add("adset", { name: "גיוס | ישראל", regional_regulated_categories: ["ISRAEL_FINSERV"], regional_regulation_identities: { universal_beneficiary: UNNAMED, universal_payer: UNNAMED } });
  meta.add("adset", { name: "ישן", regional_regulation_identities: { universal_beneficiary: NAMED, universal_payer: NAMED } });
  meta.add("identity", { id: NAMED, name: "מתניה" });
});

const ws = () => createBusiness({ budget: 5000 });
const pick = (id: string, name = "") => ({ id, name });

describe("finding the advertiser and payer the account already uses", () => {
  it("collects each id once from existing ad sets, with Meta's name only where Meta gives one", async () => {
    const d = await discoverIdentities(await metaContext(await ws()));
    expect(d.status).toBe("ok");
    if (d.status !== "ok") return;
    const byId = Object.fromEntries(d.candidates.map((c) => [c.id, c]));
    expect(byId[NAMED]).toMatchObject({ name: "מתניה", roles: ["beneficiary", "payer"], adsets: 1 });
    expect(byId[UNNAMED].name).toBeNull();
    expect(byId[UNNAMED].nameUnavailable).toBeTruthy();
    expect(d.categories).toEqual(["ISRAEL_FINSERV"]);
  });
});

describe("the client's choice", () => {
  it("refuses an id the account does not use; keeps Meta's name, or the client's where Meta has none", async () => {
    const w = await ws();
    const ctx = await metaContext(w);
    await expect(saveIdentity(ctx, { workspaceId: w, scope: "ad_account", beneficiary: pick("999999999", "x"), payer: pick("999999999", "x") })).rejects.toBeInstanceOf(IdentityProblem);
    const typed = await saveIdentity(ctx, { workspaceId: w, scope: "ad_account", beneficiary: pick(UNNAMED, "אדרט גרופ בע״מ"), payer: pick(UNNAMED, "אדרט גרופ בע״מ") });
    expect(typed).toMatchObject({ beneficiaryName: "אדרט גרופ בע״מ", nameSource: "client", adAccountId: "act_1" });
    const named = await saveIdentity(ctx, { workspaceId: w, scope: "workspace", beneficiary: pick(NAMED, "something else"), payer: pick(NAMED, "") });
    expect(named).toMatchObject({ beneficiaryName: "מתניה", nameSource: "meta", adAccountId: null });
  });

  it("the card's choice beats the account's, which beats the business's; nothing crosses to another business", async () => {
    const w = await ws();
    const ctx = await metaContext(w);
    await saveIdentity(ctx, { workspaceId: w, scope: "workspace", beneficiary: pick(NAMED), payer: pick(NAMED) });
    expect((await resolveIdentity(ctx, w))?.row.beneficiaryId).toBe(NAMED);
    await saveIdentity(ctx, { workspaceId: w, scope: "ad_account", beneficiary: pick(UNNAMED, "אדרט גרופ בע״מ"), payer: pick(UNNAMED, "אדרט גרופ בע״מ") });
    expect((await resolveIdentity(ctx, w))?.row.scope).toBe("ad_account");
    const r = await runTool({ workspaceId: w, tz: TZ }, "propose_campaign", campaignSpec());
    const id = JSON.parse(r.content).proposalId as string;
    await saveIdentity(ctx, { workspaceId: w, scope: "proposal", proposalId: id, beneficiary: pick(NAMED), payer: pick(NAMED) });
    expect((await resolveIdentity(ctx, w, id))?.row.scope).toBe("proposal");

    const other = await ws();
    expect(await resolveIdentity(await metaContext(other), other)).toBeNull();
  });
});

describe("building the ad set", () => {
  it("after 100/3858634 and the client's choice, the retry continues from the same paused campaign and sends the identities outside targeting", async () => {
    const w = await ws();
    const r = await runTool({ workspaceId: w, tz: TZ }, "propose_campaign", campaignSpec());
    const id = JSON.parse(r.content).proposalId as string;
    const msg = "Invalid parameter";
    meta.failOn((c) => c.method === "POST" && c.path === "/act_1/adsets", 1, msg, 100, 3858634);
    await approveProposal(w, id, (await proposal(id)).versionHash);
    await drainJobs();
    const failed = await proposal(id);
    expect(failed.status).toBe("failed");
    expect((failed.result as any).meta).toMatchObject({ code: 100, error_subcode: 3858634 });
    const campaign = meta.list("campaign");
    expect(campaign).toHaveLength(1);

    await saveIdentity(await metaContext(w), { workspaceId: w, scope: "ad_account", beneficiary: pick(UNNAMED, "אדרט גרופ בע״מ"), payer: pick(UNNAMED, "אדרט גרופ בע״מ") });
    await approveProposal(w, id, (await proposal(id)).versionHash);
    await drainJobs();
    expect((await proposal(id)).status).toBe("done");
    expect(meta.list("campaign")).toHaveLength(1); // the same campaign, not a new one
    const post = meta.writes(/\/act_1\/adsets$/).at(-1)!;
    expect(JSON.parse(post.params.regional_regulation_identities)).toEqual({ universal_beneficiary: UNNAMED, universal_payer: UNNAMED });
    expect(post.params.targeting).not.toContain("regional_regulation");
    expect(post.params.regional_regulated_categories).toBeUndefined(); // no category copied from other ad sets
    expect(post.params.status).toBe("PAUSED");
    // Read back from Meta and kept on the card's result.
    expect((await proposal(id)).result).toMatchObject({ identities: { universal_beneficiary: UNNAMED, universal_payer: UNNAMED } });
  });
});
