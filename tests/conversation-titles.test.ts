import { afterEach, describe, expect, it } from "vitest";
import { setAnthropicForTests } from "@/lib/agent/loop";
import { runTool } from "@/lib/agent/tools";
import { appendMessage } from "@/lib/conversation";
import { createConversation, getConversation, isGenericTitle, updateConversation } from "@/lib/conversations";
import { ensureTitle } from "@/lib/titles";
import { createBusiness, fakeClaude, TZ } from "./support/setup";

afterEach(() => setAnthropicForTests(null));

const named = (title: string, category = "campaigns") => fakeClaude([() => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ title, category }) }] })]);

describe("conversation names", () => {
  it("a category word or placeholder is not a name", () => {
    for (const t of ["קמפיינים", "כללי", "שיחה חדשה", "קמפיינים ממומנים", "קמפיין"]) expect(isGenericTitle(t)).toBe(true);
    expect(isGenericTitle("קמפיין לידים לשמלות ערב")).toBe(false);
  });

  it("Mikee is asked again when he names a conversation by its category", async () => {
    const ws = await createBusiness();
    const conv = await createConversation(ws, { firstText: "רוצה עוד פניות" });
    const bad = await runTool({ workspaceId: ws, tz: TZ, conversationId: conv.id }, "file_conversation", { title: "קמפיינים", category: "campaigns" });
    expect(bad.isError).toBe(true);
    const good = await runTool({ workspaceId: ws, tz: TZ, conversationId: conv.id }, "file_conversation", { title: "קמפיין לידים לשמלות ערב", category: "campaigns" });
    expect(good.isError).toBe(false);
    expect((await getConversation(ws, conv.id))?.title).toBe("קמפיין לידים לשמלות ערב");
  });

  it("a conversation still called by its first message gets a name after the turn; one the client named is kept", async () => {
    const ws = await createBusiness();
    const conv = await createConversation(ws, { firstText: "היי, אפשר לעשות משהו לשמלות הערב החדשות?" });
    await appendMessage(ws, conv.id, "user", "chat", [{ type: "text", text: "היי, אפשר לעשות משהו לשמלות הערב החדשות?" }]);
    await appendMessage(ws, conv.id, "assistant", "chat", [{ type: "text", text: "בטח. אבנה קמפיין לידים קטן לשמלות הערב." }]);
    setAnthropicForTests(named("קמפיין לידים לשמלות ערב"));
    await ensureTitle(ws, conv.id, TZ);
    expect(await getConversation(ws, conv.id)).toMatchObject({ title: "קמפיין לידים לשמלות ערב", category: "campaigns" });

    await updateConversation(ws, conv.id, { title: "השמלות של רחל" });
    const claude = named("משהו אחר");
    setAnthropicForTests(claude);
    await ensureTitle(ws, conv.id, TZ);
    expect(claude.requests).toHaveLength(0);
    expect((await getConversation(ws, conv.id))?.title).toBe("השמלות של רחל");
  });
});
