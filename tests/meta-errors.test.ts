import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Graph, MetaError } from "@/lib/meta/graph";
import { runTool } from "@/lib/agent/tools";
import { approveProposal } from "@/lib/proposals";
import { FakeMeta } from "./support/fake-meta";
import { campaignSpec, createBusiness, drainJobs, NOW, proposal, TZ } from "./support/setup";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("Meta errors keep Meta's own fields", () => {
  it("message, code, error_subcode, error_user_msg and fbtrace_id, the operation and the token kind, never the token", async () => {
    globalThis.fetch = (async () =>
      Response.json(
        { error: { message: "Invalid parameter", code: 100, error_subcode: 1487390, error_user_msg: "The form needs a privacy policy link", fbtrace_id: "AbC123xyz" } },
        { status: 400 },
      )) as typeof fetch;
    const err = await new Graph("secret-token-value", undefined, "page").post("/page_1/leadgen_forms", { name: "x" }).catch((e) => e);
    expect(err).toBeInstanceOf(MetaError);
    expect(err.details()).toMatchObject({
      operation: "POST /page_1/leadgen_forms",
      token: "page",
      message: "Invalid parameter",
      code: 100,
      error_subcode: 1487390,
      error_user_msg: "The form needs a privacy policy link",
      fbtrace_id: "AbC123xyz",
      reconnect: "not_needed",
    });
    expect(err.describe()).toContain("fbtrace_id: AbC123xyz");
    expect(err.describe()).not.toContain("secret-token-value");
  });

  it("asks for reconnecting only when the token is dead or a permission is missing", () => {
    expect(new MetaError("Error validating access token", 190, 463).reconnect).toBe("needed");
    expect(new MetaError("(#200) Requires pages_manage_ads permission", 200).reconnect).toBe("only_if_permission_missing");
    expect(new MetaError("terms not accepted", 200, 1870034).reconnect).toBe("not_needed");
    expect(new MetaError("Invalid parameter", 100).reconnect).toBe("not_needed");
  });

  it("a write with no answer is marked as possibly done; a read is retried as temporary", async () => {
    globalThis.fetch = (async () => {
      throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
    }) as typeof fetch;
    process.env.MIKEE_META_BACKOFF_MS = "1";
    const write = await new Graph("t").post("/act_1/campaigns", {}).catch((e) => e);
    expect(write.details()).toMatchObject({ operation: "POST /act_1/campaigns", outcome_unknown: true });
    expect(write.describe()).toMatch(/check before trying again/);
    const read = await new Graph("t").get("/act_1").catch((e) => e);
    expect(read.transient).toBe(true);
    expect(read.outcomeUnknown).toBe(false);
  });
});

describe("a failed build reports what exists at Meta, checked", () => {
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
  afterEach(() => uninstall?.());

  const failBuild = async (failPath: RegExp) => {
    const ws = await createBusiness({ budget: 5000 });
    const r = await runTool({ workspaceId: ws, tz: TZ }, "propose_campaign", campaignSpec());
    const id = JSON.parse(r.content).proposalId as string;
    meta.failOn((c) => c.method === "POST" && failPath.test(c.path), 10, "Invalid parameter", 100);
    await approveProposal(ws, id, (await proposal(id)).versionHash);
    await drainJobs();
    return proposal(id);
  };

  it("names the paused objects left behind when a later step fails", async () => {
    const p = await failBuild(/adsets$/);
    expect(p.status).toBe("failed");
    const result = p.result as any;
    expect(result.built).toMatchObject({ checked: true, campaignId: meta.list("campaign")[0].id, adIds: [] });
    expect(result.detail).toMatch(/At Meta now, all paused: campaign/);
    expect(result.meta).toMatchObject({ operation: "POST /act_1/adsets", code: 100, reconnect: "not_needed" });
    // Where the ad set was aimed, as sent.
    expect(result.sentGeo).toEqual({ countries: ["IL"] });
    // The failed request itself: the targeting as sent, and that no advertiser identity field went with it.
    expect(result.meta.request.targeting.geo_locations).toEqual({ countries: ["IL"] });
    expect(result.meta.request.advertiser_identity_fields).toBe("none sent");
  });

  it("says nothing exists only after checking", async () => {
    const p = await failBuild(/campaigns$/);
    expect((p.result as any).built).toMatchObject({ checked: true, adIds: [] });
    expect((p.result as any).built.campaignId).toBeUndefined();
    expect((p.result as any).detail).toMatch(/Checked at Meta: nothing from this card exists there/);
  });
});

describe("AI cost is counted per model", async () => {
  const { claudeCostUsd } = await import("@/lib/usage");
  const usage = { input_tokens: 1_000_000, output_tokens: 1_000_000 } as any;
  it("Sonnet 5.5, Haiku 5.5 and Opus 5.5 at their own prices, an unknown model at the highest", () => {
    expect(claudeCostUsd(usage, "claude-sonnet-5-5")).toBeCloseTo(12);
    expect(claudeCostUsd(usage, "claude-haiku-5-5")).toBeCloseTo(3); // past 100K prompt tokens: $0.50 / $2.50
    expect(claudeCostUsd({ input_tokens: 10_000, output_tokens: 1_000 } as any, "claude-haiku-5-5")).toBeCloseTo(0.0015);
    expect(claudeCostUsd(usage, "claude-opus-5-5")).toBeCloseTo(24);
    expect(claudeCostUsd(usage, "some-future-model")).toBeCloseTo(60);
  });
});
