import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runTool } from "@/lib/agent/tools";
import { getConnection, saveConnection } from "@/lib/connections";
import { FakeMeta } from "./support/fake-meta";
import { createBusiness, NOW, TZ } from "./support/setup";

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
afterEach(() => vi.unstubAllEnvs());

const call = async (ws: string, name: string, input: Record<string, unknown> = {}) => {
  const raw = await runTool({ workspaceId: ws, tz: TZ }, name, input);
  return { ...JSON.parse(raw.content), isError: raw.isError };
};

function inbox() {
  meta.add("igconv", { id: "conv_1", updated_time: "2026-10-13T10:00:00+0000", participants: [{ id: "ig_1", username: "studionoa" }, { id: "cust_1", username: "dana.k" }] });
  meta.add("igmsg", { id: "msg_1", conversation: "conv_1", created_time: "2026-10-13T09:00:00+0000", from: { id: "cust_1", username: "dana.k" }, message: "יש את השמלה הירוקה במידה 38?" });
  meta.add("igmsg", { id: "msg_2", conversation: "conv_1", created_time: "2026-10-13T09:05:00+0000", from: { id: "ig_1", username: "studionoa" }, message: "כן, יש" });
}

describe("reading Instagram direct messages", () => {
  it("lists the business's conversations and reads one, oldest first, marked business or customer", async () => {
    const ws = await createBusiness();
    inbox();
    const list = await call(ws, "list_instagram_conversations");
    expect(list).toMatchObject({ status: "ok", count: 1, isError: false, access: { instagram: { id: "ig_1" }, page: { id: "page_1" } } });
    expect(list.conversations[0]).toMatchObject({ id: "conv_1", with: [{ id: "cust_1" }] });
    // Read through the page with the page token, on the Instagram platform.
    expect(meta.calls.some((c) => c.path === "/page_1/conversations" && c.params.platform === "instagram")).toBe(true);

    const read = await call(ws, "read_instagram_conversation", { conversationId: "conv_1" });
    expect(read.status).toBe("ok");
    expect(read.messages.map((m: { from: string }) => m.from)).toEqual(["customer", "business"]);
    // Customer text is data for the model, not instructions.
    expect(read.messages[0].text).toMatch(/<untrusted source="instagram_messages">/);
    expect(read.messages[0].text).toContain("השמלה הירוקה");
    // Read only: nothing was written to Meta.
    expect(meta.writes()).toHaveLength(0);
  });

  it("an empty inbox is empty, not a failure", async () => {
    const ws = await createBusiness();
    expect(await call(ws, "list_instagram_conversations")).toMatchObject({ status: "empty", count: 0, isError: false });
  });

  it("refuses a conversation that is not this business's", async () => {
    const ws = await createBusiness();
    meta.add("igconv", { id: "conv_9", participants: [{ id: "ig_other" }, { id: "cust_2" }] });
    const r = await call(ws, "read_instagram_conversation", { conversationId: "conv_9" });
    expect(r).toMatchObject({ status: "error", reason: "not_this_business", isError: true });
    expect(r.messages).toBeUndefined();
  });

  it("checks the current token's permissions with Meta and names what is missing", async () => {
    vi.stubEnv("META_APP_ID", "app_1");
    vi.stubEnv("META_APP_SECRET", "secret");
    const ws = await createBusiness();
    meta.token.scopes = ["ads_management", "pages_show_list", "instagram_basic"];
    const r = await call(ws, "list_instagram_conversations");
    expect(r).toMatchObject({ status: "error", reason: "permission_missing", isError: true, access: { scopesFrom: "live" } });
    expect(r.access.missing).toEqual(["instagram_manage_messages", "pages_manage_metadata"]);
    expect(r.error).toMatch(/instagram_manage_messages/);
    // Nothing is read from the inbox without the permission.
    expect(meta.calls.some((c) => c.path.endsWith("/conversations"))).toBe(false);

    meta.token.valid = false;
    expect(await call(ws, "list_instagram_conversations")).toMatchObject({ reason: "not_connected" });
  });

  it("without the app's credentials, uses the permissions saved at connection", async () => {
    const ws = await createBusiness();
    const conn = await getConnection(ws, "meta");
    await saveConnection(ws, "meta", { ...conn!.config, scopes: ["ads_management", "instagram_basic"] }, "user-token");
    expect(await call(ws, "list_instagram_conversations")).toMatchObject({ reason: "permission_missing", access: { scopesFrom: "saved" } });
  });

  it("returns Meta's own error with a reason, never an empty inbox", async () => {
    const ws = await createBusiness();
    inbox();
    meta.failOn((c) => c.path === "/page_1/conversations", 1, "(#3) Application does not have the capability to make this API call.", 3);
    const r = await call(ws, "list_instagram_conversations");
    expect(r).toMatchObject({ status: "error", reason: "meta_error", isError: true, meta: { code: 3 } });
    expect(r.meta.operation).toContain("GET /page_1/conversations");
    expect(r.error).toMatch(/page token/);
    expect(r.conversations).toBeUndefined();

    meta.failOn((c) => c.path === "/page_1/conversations", 1, "(#200) Requires instagram_manage_messages permission", 200);
    expect(await call(ws, "list_instagram_conversations")).toMatchObject({ reason: "permission_missing" });
  });

  it("explains a missing page, Instagram account or link between them", async () => {
    const ws = await createBusiness();
    const conn = await getConnection(ws, "meta");
    await saveConnection(ws, "meta", { ...conn!.config, igUserId: "" }, "user-token");
    expect(await call(ws, "list_instagram_conversations")).toMatchObject({ reason: "no_instagram_account" });

    await saveConnection(ws, "meta", { ...conn!.config, igUserId: "ig_other" }, "user-token");
    expect(await call(ws, "list_instagram_conversations")).toMatchObject({ reason: "no_asset_access" });

    const bare = await createBusiness();
    await saveConnection(bare, "meta", { userName: "Noa", adAccountId: "act_1", pageId: "", igUserId: "ig_1" }, "user-token");
    expect(await call(bare, "list_instagram_conversations")).toMatchObject({ reason: "no_page" });
  });
});
