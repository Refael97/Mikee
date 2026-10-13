import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { setAnthropicForTests } from "@/lib/agent/run";
import { appendMessage, timeline } from "@/lib/conversation";
import { createConversation, getConversation, listConversations, markRead, unreadPreviews } from "@/lib/conversations";
import { enqueue } from "@/lib/jobs";
import { dueNudges, isQuietHour, localParts, MAX_PER_DAY, runProactive } from "@/lib/proactive";
import { splitReplies, stripReplies } from "@/lib/replies";
import { FakeMeta } from "./support/fake-meta";
import { createBusiness, drainJobs, fakeTeam, NOW, TZ } from "./support/setup";

let uninstall: () => void;

beforeAll(() => vi.useFakeTimers({ toFake: ["Date"], now: NOW }));
afterAll(() => vi.useRealTimers());
beforeEach(async () => {
  uninstall?.();
  uninstall = new FakeMeta().install();
  vi.setSystemTime(NOW);
  // Each test starts with an empty queue.
  const d = await db();
  await d.update(schema.jobs).set({ status: "done" });
});

const at = (iso: string) => new Date(iso);
const mikeeSays = (text: string) => setAnthropicForTests(fakeTeam({ mikee: [() => ({ content: [{ type: "text", text }], stop_reason: "end_turn" })] }));

async function waitingCard(ws: string, conversationId: string, hoursAgo: number, over: Partial<typeof schema.proposals.$inferInsert> = {}) {
  const d = await db();
  const [p] = await d
    .insert(schema.proposals)
    .values({
      workspaceId: ws,
      conversationId,
      kind: "campaign",
      versionHash: "v1",
      dedupeKey: `k-${Math.random()}`,
      month: "2026-10",
      card: { kind: "campaign", title: "נותנים לקולקציה את הבמה", why: "", rows: [], approveLabel: "", changeLabel: "" },
      action: {},
      createdAt: new Date(NOW.getTime() - hoursAgo * 3600_000),
      ...over,
    })
    .returning();
  return p;
}

async function nudgeRows(ws: string) {
  const d = await db();
  return d.select().from(schema.nudges).where(eq(schema.nudges.workspaceId, ws));
}

describe("when Mikee may reach out", () => {
  it("knows local time: quiet from 21:00 to 08:00 in the business's timezone", () => {
    expect(localParts(TZ, NOW)).toMatchObject({ date: "2026-10-20", hour: 12, weekday: "Tue", day: 20 });
    expect(localParts(TZ, at("2026-10-25T07:00:00Z")).weekday).toBe("Sun");
    expect([7, 21, 23, 0].every(isQuietHour)).toBe(true);
    expect([8, 12, 20].some(isQuietHour)).toBe(false);
  });

  it("stays quiet at night, whatever is due", async () => {
    const ws = await createBusiness();
    const r = await runProactive(ws, TZ, at("2026-10-20T19:30:00Z")); // 22:30 in Israel
    expect(r.skipped).toBe("quiet hours");
    expect(await nudgeRows(ws)).toHaveLength(0);
  });

  it("nothing is due for a business that is still getting connected", async () => {
    const ws = await createBusiness({ stage: "interview" });
    expect(await dueNudges(ws, TZ, NOW)).toEqual([]);
  });
});

describe("a morning check", () => {
  it("with nothing worth saying leaves no conversation behind and does not count toward the daily limit", async () => {
    const ws = await createBusiness({ budget: 3000 });
    mikeeSays("NOTHING");
    const r = await runProactive(ws, TZ, NOW);
    expect(r.started?.kind).toBe("morning");
    await drainJobs();
    expect(await getConversation(ws, r.started!.conversationId)).toBeUndefined();
    const [row] = await nudgeRows(ws);
    expect(row.day).toBe("-");
    // The same morning is never checked twice.
    expect((await runProactive(ws, TZ, NOW)).skipped).toBe("already handled");
  });

  it("that has something to say opens a conversation marked as new, with a preview for the note", async () => {
    const ws = await createBusiness({ budget: 3000 });
    mikeeSays("הסרטון החדש מביא פניות בחצי מחיר. כדאי לתת לו יותר תקציב?\n[[כן, תכין | בוא נחכה]]");
    const r = await runProactive(ws, TZ, NOW);
    await drainJobs();
    const conv = await getConversation(ws, r.started!.conversationId);
    expect(conv?.unread).toBe(true);
    expect(conv?.title).toBe("המלצות של מייקי");
    const previews = await unreadPreviews(ws, [conv!.id]);
    expect(previews[conv!.id]).toBe("הסרטון החדש מביא פניות בחצי מחיר. כדאי לתת לו יותר תקציב?");
    // The instruction that started it is not shown to the client.
    const items = await timeline(ws, conv!.id);
    expect(items.map((i) => i.type)).toEqual(["mikee"]);
    await markRead(ws, conv!.id);
    expect((await getConversation(ws, conv!.id))?.unread).toBe(false);
  });
});

describe("reasons and priorities", () => {
  it("a card waiting more than a day gets one reminder, in its own conversation", async () => {
    const ws = await createBusiness({ budget: 3000 });
    const conv = await createConversation(ws, { title: "קמפיין לקולקציה", category: "campaigns" });
    await waitingCard(ws, conv.id, 5); // too fresh
    expect((await dueNudges(ws, TZ, NOW)).map((n) => n.kind)).not.toContain("pending");
    const card = await waitingCard(ws, conv.id, 30);

    mikeeSays("הקמפיין לקולקציה עדיין מחכה לך. התקציב פנוי והקולקציה בשיא.");
    const before = (await listConversations(ws)).length;
    const r = await runProactive(ws, TZ, NOW);
    expect(r.started).toMatchObject({ kind: "pending", key: card.id, conversationId: conv.id });
    await drainJobs();
    expect((await listConversations(ws)).length).toBe(before); // no new conversation
    expect((await getConversation(ws, conv.id))?.unread).toBe(true);

    // The next hour moves on to the next reason instead of reminding again.
    mikeeSays("NOTHING");
    expect((await runProactive(ws, TZ, NOW)).started?.kind).toBe("morning");
  });

  it("does not talk over a conversation where Mikee is already working", async () => {
    const ws = await createBusiness({ budget: 3000 });
    const conv = await createConversation(ws, { title: "קמפיין", category: "campaigns" });
    await waitingCard(ws, conv.id, 30);
    await appendMessage(ws, conv.id, "user", "chat", [{ type: "text", text: "רגע, תבדוק משהו" }]);
    await enqueue(ws, "turn", { conversationId: conv.id });
    const r = await runProactive(ws, TZ, NOW);
    expect(r.started?.kind).toBe("morning");
    expect((await nudgeRows(ws)).map((n) => n.kind)).toEqual(["morning"]);
  });

  it("a failed card that was not retried gets an explanation and a fix, once per attempt", async () => {
    const ws = await createBusiness({ budget: 3000 });
    const conv = await createConversation(ws, { title: "פוסט", category: "content" });
    const p = await waitingCard(ws, conv.id, 10, {
      status: "failed",
      attempts: 1,
      result: { error: "Instagram rejected the image size", retryable: true },
      finishedAt: new Date(NOW.getTime() - 3 * 3600_000),
    });
    const due = await dueNudges(ws, TZ, NOW);
    expect(due[0]).toMatchObject({ kind: "failed", key: `${p.id}:1`, conversationId: conv.id, mayStaySilent: false });
    expect(due[0].kickoff).toContain("Instagram rejected the image size");
  });

  it("a lost connection comes first, and nothing that needs Meta is attempted", async () => {
    const ws = await createBusiness({ budget: 3000 });
    const d = await db();
    await d.update(schema.connections).set({ status: "broken", statusReason: "token revoked" }).where(and(eq(schema.connections.workspaceId, ws), eq(schema.connections.provider, "meta")));
    const due = await dueNudges(ws, TZ, NOW);
    expect(due.map((n) => n.kind)).toEqual(["connection"]);
  });

  it("on Sunday the weekly summary replaces the morning check", async () => {
    const ws = await createBusiness({ budget: 3000 });
    const sunday = at("2026-10-25T07:00:00Z"); // 10:00 in Israel
    mikeeSays("שבוע טוב! השבוע הביא 42 פניות.");
    expect((await runProactive(ws, TZ, sunday)).started?.kind).toBe("weekly");
    await drainJobs();
    expect((await runProactive(ws, TZ, sunday)).skipped).toBe("already handled");
  });

  it("a client who has been quiet for days gets one useful idea per silence", async () => {
    const ws = await createBusiness({ budget: 3000 });
    const conv = await createConversation(ws);
    await appendMessage(ws, conv.id, "user", "chat", [{ type: "text", text: "תודה!" }]);
    const d = await db();
    await d.update(schema.messages).set({ createdAt: new Date(NOW.getTime() - 5 * 86_400_000) }).where(eq(schema.messages.conversationId, conv.id));
    const quiet = (await dueNudges(ws, TZ, NOW)).find((n) => n.kind === "quiet");
    expect(quiet?.key).toBe(new Date(NOW.getTime() - 5 * 86_400_000).toISOString().slice(0, 10));
    expect(quiet?.kickoff).toContain("5 days");
  });

  it(`never more than ${MAX_PER_DAY} a day`, async () => {
    const ws = await createBusiness({ budget: 3000 });
    const a = await createConversation(ws, { title: "א", category: "campaigns" });
    const b = await createConversation(ws, { title: "ב", category: "campaigns" });
    await waitingCard(ws, a.id, 30);
    await waitingCard(ws, b.id, 40);
    for (let i = 0; i < MAX_PER_DAY; i++) {
      mikeeSays("עדיין מחכה לך");
      expect((await runProactive(ws, TZ, NOW)).started?.kind).toBe("pending");
      await drainJobs();
    }
    expect((await runProactive(ws, TZ, NOW)).skipped).toBe("daily limit");
    // A new day opens the gate again.
    mikeeSays("NOTHING");
    expect((await runProactive(ws, TZ, at("2026-10-21T06:00:00Z"))).started?.kind).toBe("morning");
  });

  it("two cron runs at once start the same reason only once", async () => {
    const ws = await createBusiness({ budget: 3000 });
    const results = await Promise.all([runProactive(ws, TZ, NOW), runProactive(ws, TZ, NOW)]);
    expect(results.filter((r) => r.started)).toHaveLength(1);
    expect(await nudgeRows(ws)).toHaveLength(1);
  });
});

describe("quick replies", () => {
  it("are parsed from the last line and hidden from the text", () => {
    expect(splitReplies("כדאי לקדם את השמלה?\n[[כן, תכין | לא עכשיו | ספר עוד]]")).toEqual({
      text: "כדאי לקדם את השמלה?",
      replies: ["כן, תכין", "לא עכשיו", "ספר עוד"],
    });
    expect(splitReplies("אין כאן בחירה").replies).toEqual([]);
    expect(splitReplies("x\n[[א | ב | ג | ד]]").replies).toHaveLength(3);
  });

  it("a half-written line never flashes on screen while streaming", () => {
    expect(stripReplies("כדאי?\n[[כן, ת")).toBe("כדאי?");
    expect(stripReplies("כדאי?\n[[כן | לא]")).toBe("כדאי?");
    expect(stripReplies("כדאי?\n[[כן | לא]]")).toBe("כדאי?");
  });
});
