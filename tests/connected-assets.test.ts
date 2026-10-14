import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getConnection } from "@/lib/connections";
import { connectedAssets, fillAssetNames } from "@/lib/meta/assets";
import { FakeMeta } from "./support/fake-meta";
import { createBusiness, NOW } from "./support/setup";

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

describe("the connected account menu", () => {
  it("shows the business at Meta and every connected asset, never the token", async () => {
    const ws = await createBusiness();
    meta.nodes.set("px_1", { id: "px_1", type: "pixel", name: "Studio Pixel" });
    const before = await connectedAssets(ws, "Studio");
    expect(before.meta).toMatchObject({ connected: true, status: "ok", account: "Studio Noa", page: { id: "page_1", name: "Studio Noa" }, instagram: { username: "studionoa" }, pixel: { id: "px_1" } });

    await fillAssetNames(ws);
    const after = await connectedAssets(ws, "Studio");
    expect(after.meta).toMatchObject({ account: "אדרט גרופ בע״מ", business: "אדרט גרופ בע״מ", pixel: { id: "px_1", name: "Studio Pixel" } });
    expect((await getConnection(ws, "meta"))!.config).toMatchObject({ businessName: "אדרט גרופ בע״מ", pixelName: "Studio Pixel" });
    expect(JSON.stringify(after)).not.toContain("user-token");
  });

  it("says so when nothing is connected", async () => {
    const ws = await createBusiness();
    const { removeConnection } = await import("@/lib/connections");
    await removeConnection(ws, "meta");
    expect((await connectedAssets(ws, "Studio")).meta).toMatchObject({ connected: false, account: null });
  });
});
