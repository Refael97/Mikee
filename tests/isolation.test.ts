import { afterEach, describe, expect, it } from "vitest";
import { foreignRoot, runTool } from "@/lib/agent/tools";
import { saveConnection } from "@/lib/connections";
import { createBusiness, TZ } from "./support/setup";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("each business has its own Meta connection", () => {
  it("every call uses the token of the business it is for, never another's", async () => {
    const a = await createBusiness();
    const b = await createBusiness();
    await saveConnection(a, "meta", { userName: "A", adAccountId: "act_111", pageId: "p_a" }, "token-of-a");
    await saveConnection(b, "meta", { userName: "B", adAccountId: "act_222", pageId: "p_b" }, "token-of-b");
    const seen: { auth: string; path: string }[] = [];
    globalThis.fetch = (async (input: any, init?: RequestInit) => {
      seen.push({ auth: String((init?.headers as Record<string, string>)?.Authorization), path: new URL(String(input)).pathname });
      return Response.json({ data: [], paging: {} });
    }) as typeof fetch;

    await runTool({ workspaceId: a, tz: TZ }, "meta_media", { kind: "images" });
    await runTool({ workspaceId: b, tz: TZ }, "meta_media", { kind: "images" });
    expect(seen.find((s) => s.path.endsWith("/act_111/adimages"))?.auth).toBe("Bearer token-of-a");
    expect(seen.find((s) => s.path.endsWith("/act_222/adimages"))?.auth).toBe("Bearer token-of-b");
    expect(seen.some((s) => s.path.includes("act_222") && s.auth.includes("token-of-a"))).toBe(false);
  });

  it("without a connection the action stops; nothing falls back to another token", async () => {
    const c = await createBusiness();
    await saveConnection(c, "meta", {}, "");
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return Response.json({});
    }) as typeof fetch;
    const r = await runTool({ workspaceId: c, tz: TZ }, "meta_media", { kind: "images" });
    expect(r.isError).toBe(true);
    expect(called).toBe(false);
  });

  it("Mikee's free read stays inside the business's own assets", () => {
    const own = { adAccountId: "act_111", pageId: "p_a" };
    expect(foreignRoot("/act_111/campaigns", own)).toBeNull();
    expect(foreignRoot("/act_999/campaigns", own)).toMatch(/not this business/);
    expect(foreignRoot("/me/adaccounts", own)).toBeTruthy();
    expect(foreignRoot("/me/businesses", own)).toBeTruthy();
    expect(foreignRoot("/me", own)).toBeNull();
    expect(foreignRoot("/p_a/leadgen_forms", own)).toBeNull();
  });
});
