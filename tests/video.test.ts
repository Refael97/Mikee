import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runTool, TOOLS } from "@/lib/agent/tools";
import { approveProposal } from "@/lib/proposals";
import { listLibrary } from "@/lib/library";
import { storeBytes } from "@/lib/media";
import { compose } from "@/lib/video/compose";
import { VideoSpec } from "@/lib/video/spec";
import { createBusiness, drainJobs, NOW, proposal, TZ } from "./support/setup";

beforeAll(() => vi.useFakeTimers({ toFake: ["Date"], now: NOW }));
afterAll(() => vi.useRealTimers());

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypisom"), Buffer.alloc(64)]);
const SECRET = "s".repeat(32);

type Sent = { url: string; auth: string | null; body: { files: { path: string; data: string }[]; duration: number } };
let sent: Sent[] = [];
let answer: () => Response = () => new Response(MP4, { headers: { "content-type": "video/mp4" } });
const realFetch = globalThis.fetch;

beforeEach(() => {
  process.env.RENDER_URL = "http://render.internal:8080";
  process.env.RENDER_SECRET = SECRET;
  sent = [];
  answer = () => new Response(MP4, { headers: { "content-type": "video/mp4" } });
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.url;
    if (!url.startsWith("http://render.internal")) return realFetch(input, init);
    sent.push({ url, auth: new Headers(init?.headers).get("authorization"), body: JSON.parse(String(init?.body)) });
    return answer();
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.RENDER_URL;
  delete process.env.RENDER_SECRET;
});

const ctx = (ws: string) => ({ workspaceId: ws, tz: TZ });
async function photo(ws: string) {
  return (await storeBytes(ws, JPEG, { filename: "dress.jpg", source: "upload", inLibrary: true })).id;
}
const reel = (id: string, extra: Record<string, unknown> = {}) => ({
  title: "קולקציית שבת",
  why: "סרטון קצר לקולקציה החדשה, מהתמונות שלך",
  scenes: [
    { type: "title", headline: "הקולקציה החדשה", mediaId: id },
    { type: "product", mediaId: id, name: "שמלת סאטן", price: "₪349" },
    { type: "cta", headline: "15% הנחה", action: "לקנייה באתר" },
  ],
  ...extra,
});

describe("the composition", () => {
  it("escapes every word, loads nothing from the network, and avoids the RTL root that renders black", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const spec = VideoSpec.parse(reel(id, { title: "</title><script>alert(1)</script>", scenes: [{ type: "text", lines: ['<img src=x onerror="alert(1)">', "שורה"] }] }));
    const { html, duration, width, height } = compose(spec, {});
    expect(html).not.toMatch(/<script>alert|<img src=x/);
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<html[^>]*dir=/);
    expect([width, height, duration]).toEqual([1080, 1920, 3.5]);
  });

  it("refuses videos over a minute and colors that are not colors", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const long = Array.from({ length: 8 }, () => ({ type: "text", lines: ["א"], seconds: 9 }));
    expect(VideoSpec.safeParse(reel(id, { scenes: long })).success).toBe(false);
    expect(VideoSpec.safeParse(reel(id, { colors: { accent: "red;background:url(x)" } })).success).toBe(false);
  });
});

describe("making a video", () => {
  it("shows a card with a live preview, and renders nothing before approval", async () => {
    const ws = await createBusiness();
    const id = await photo(ws);
    const r = JSON.parse((await runTool(ctx(ws), "propose_video", reel(id))).content);
    expect(r.proposalId).toBeTruthy();
    const p = await proposal(r.proposalId);
    expect(p.status).toBe("pending");
    expect((p.card as any).preview).toEqual({ ratio: "9/16", seconds: 10.5 });
    await drainJobs();
    expect(sent).toHaveLength(0);
  });

  it("only uses photos from this business's own library", async () => {
    const ws = await createBusiness();
    const other = await createBusiness();
    const theirs = await photo(other);
    const r = JSON.parse((await runTool(ctx(ws), "propose_video", reel(theirs))).content);
    expect(r.error).toMatch(/not in this business's library/);
    const video = (await storeBytes(ws, MP4, { filename: "clip.mp4", source: "upload", inLibrary: true })).id;
    expect(JSON.parse((await runTool(ctx(ws), "propose_video", reel(video))).content).error).toMatch(/not a photo/);
  });

  it("after approval, renders on the worker with the secret and keeps the MP4 in the library", async () => {
    const ws = await createBusiness();
    const id = await photo(ws);
    const { proposalId } = JSON.parse((await runTool(ctx(ws), "propose_video", reel(id))).content);
    await approveProposal(ws, proposalId, (await proposal(proposalId)).versionHash);
    await drainJobs();

    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("http://render.internal:8080/render");
    expect(sent[0].auth).toBe(`Bearer ${SECRET}`);
    const paths = sent[0].body.files.map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining(["index.html", "kit/gsap.min.js", "kit/motion.js", "kit/heebo-hebrew-800.woff2", "media/0.jpg"]));
    expect(Buffer.from(sent[0].body.files.find((f) => f.path === "media/0.jpg")!.data, "base64")).toEqual(JPEG);

    const done = await proposal(proposalId);
    expect(done.status).toBe("done");
    const out = (done.result as any).media[0];
    expect(out.type).toBe("video");
    const videos = await listLibrary(ws, { kind: "video" });
    expect(videos.map((v) => v.id)).toContain(out.id);
  });

  it("a failed render can be retried and explains itself in Hebrew", async () => {
    const ws = await createBusiness();
    const id = await photo(ws);
    answer = () => new Response("{}", { status: 500 });
    const { proposalId } = JSON.parse((await runTool(ctx(ws), "propose_video", reel(id))).content);
    await approveProposal(ws, proposalId, (await proposal(proposalId)).versionHash);
    await drainJobs();
    const p = await proposal(proposalId);
    expect(p.status).toBe("failed");
    expect((p.result as any).retryable).toBe(true);
    expect((p.result as any).error).toMatch(/הרינדור/);
  });

  it("says so plainly when the renderer is not set up", async () => {
    delete process.env.RENDER_URL;
    const ws = await createBusiness();
    const id = await photo(ws);
    expect(JSON.parse((await runTool(ctx(ws), "propose_video", reel(id))).content).error).toMatch(/not connected/);
    expect(TOOLS.some((t) => t.name === "propose_video")).toBe(true);
  });
});

describe("the render worker", () => {
  it("accepts only the secret and only the files a composition is made of", async () => {
    process.env.RENDER_SECRET = SECRET;
    const w = await import("../render-worker/server.mjs");
    expect(w.authorized(`Bearer ${SECRET}`)).toBe(true);
    expect(w.authorized("Bearer wrong")).toBe(false);
    expect(w.authorized(undefined)).toBe(false);
    const ok = { duration: 10, files: [{ path: "index.html", data: "" }, { path: "kit/motion.js", data: "" }, { path: "media/0.jpg", data: "" }] };
    expect(w.checkProject(ok)).toBeNull();
    for (const path of ["../etc/passwd", "kit/../../x.js", "/abs.html", "media/0.svg", "kit/x.html"]) {
      expect(w.checkProject({ ...ok, files: [...ok.files, { path, data: "" }] })).toMatch(/bad file/);
    }
    expect(w.checkProject({ ...ok, duration: 600 })).toMatch(/duration/);
  });
});
