import { afterEach, describe, expect, it, vi } from "vitest";
import { logConnectDiagnosis } from "@/lib/meta/diagnose";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Facebook connection diagnosis", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("logs what Meta granted and what each read answered, without the token", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      const path = new URL(url).pathname;
      if (path.endsWith("/me")) return json({ id: "su_1", name: "Mikee system user" });
      if (path.endsWith("/me/adaccounts")) return json({ error: { message: "(#200) Missing Permissions", code: 200, fbtrace_id: "T1" } }, 403);
      if (path.endsWith("/me/accounts")) return json({ data: [{ id: "page_1", name: "Rachel" }] });
      if (path.endsWith("/me/businesses")) return json({ error: { message: "Tried accessing nonexisting field (businesses)", code: 100 } }, 400);
      if (path.endsWith("/owned_ad_accounts")) return json({ data: [] });
      return json({ data: [] });
    });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    await logConnectDiagnosis(
      "SECRET-TOKEN-123",
      { appId: process.env.META_APP_ID ?? "", valid: true, scopes: ["pages_show_list"], granularScopes: [{ scope: "pages_show_list", target_ids: ["page_1"] }], expiresAt: null, dataAccessExpiresAt: null, type: "SYSTEM_USER" },
      "biz_1",
    );

    const line = info.mock.calls.find((c) => c[0] === "[meta] connect diagnosis");
    expect(line).toBeTruthy();
    const out = JSON.parse(line![1] as string);
    expect(out.token.type).toBe("SYSTEM_USER");
    expect(out.token.missing).toContain("ads_management");
    expect(out.token.granted).toEqual([{ scope: "pages_show_list", targets: ["page_1"] }]);
    expect(out.reads["me/adaccounts"]).toMatchObject({ ok: false, code: 200 });
    expect(out.reads["me/accounts"]).toMatchObject({ ok: true, count: 1, ids: ["page_1"] });
    expect(out.reads["business/owned_ad_accounts"]).toMatchObject({ ok: true, count: 0 });
    expect(JSON.stringify(info.mock.calls)).not.toContain("SECRET-TOKEN-123");
  });
});
