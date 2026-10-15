import { afterEach, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { appendMessage } from "@/lib/conversation";
import { createConversation } from "@/lib/conversations";
import { enqueue } from "@/lib/jobs";
import { MIKEE_TOOLS, setAnthropicForTests } from "@/lib/agent/run";
import { SPECIALISTS } from "@/lib/agent/specialists";
import { approveProposal } from "@/lib/proposals";
import { FakeMeta } from "./support/fake-meta";
import { createBusiness, drainJobs, fakeTeam, toolUse, TZ } from "./support/setup";

let uninstall: (() => void) | undefined;
afterEach(() => uninstall?.());

it.each(["image", "video"])("a ready %s goes from Mikee's chat through the Story tool, card approval and publishing", async type => {
  const meta = new FakeMeta(); uninstall = meta.install();
  const ws = await createBusiness();
  const url = `https://cdn.example/ready.${type === "image" ? "jpg" : "mp4"}`;
  const team = fakeTeam({ mikee: [req => {
    expect(req.tools.some((t: { name: string }) => t.name === "propose_story")).toBe(true);
    return { stop_reason: "tool_use", content: [toolUse("story", "propose_story", { title: "סטורי מוכן", media: { type, url }, clientAsked: true })] };
  }] });
  setAnthropicForTests(team);
  const conv = (await createConversation(ws, { firstText: "תעלה את הקובץ הזה לסטורי" })).id;
  await appendMessage(ws, conv, "user", "chat", [{ type: "text", text: `תעלה את הקובץ הזה לסטורי: ${url}` }]);
  await enqueue(ws, "turn", { conversationId: conv });
  await drainJobs();
  expect(team.requests.map(r => r.agent)).toEqual(["mikee"]);
  expect(meta.writes()).toHaveLength(0);
  const d = await db();
  const rows = await d.select().from(schema.proposals).where(eq(schema.proposals.workspaceId, ws));
  expect(rows).toHaveLength(1);
  const card = rows[0];
  expect(card.status).toBe("pending");
  expect(card.action).toMatchObject({ format: "story", text: "", channels: ["instagram"], media: [{ type, url }] });
  await approveProposal(ws, card.id, card.versionHash);
  await drainJobs();
  const done = await d.query.proposals.findFirst({ where: eq(schema.proposals.id, card.id) });
  expect(done?.status).toBe("done");
  expect(meta.writes(/media_publish/)).toHaveLength(1);
  expect(meta.writes().find(c => c.path === "/ig_1/media")?.params.media_type).toBe("STORIES");
});

it("exposes the direct Story tool to Mikee and the general publisher to social", () => {
  expect(MIKEE_TOOLS.some(t => t.name === "propose_story")).toBe(true);
  expect(SPECIALISTS.find(s => s.id === "social")?.tools).toContain("propose_post");
});

it("rejects an unsupported schedule instead of silently publishing immediately", async () => {
  const { runTool } = await import("@/lib/agent/tools");
  const meta = new FakeMeta(); uninstall = meta.install();
  const ws = await createBusiness();
  const result = await runTool({ workspaceId: ws, tz: TZ }, "propose_story", {
    title: "למחר", media: { type: "image", url: "https://cdn.example/a.jpg" }, scheduleAt: new Date(Date.now() + 86400_000).toISOString(),
  });
  expect(result.isError).toBe(true);
  const d = await db();
  expect(await d.select().from(schema.proposals).where(eq(schema.proposals.workspaceId, ws))).toHaveLength(0);
  expect(meta.writes()).toHaveLength(0);
});
