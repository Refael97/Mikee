import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverAssets } from "@/lib/meta/context";
import { Graph, oauthDialogUrl } from "@/lib/meta/graph";
import { FakeMeta } from "./support/fake-meta";

let meta: FakeMeta;
let uninstall: () => void;
beforeEach(() => {
  meta = new FakeMeta();
  uninstall = meta.install();
});
afterEach(() => uninstall());

describe("connecting Facebook", () => {
  it("keeps going when Meta refuses the ad accounts: the rest is returned and the gap is named", async () => {
    // As on 15.10 for a business integration without ads permissions: (#200) Missing Permissions.
    meta.failOn((c) => c.path.includes("me/adaccounts"), 5, "(#200) Missing Permissions", 200);
    meta.failOn((c) => c.path.includes("me/businesses"), 5, "(#100) Missing Permission", 100);
    const out = await discoverAssets(new Graph("system-user-token"));
    expect(out.me.name).toBe("Noa");
    expect(out.adAccounts).toEqual([]);
    expect(out.problems.join(" ")).toContain("Missing Permissions");
  });

  it("the window always asks again for what was declined, so an old grant is not reused silently", () => {
    process.env.META_APP_ID = "1";
    process.env.META_LOGIN_CONFIG_ID = "2";
    const url = new URL(oauthDialogUrl("state"));
    expect(url.searchParams.get("auth_type")).toBe("rerequest");
    expect(url.searchParams.get("config_id")).toBe("2");
  });
});
