import { afterEach, beforeEach, expect, it, vi } from "vitest";
import sharp from "sharp";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { runTool } from "@/lib/agent/tools";
import { approveProposal, declineProposal } from "@/lib/proposals";
import { claimNext } from "@/lib/jobs";
import { executeProposal } from "@/lib/executor";
import { runJob } from "@/lib/worker";
import { storeBytes } from "@/lib/media";
import { createBusiness, proposal, TZ } from "./support/setup";
import { FakeMeta } from "./support/fake-meta";

let meta: FakeMeta;
let uninstall: () => void;
beforeEach(() => { meta = new FakeMeta(); uninstall = meta.install(); });
afterEach(() => { uninstall(); vi.restoreAllMocks(); });

async function ready(workspaceId?: string, channel: "story" | "post" = "story") {
  const ws = workspaceId ?? await createBusiness();
  const bytes = await sharp({ create: { width: 108, height: 192, channels: 3, background: "white" } }).jpeg().toBuffer();
  const media = await storeBytes(ws, bytes, { filename: "story.jpg", source: "upload", inLibrary: true });
  const scheduleAt = new Date(Date.now() + 3600_000).toISOString();
  const raw = await runTool({ workspaceId: ws, tz: TZ }, channel === "story" ? "propose_story" : "propose_post", {
    title: "מחר בסטורי", media: channel === "story" ? { type: "image", url: media.url } : [{ type: "image", url: media.url }],
    ...(channel === "post" ? { channels: ["instagram"], text: "שלום" } : {}), scheduleAt, clientAsked: true,
  });
  expect(raw.isError, raw.content).toBeFalsy();
  const p = await proposal(JSON.parse(raw.content).proposalId);
  return { ws, p, scheduleAt };
}
async function due(p: Awaited<ReturnType<typeof proposal>>, scheduleAt: string, late = 1000) {
  // Move the worker clock to the target; move only the queue clock in the in-memory DB.
  vi.spyOn(Date, "now").mockReturnValue(Date.parse(scheduleAt) + late);
  const d = await db();
  await d.update(schema.jobs).set({ notBefore: new Date(0) }).where(sql`${schema.jobs.input}->>'proposalId' = ${p.id}`);
}

it.each(["story", "post"] as const)("persists an approved %s, waits, then publishes once without calling a model", async channel => {
  const { ws, p, scheduleAt } = await ready(undefined, channel);
  expect(meta.writes()).toHaveLength(0);
  const approved = await approveProposal(ws, p.id, p.versionHash);
  expect(approved.status).toBe("scheduled");
  expect((await proposal(p.id)).status).toBe("scheduled");
  expect((await approveProposal(ws, p.id, p.versionHash)).duplicate).toBe(true);
  if (channel === "story") {
    const duplicate = await runTool({ workspaceId: ws, tz: TZ }, "propose_story", { title: p.action.title, media: (p.action.media as unknown[])[0], scheduleAt, clientAsked: true });
    expect(duplicate.isError).toBe(true);
    expect(duplicate.content).toContain("already approved and scheduled");
  }
  const d = await db();
  const jobs = await d.select().from(schema.jobs).where(sql`${schema.jobs.input}->>'proposalId' = ${p.id}`);
  expect(jobs).toHaveLength(1);
  expect(jobs[0].notBefore.toISOString()).toBe(scheduleAt);
  expect(jobs[0].status).toBe("waiting"); // old workers ignore future jobs during rolling deploys
  expect(await claimNext(["execute"])).toBeNull();
  await executeProposal(p.id); // even a direct call cannot bypass the time
  expect(meta.writes()).toHaveLength(0);
  expect((await proposal(p.id)).status).toBe("scheduled");
  await due(p, scheduleAt);
  const claims = await Promise.all([claimNext(["execute"]), claimNext(["execute"])]);
  const job = claims.find(Boolean)!;
  expect(claims.filter(Boolean)).toHaveLength(1);
  await runJob(job);
  expect((await proposal(p.id)).status).toBe("done");
  expect(meta.writes(/media_publish/)).toHaveLength(1);
  if (channel === "story") expect(meta.writes().find(c => c.path === "/ig_1/media")?.params.media_type).toBe("STORIES");
  await executeProposal(p.id);
  expect(meta.writes(/media_publish/)).toHaveLength(1);
  const stored = await d.query.jobs.findFirst({ where: eq(schema.jobs.id, job.id) });
  expect(stored?.metrics?.modelCalls).toBe(0);
  expect(await d.select().from(schema.modelCalls).where(eq(schema.modelCalls.workspaceId, ws))).toHaveLength(0);
});

it("cancels only this business's scheduled card, and the queued worker does not publish it", async () => {
  const { ws, p, scheduleAt } = await ready();
  await approveProposal(ws, p.id, p.versionHash);
  const other = await createBusiness();
  await expect(declineProposal(other, p.id)).rejects.toThrow();
  expect((await proposal(p.id)).status).toBe("scheduled");
  expect((await declineProposal(ws, p.id)).status).toBe("cancelled");
  await due(p, scheduleAt);
  expect(await claimNext(["execute"])).toBeNull();
  await executeProposal(p.id);
  expect(meta.writes()).toHaveLength(0);
  expect((await proposal(p.id)).status).toBe("cancelled");
});

it("does not publish an old schedule hours late after a long outage", async () => {
  const { ws, p, scheduleAt } = await ready();
  await approveProposal(ws, p.id, p.versionHash);
  await due(p, scheduleAt, 2 * 3600_000);
  await runJob((await claimNext(["execute"]))!);
  const failed = await proposal(p.id);
  expect(failed.status).toBe("failed");
  expect(failed.result?.retryable).toBe(false);
  expect(meta.writes()).toHaveLength(0);
});

it("rejects an expired approval time instead of posting immediately", async () => {
  const { ws, p, scheduleAt } = await ready();
  vi.spyOn(Date, "now").mockReturnValue(Date.parse(scheduleAt) + 1000);
  await expect(approveProposal(ws, p.id, p.versionHash)).rejects.toThrow(/מועד/);
  expect((await proposal(p.id)).status).toBe("pending");
  const d = await db();
  expect(await d.select().from(schema.jobs).where(sql`${schema.jobs.input}->>'proposalId' = ${p.id}`)).toHaveLength(0);
});

it("rolls back approval if the persistent job cannot be stored", async () => {
  const { ws, p } = await ready();
  const d = await db();
  await d.execute(sql`CREATE OR REPLACE FUNCTION reject_test_schedule() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'queue unavailable'; END; $$`);
  await d.execute(sql`CREATE TRIGGER reject_test_schedule BEFORE INSERT ON jobs FOR EACH ROW EXECUTE FUNCTION reject_test_schedule()`);
  try {
    await expect(approveProposal(ws, p.id, p.versionHash)).rejects.toThrow();
    expect((await proposal(p.id)).status).toBe("pending");
  } finally {
    await d.execute(sql`DROP TRIGGER reject_test_schedule ON jobs`);
    await d.execute(sql`DROP FUNCTION reject_test_schedule()`);
  }
});

it("a worker restart reclaims the saved due job instead of creating a second publication", async () => {
  const { ws, p, scheduleAt } = await ready();
  await approveProposal(ws, p.id, p.versionHash);
  await due(p, scheduleAt);
  const old = (await claimNext(["execute"]))!;
  const d = await db();
  await d.update(schema.jobs).set({ heartbeatAt: new Date(0) }).where(eq(schema.jobs.id, old.id));
  const restarted = (await claimNext(["execute"]))!;
  expect(restarted.id).toBe(old.id);
  expect(restarted.lease).not.toBe(old.lease);
  await runJob(restarted);
  expect((await proposal(p.id)).status).toBe("done");
  expect(meta.writes(/media_publish/)).toHaveLength(1);
});

it("cancels from the chat tool without changing another business's schedule", async () => {
  const { ws, p } = await ready();
  await approveProposal(ws, p.id, p.versionHash);
  const other = await createBusiness();
  const foreign = await runTool({ workspaceId: other, tz: TZ }, "cancel_scheduled_post", { proposalId: p.id });
  expect(foreign.isError).toBe(true);
  expect((await proposal(p.id)).status).toBe("scheduled");
  const own = await runTool({ workspaceId: ws, tz: TZ }, "cancel_scheduled_post", { proposalId: p.id });
  expect(own.isError).toBeFalsy();
  expect((await proposal(p.id)).status).toBe("cancelled");
});

it("reports the scheduled outcome without queueing an AI follow-up turn", async () => {
  const { createConversation } = await import("@/lib/conversations");
  const { ws, p, scheduleAt } = await ready();
  const conv = await createConversation(ws, { firstText: "לתזמן סטורי" });
  const d = await db();
  await d.update(schema.proposals).set({ conversationId: conv.id }).where(eq(schema.proposals.id, p.id));
  await approveProposal(ws, p.id, p.versionHash);
  await due(p, scheduleAt);
  const receiptJob = (await claimNext(["execute"]))!;
  expect(receiptJob.input.proposalId).toBe(p.id);
  await runJob(receiptJob);
  expect((await proposal(p.id)).status, JSON.stringify((await proposal(p.id)).result)).toBe("done");
  const messages = await d.select().from(schema.messages).where(and(eq(schema.messages.workspaceId, ws), eq(schema.messages.role, "assistant")));
  expect(JSON.stringify(messages)).toContain("הסטורי פורסם.");
  expect(await d.select().from(schema.jobs).where(and(eq(schema.jobs.workspaceId, ws), eq(schema.jobs.kind, "turn")))).toHaveLength(0);
});

it("keeps a temporary provider file in this business's storage before scheduling", async () => {
  const net = await import("@/lib/net");
  const { preserveScheduledMedia } = await import("@/lib/scheduled-media");
  const { PostSpec } = await import("@/lib/specs");
  const ws = await createBusiness();
  const bytes = await sharp({ create: { width: 32, height: 48, channels: 3, background: "white" } }).jpeg().toBuffer();
  const download = vi.spyOn(net, "safeFetch").mockResolvedValue({ ok: true, url: "https://provider.example/temp.jpg", bytes: async () => bytes } as never);
  const spec = PostSpec.parse({ title: "מחר", format: "story", channels: ["instagram"], media: [{ type: "image", url: "https://provider.example/temp.jpg" }], scheduleAt: new Date(Date.now() + 3600_000).toISOString() });
  const saved = await preserveScheduledMedia(ws, spec);
  expect(saved.media[0].url).toContain("/api/media/");
  expect(saved.media[0].url).not.toBe(spec.media[0].url);
  expect((await preserveScheduledMedia(ws, spec)).media[0].url).toBe(saved.media[0].url);
  expect(download).toHaveBeenCalledTimes(1);
  const foreign = await createBusiness();
  await expect(preserveScheduledMedia(foreign, saved)).rejects.toThrow(/העסק הזה/);
});

it("finds old approved schedules for this business without exposing another business's jobs", async () => {
  const { openAndRecent } = await import("@/lib/proposals");
  const { ws, p } = await ready();
  await approveProposal(ws, p.id, p.versionHash);
  const d = await db();
  await d.update(schema.proposals).set({ decidedAt: new Date(Date.now() - 20 * 86400_000) }).where(eq(schema.proposals.id, p.id));
  expect((await openAndRecent(ws)).map(x => x.id)).toContain(p.id);
  const own = await runTool({ workspaceId: ws, tz: TZ }, "list_scheduled_posts", {});
  expect(JSON.parse(own.content).items[0].proposalId).toBe(p.id);
  const other = await createBusiness();
  const foreign = await runTool({ workspaceId: other, tz: TZ }, "list_scheduled_posts", {});
  expect(JSON.parse(foreign.content).items).toEqual([]);
});
