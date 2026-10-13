import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { setAnthropicForTests } from "@/lib/agent/run";
import { appendMessage, loadHistory, timeline } from "@/lib/conversation";
import { createConversation, getConversation, guessCategory, listConversations, updateConversation } from "@/lib/conversations";
import { approveProposal } from "@/lib/proposals";
import { enqueue } from "@/lib/jobs";
import { FakeMeta } from "./support/fake-meta";
import { campaignSpec, createBusiness, drainJobs, fakeTeam, NOW, proposal, toolUse } from "./support/setup";

let meta: FakeMeta;
let uninstall: () => void;

beforeAll(() => vi.useFakeTimers({ toFake: ["Date"], now: NOW }));
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  uninstall?.();
  meta = new FakeMeta();
  uninstall = meta.install();
});

const say = async (ws: string, conversationId: string, text: string) => {
  await appendMessage(ws, conversationId, "user", "chat", [{ type: "text", text }]);
  return enqueue(ws, "turn", { conversationId });
};

describe("filing conversations", () => {
  it("guesses a category from the first message at once", () => {
    expect(guessCategory("צריך להעלות את התקציב של הקמפיין")).toBe("campaigns");
    expect(guessCategory("תכתוב לי פוסט לאינסטגרם על השמלה")).toBe("content");
    expect(guessCategory("איך היה השבוע? מה התוצאות")).toBe("results");
    expect(guessCategory("היי")).toBe("general");
  });

  it("Mikee titles and files the conversation in his first turn", async () => {
    const ws = await createBusiness({ budget: 3000 });
    const conv = await createConversation(ws, { firstText: "היי" });
    expect(conv.category).toBe("general");
    setAnthropicForTests(
      fakeTeam({
        mikee: [
          () => ({ stop_reason: "tool_use", content: [toolUse("f1", "file_conversation", { title: "קמפיין לקולקציית סתיו", category: "campaigns" })] }),
          () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "בוא נבנה את זה." }] }),
        ],
      }),
    );
    await say(ws, conv.id, "היי, רוצה לקדם את הקולקציה החדשה");
    await drainJobs();
    const after = await getConversation(ws, conv.id);
    expect([after?.title, after?.category]).toEqual(["קמפיין לקולקציית סתיו", "campaigns"]);
  });

  it("once the client moves a conversation herself, Mikee does not re-file it", async () => {
    const ws = await createBusiness({ budget: 3000 });
    const conv = await createConversation(ws, { firstText: "פוסט חדש" });
    await updateConversation(ws, conv.id, { category: "business" });
    setAnthropicForTests(
      fakeTeam({
        mikee: [
          () => ({ stop_reason: "tool_use", content: [toolUse("f1", "file_conversation", { title: "פוסט לסתיו", category: "content" })] }),
          () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "סגור." }] }),
        ],
      }),
    );
    await say(ws, conv.id, "תכין פוסט");
    await drainJobs();
    const after = await getConversation(ws, conv.id);
    expect(after?.category).toBe("business");
    expect(after?.title).toBe("פוסט לסתיו"); // the title may still improve
  });
});

describe("separate conversations", () => {
  it("each conversation sends only its own history to Mikee, with the others listed as context", async () => {
    const ws = await createBusiness({ budget: 3000 });
    const a = await createConversation(ws, { title: "קמפיין סתיו", category: "campaigns" });
    const b = await createConversation(ws, { title: "פוסטים לשבוע", category: "content" });
    await appendMessage(ws, a.id, "user", "chat", [{ type: "text", text: "סוד של שיחה א" }]);
    await appendMessage(ws, a.id, "assistant", "chat", [{ type: "text", text: "קיבלתי" }]);

    const team = fakeTeam({ mikee: [() => ({ stop_reason: "end_turn", content: [{ type: "text", text: "בטח" }] })] });
    setAnthropicForTests(team);
    await say(ws, b.id, "תכין פוסט");
    await drainJobs();

    const req = team.requests[0].req;
    expect(JSON.stringify(req.messages)).not.toContain("סוד של שיחה א");
    expect(req.system.map((s: any) => s.text).join("\n")).toContain('"קמפיין סתיו"');
  });

  it("a card's outcome is reported in the conversation it came from", async () => {
    const ws = await createBusiness({ budget: 3000 });
    const a = await createConversation(ws, { title: "קמפיין", category: "campaigns" });
    const b = await createConversation(ws, { title: "משהו אחר", category: "general" });
    setAnthropicForTests(
      fakeTeam({
        mikee: [
          () => ({ stop_reason: "tool_use", content: [toolUse("m1", "ask_media_buyer", { task: "Build the autumn campaign" })] }),
          () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "מוכן." }] }),
        ],
        media_buyer: [
          () => ({ stop_reason: "tool_use", content: [toolUse("b1", "propose_campaign", campaignSpec())] }),
          () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "Card created." }] }),
        ],
      }),
    );
    await say(ws, a.id, "בוא נקדם");
    await drainJobs();
    await appendMessage(ws, b.id, "user", "chat", [{ type: "text", text: "שאלה אחרת" }]); // b is now the most recent

    const d = await db();
    const [card] = await d.select().from(schema.proposals).where(eq(schema.proposals.workspaceId, ws));
    expect(card.conversationId).toBe(a.id);
    await approveProposal(ws, card.id, (await proposal(card.id)).versionHash);
    await drainJobs();

    const events = await d.select().from(schema.messages).where(eq(schema.messages.kind, "event")).orderBy(asc(schema.messages.id));
    expect(events.at(-1)?.conversationId).toBe(a.id);
    expect((await timeline(ws, a.id)).some((i) => i.type === "card")).toBe(true);
    expect((await timeline(ws, b.id)).some((i) => i.type === "card")).toBe(false);
  });

  it("the list is ordered by last activity and hides removed conversations", async () => {
    const ws = await createBusiness();
    const a = await createConversation(ws, { firstText: "ראשונה" });
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    const b = await createConversation(ws, { firstText: "שנייה" });
    vi.setSystemTime(new Date(NOW.getTime() + 120_000));
    await appendMessage(ws, a.id, "user", "chat", [{ type: "text", text: "עוד משהו" }]);
    expect((await listConversations(ws)).map((c) => c.id)).toEqual([a.id, b.id]);
    await updateConversation(ws, b.id, { archived: true });
    expect((await listConversations(ws)).map((c) => c.id)).toEqual([a.id]);
    vi.setSystemTime(NOW);
  });
});

describe("attachments", () => {
  it("images and PDFs reach the model as real content; other files as a usable link", async () => {
    const ws = await createBusiness();
    const conv = await createConversation(ws, { firstText: "תמונה" });
    const d = await db();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const [img] = await d.insert(schema.media).values({ workspaceId: ws, contentType: "image/png", bytes: png, size: png.length, source: "upload", filename: "dress.png" }).returning();
    const [vid] = await d.insert(schema.media).values({ workspaceId: ws, contentType: "video/mp4", bytes: Buffer.from([0]), size: 1, source: "upload", filename: "reel.mp4" }).returning();
    await appendMessage(ws, conv.id, "user", "chat", [{ type: "text", text: "תשתמש בזה" }], [
      { id: img.id, name: "dress.png", type: "image/png", size: png.length, url: `https://mikee.test/api/media/${img.id}` },
      { id: vid.id, name: "reel.mp4", type: "video/mp4", size: 1, url: `https://mikee.test/api/media/${vid.id}` },
    ]);

    const [msg] = await loadHistory(ws, conv.id);
    const blocks = msg.content as any[];
    expect(blocks[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/png", data: png.toString("base64") } });
    expect(blocks.some((b) => b.type === "text" && b.text.includes(`/api/media/${vid.id}`))).toBe(true);
    expect(blocks.at(-1)).toEqual({ type: "text", text: "תשתמש בזה" });
  });
});
