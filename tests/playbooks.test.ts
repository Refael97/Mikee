import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { appendMessage, timeline } from "@/lib/conversation";
import { createConversation } from "@/lib/conversations";
import { MIKEE_TOOLS, setAnthropicForTests } from "@/lib/agent/run";
import { SPECIALISTS } from "@/lib/agent/specialists";
import { enqueue } from "@/lib/jobs";
import { storeBytes } from "@/lib/media";
import { addLesson, getPlaybook, LESSONS, PLAYBOOK_MAX, playbookHistory, writePlaybook } from "@/lib/playbooks";
import { createBusiness, drainJobs, fakeTeam, NOW, toolUse } from "./support/setup";

beforeAll(() => vi.useFakeTimers({ toFake: ["Date"], now: NOW }));
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  process.env.RENDER_URL = "http://render.internal:8080";
  process.env.RENDER_SECRET = "s".repeat(32);
});
afterEach(() => {
  delete process.env.RENDER_URL;
  delete process.env.RENDER_SECRET;
});

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PLAYBOOK = `# עורך וידאו בשביל רחל סיטבון
## הלקוח בשבילך
בוטיק שמלות שבת וערב. הלקוחות: נשים דתיות 25-45. מראה אלגנטי, זהב על שחור.
## הוראות עבודה
ריל של 15-20 שניות, סגנון elegant, לפתוח בתנועה של שמלה.
## מה עובד
סרטונים מהתצוגה.`;

const says = async (ws: string, conv: string, text: string) => {
  await appendMessage(ws, conv, "user", "chat", [{ type: "text", text }]);
  await enqueue(ws, "turn", { conversationId: conv });
  await drainJobs();
};
const sysOf = (req: any) => req.system.map((b: any) => b.text).join("\n");

describe("each specialist's playbook", () => {
  it("is versioned with its reason, takes lessons under their own section, and stays readable in size", async () => {
    const ws = await createBusiness();
    expect((await writePlaybook(ws, "video_editor", PLAYBOOK, "הכנה ראשונה")).version).toBe(1);
    const r = await addLesson(ws, "video_editor", "פחות טקסט על המסך", "הלקוחה אמרה שיש יותר מדי טקסט");
    expect(r.version).toBe(2);
    const p = await getPlaybook(ws, "video_editor");
    expect(p!.content).toContain(PLAYBOOK);
    expect(p!.content).toMatch(new RegExp(`${LESSONS}\\n- [^\\n]+: פחות טקסט על המסך$`));
    expect((await playbookHistory(ws, "video_editor")).map((h) => [h.version, h.reason])).toEqual([
      [2, "הלקוחה אמרה שיש יותר מדי טקסט"],
      [1, "הכנה ראשונה"],
    ]);
    await expect(writePlaybook(ws, "video_editor", "x".repeat(PLAYBOOK_MAX + 1), "too long")).rejects.toThrow(/under 8000/);
    await expect(writePlaybook(ws, "hacker", PLAYBOOK, "x")).rejects.toThrow(/Unknown team member/);
    await expect(addLesson(ws, "copywriter", "x", "y")).rejects.toThrow(/no playbook/);
    // One business's playbook is never another's.
    expect(await getPlaybook(await createBusiness(), "video_editor")).toBeUndefined();
  });

  it("only Mikee writes playbooks; specialists only read their own", () => {
    const names = MIKEE_TOOLS.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["team_playbook", "update_playbook", "ask_video_editor"]));
    for (const s of SPECIALISTS) {
      expect(s.tools).not.toContain("update_playbook");
      expect(s.tools).not.toContain("team_playbook");
    }
  });
});

describe("Mikee manages the video editor through its playbook", () => {
  it("prepares the file, the editor works from it, and the client's feedback becomes a lesson it reads next time", async () => {
    const ws = await createBusiness();
    const photo = (await storeBytes(ws, JPEG, { filename: "dress.jpg", source: "upload", inLibrary: true })).id;
    const video = (lines: string[], replaces?: string) => ({
      title: "ריל לקולקציה",
      why: "ריל קצר לקולקציה החדשה",
      style: "elegant",
      scenes: [{ type: "title", headline: "הקולקציה החדשה", mediaId: photo }, { type: "text", lines }],
      ...(replaces ? { replaces } : {}),
    });
    let firstCard = "";

    const team = fakeTeam({
      mikee: [
        // Turn 1: prepare the editor's file, then hand over the work.
        () => ({ stop_reason: "tool_use", content: [toolUse("m1", "update_playbook", { agent: "video_editor", action: "write", text: PLAYBOOK, reason: "הכנה לפני העבודה הראשונה" })] }),
        () => ({ stop_reason: "tool_use", content: [toolUse("m2", "ask_video_editor", { task: "Reel for the new Shabbat collection, Instagram reels" })] }),
        () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "הכנתי ריל, הוא מחכה לך." }] }),
        // Turn 2: she did not like it. The lesson goes to the editor's file first, then a new version.
        (req) => {
          expect(sysOf(req)).toMatch(/"ריל לקולקציה" id [0-9a-f-]{36}, since [^\n]+, made by video_editor/);
          return { stop_reason: "tool_use", content: [toolUse("m3", "update_playbook", { agent: "video_editor", action: "add_lesson", text: "פחות טקסט על המסך, שהשמלה תדבר", reason: "הלקוחה לא אהבה את כמות הטקסט" })] };
        },
        () => ({ stop_reason: "tool_use", content: [toolUse("m4", "ask_video_editor", { task: `New version with less text; replaces card ${firstCard}` })] }),
        () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "רשמתי. הכנתי גרסה עם פחות טקסט." }] }),
      ],
      video_editor: [
        (req) => {
          expect(sysOf(req)).toContain("# Your playbook for this business (version 1");
          expect(sysOf(req)).toContain("לפתוח בתנועה של שמלה");
          return { stop_reason: "tool_use", content: [toolUse("v1", "propose_video", video(["בדים שנושמים", "גזרות שמחמיאות", "מחיר שמשמח"]))] };
        },
        (req) => {
          firstCard = JSON.parse(req.messages.at(-1).content[0].content).proposalId;
          return { stop_reason: "end_turn", content: [{ type: "text", text: `Card ${firstCard}, 7 seconds.` }] };
        },
        (req) => {
          expect(sysOf(req)).toContain("(version 2");
          expect(sysOf(req)).toContain("פחות טקסט על המסך, שהשמלה תדבר");
          return { stop_reason: "tool_use", content: [toolUse("v2", "propose_video", video(["חדש לשבת"], firstCard))] };
        },
        () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "New card, one line of text." }] }),
      ],
    });
    setAnthropicForTests(team);

    const conv = (await createConversation(ws, { firstText: "תכין לי ריל" })).id;
    await says(ws, conv, "תכין לי ריל לקולקציה החדשה");
    await says(ws, conv, "לא אהבתי, יותר מדי טקסט");

    const d = await db();
    const cards = await d.select().from(schema.proposals).where(eq(schema.proposals.workspaceId, ws));
    expect(cards.map((c) => [c.agent, c.status]).sort()).toEqual([
      ["video_editor", "pending"],
      ["video_editor", "superseded"],
    ]);
    expect((await getPlaybook(ws, "video_editor"))!.version).toBe(2);

    // The client sees Mikee remembering her taste, never the team or the file.
    const shown = JSON.stringify(await timeline(ws, conv));
    expect(shown).toContain("מייקי רשם את מה שאת אוהבת");
    expect(shown).not.toMatch(/video_editor|playbook|specialist/i);
  });
});
