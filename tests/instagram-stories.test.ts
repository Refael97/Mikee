import { afterEach, expect, it, vi } from "vitest";
import sharp from "sharp";
import { publishPost, type Checkpoint } from "@/lib/meta/actions";
import { Graph } from "@/lib/meta/graph";
import { PostSpec } from "@/lib/specs";
import { dedupeKey } from "@/lib/proposals";
import { postProblem } from "@/lib/agent/tools";
import { toSocialJpeg } from "@/lib/meta/images";
import { FakeMeta } from "./support/fake-meta";

const spec = (extra = {}) => PostSpec.parse({ title: "Story", format: "story", channels: ["instagram"], media: [{ type: "video", url: "https://example.com/story.mp4" }], ...extra });
const checkpoint = (): Checkpoint => {
  const cp: Checkpoint = { data: {}, save: async patch => { Object.assign(cp.data, patch); } };
  return cp;
};
afterEach(() => vi.restoreAllMocks());

it.each(["image", "video"])("publishes a %s Story through STORIES and media_publish, and reuses its checkpoint", async type => {
  const fake = new FakeMeta();
  fake.install();
  const cp = checkpoint();
  const ctx = { graph: new Graph("test"), igUserId: "ig_1" };
  const input = spec({ media: [{ type, url: `https://example.com/story.${type === "image" ? "jpg" : "mp4"}` }] });
  expect(postProblem(input)).toBeNull();
  const result = await publishPost(ctx, input, cp, false);
  expect(result.instagram).toBeTruthy();
  const create = fake.writes().find(c => c.path === "/ig_1/media")!;
  expect(create.params.media_type).toBe("STORIES");
  expect(create.params.caption).toBeUndefined();
  expect(create.params[type === "image" ? "image_url" : "video_url"]).toBeTruthy();
  await publishPost(ctx, input, cp, true);
  expect(fake.writes(/media_publish/)).toHaveLength(1);
});

it("blocks wrong channels, captions and multiple files before publishing", async () => {
  const fake = new FakeMeta(); fake.install();
  for (const extra of [{ channels: ["facebook"] }, { text: "caption" }, { media: [] }]) {
    const input = spec(extra);
    expect(postProblem(input)).toBeTruthy();
    await expect(publishPost({ graph: new Graph("test"), igUserId: "ig_1" }, input, checkpoint(), false)).rejects.toThrow();
  }
  expect(fake.writes()).toHaveLength(0);
});

it("does not repeat a publishing request whose transport outcome is unknown", async () => {
  const fake = new FakeMeta(); fake.install();
  const cp = checkpoint(); cp.data.igContainer = fake.add("igcontainer", {}).id; cp.data.igPublishAttempted = true;
  await expect(publishPost({ graph: new Graph("test"), igUserId: "ig_1" }, spec(), cp, true)).rejects.toThrow(/unknown outcome/);
  expect(fake.writes()).toHaveLength(0);
  expect(fake.calls.some(c => c.path === "/ig_1/media")).toBe(false);
});

it("keeps a portrait Story at 9:16 instead of cropping it to feed format", async () => {
  const source = await sharp({ create: { width: 1080, height: 1920, channels: 3, background: "white" } }).png().toBuffer();
  const m = await sharp(await toSocialJpeg(source, "instagram-story")).metadata();
  expect(m.format).toBe("jpeg");
  expect(m.width! / m.height!).toBeCloseTo(9 / 16, 3);
});

it("does not merge different captionless Stories into one pending proposal", () => {
  const first = spec();
  const second = spec({ media: [{ type: "video", url: "https://example.com/other.mp4" }] });
  expect(dedupeKey("post", first)).not.toBe(dedupeKey("post", second));
  expect(dedupeKey("post", first)).toBe(dedupeKey("post", spec()));
});

it("does not guess a published Story from an empty caption", async () => {
  const graph = new Graph("test");
  vi.spyOn(graph, "get").mockResolvedValue({ status_code: "PUBLISHED" });
  const publish = vi.spyOn(graph, "post");
  const cp = checkpoint(); cp.data.igContainer = "existing-story-container";
  await expect(publishPost({ graph, igUserId: "ig_1" }, spec(), cp, true)).rejects.toThrow(/already published/);
  expect(publish).not.toHaveBeenCalled();
  expect(cp.data.instagram).toBeUndefined();
});

it("creates a Story card without publishing and publishes only through approval", async () => {
  const { createBusiness, drainJobs, proposal } = await import("./support/setup");
  const { runTool } = await import("@/lib/agent/tools");
  const { approveProposal } = await import("@/lib/proposals");
  const fake = new FakeMeta(); fake.install();
  const ws = await createBusiness();
  const raw = await runTool({ workspaceId: ws, tz: "Asia/Jerusalem" }, "propose_post", { ...spec(), clientAsked: true });
  const output = JSON.parse(raw.content);
  expect(raw.isError).toBeFalsy();
  expect(fake.writes()).toHaveLength(0);
  const id = output.proposalId ?? output.id;
  const card = await proposal(id);
  await approveProposal(ws, id, card.versionHash);
  await drainJobs();
  expect((await proposal(id)).status).toBe("done");
  expect(fake.writes(/media_publish/)).toHaveLength(1);
});
