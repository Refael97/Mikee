import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runTool, TOOLS } from "@/lib/agent/tools";
import { approveProposal } from "@/lib/proposals";
import { listLibrary } from "@/lib/library";
import { storeBytes } from "@/lib/media";
import { mkdtemp, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { sniff } from "@/lib/filetype";
import { compose, musicSegments } from "@/lib/video/compose";
import { VideoSpec } from "@/lib/video/spec";
import { createBusiness, drainJobs, NOW, proposal, TZ } from "./support/setup";
import { addCredits, creditBalance } from "@/lib/credits";
import { recordUsage } from "@/lib/usage";

beforeAll(() => vi.useFakeTimers({ toFake: ["Date"], now: NOW }));
afterAll(() => vi.useRealTimers());

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypisom"), Buffer.alloc(64)]);
const MP3 = Buffer.concat([Buffer.from("ID3"), Buffer.from([4, 0, 0, 0, 0, 0, 0]), Buffer.alloc(32, 7)]);
const SECRET = "s".repeat(32);

/** The framed project stream the worker receives: [path length][path][size][bytes]... */
function frames(...files: [string, Buffer][]) {
  return Buffer.concat(
    files.flatMap(([path, bytes]) => {
      const p = Buffer.from(path);
      const head = Buffer.alloc(4 + p.length + 8);
      head.writeUInt32BE(p.length, 0);
      p.copy(head, 4);
      head.writeBigUInt64BE(BigInt(bytes.length), 4 + p.length);
      return [head, bytes];
    }),
  );
}
function unframe(buf: Buffer) {
  const files: { path: string; data: Buffer }[] = [];
  for (let i = 0; i < buf.length; ) {
    const len = buf.readUInt32BE(i);
    const path = buf.subarray(i + 4, i + 4 + len).toString();
    const size = Number(buf.readBigUInt64BE(i + 4 + len));
    files.push({ path, data: buf.subarray(i + 12 + len, i + 12 + len + size) });
    i += 12 + len + size;
  }
  return files;
}

type Sent = { url: string; auth: string | null; duration: string | null; files: { path: string; data: Buffer }[] };
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
    const h = new Headers(init?.headers);
    sent.push({ url, auth: h.get("authorization"), duration: h.get("x-duration"), files: unframe(Buffer.from(await new Response(init?.body).arrayBuffer())) });
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
async function clip(ws: string) {
  return (await storeBytes(ws, MP4, { filename: "runway.mp4", source: "upload", inLibrary: true })).id;
}
async function song(ws: string) {
  return (await storeBytes(ws, MP3, { filename: "track.mp3", source: "upload" })).id;
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

  it("plays clips for their scene, muted unless they keep their sound, under music that dips for speech", () => {
    const [a, b, m] = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
    const spec = VideoSpec.parse(
      reel(a, {
        scenes: [
          { type: "title", headline: "חדש", mediaId: a, seconds: 3 },
          { type: "clip", mediaId: b, from: 4, seconds: 5, sound: true, headline: "מאחורי הקלעים" },
          { type: "cta", headline: "עכשיו באתר", action: "לקנייה", seconds: 2 },
        ],
        music: { mediaId: m, volume: 0.8 },
      }),
    );
    const { html } = compose(spec, { [a]: { path: "media/0.mp4", kind: "video" }, [b]: { path: "media/1.mp4", kind: "video" }, [m]: { path: "media/2.mp3", kind: "audio" } });
    expect(html).toContain('<video class="fill" src="media/0.mp4" data-start="0" data-duration="3" data-media-start="0" muted');
    expect(html).toContain('<video class="fill" src="media/1.mp4" data-start="3" data-duration="5" data-media-start="4" data-has-audio="true"');
    const audio = [...html.matchAll(/<audio src="media\/2.mp3" data-start="([\d.]+)" data-duration="([\d.]+)" data-media-start="([\d.]+)" data-volume="([\d.]+)"/g)].map((x) => x.slice(1).map(Number));
    expect(audio).toEqual([
      [0, 3, 0, 0.8],
      [3, 5, 3, 0.2],
      [8, 2, 8, 0.8],
    ]);
    expect(musicSegments(10, 0.5, 2, [])).toEqual([{ start: 0, seconds: 10, mediaStart: 2, volume: 0.5 }]);
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
    const logo = { type: "cta", headline: "x", action: "y", logoMediaId: video };
    expect(JSON.parse((await runTool(ctx(ws), "propose_video", reel(video, { scenes: [logo] }))).content).error).toMatch(/a photo is needed/);
    const pic = await photo(ws);
    const asClip = { type: "clip", mediaId: pic, seconds: 3 };
    expect(JSON.parse((await runTool(ctx(ws), "propose_video", reel(pic, { scenes: [asClip] }))).content).error).toMatch(/a video is needed/);
    const asMusic = reel(pic, { music: { mediaId: pic } });
    expect(JSON.parse((await runTool(ctx(ws), "propose_video", asMusic)).content).error).toMatch(/a music file is needed/);
  });

  it("keeps music in the library", async () => {
    expect(sniff(MP3)?.kind).toBe("audio");
    expect(sniff(Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypM4A "), Buffer.alloc(8)]))?.type).toBe("audio/mp4");
    expect(sniff(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE")]))?.type).toBe("audio/wav");
    const ws = await createBusiness();
    await song(ws);
    expect((await listLibrary(ws, { kind: "audio" })).map((m) => m.name)).toEqual(["track.mp3"]);
  });

  it("after approval, streams photos, clips and music to the worker with the secret and keeps the MP4 in the library", async () => {
    const ws = await createBusiness();
    const id = await photo(ws);
    const v = await clip(ws);
    const m = await song(ws);
    const spec = reel(id, { scenes: [...reel(id).scenes, { type: "clip", mediaId: v, from: 1, seconds: 4, sound: true }], music: { mediaId: m } });
    const { proposalId } = JSON.parse((await runTool(ctx(ws), "propose_video", spec)).content);
    await approveProposal(ws, proposalId, (await proposal(proposalId)).versionHash);
    await drainJobs();

    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("http://render.internal:8080/render");
    expect(sent[0].auth).toBe(`Bearer ${SECRET}`);
    expect(sent[0].duration).toBe("14.5");
    const paths = sent[0].files.map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining(["index.html", "kit/gsap.min.js", "kit/motion.js", "kit/heebo-hebrew-800.woff2", "media/0.jpg", "media/1.mp4", "media/2.mp3"]));
    const file = (p: string) => sent[0].files.find((f) => f.path === p)!.data;
    expect(file("media/0.jpg")).toEqual(JPEG);
    expect(file("media/1.mp4")).toEqual(MP4);
    expect(file("media/2.mp3")).toEqual(MP3);
    expect(file("index.html").toString()).toContain('src="media/1.mp4"');

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
  it("accepts only the secret and a sane length", async () => {
    process.env.RENDER_SECRET = SECRET;
    const w = await import("../render-worker/server.mjs");
    expect(w.authorized(`Bearer ${SECRET}`)).toBe(true);
    expect(w.authorized("Bearer wrong")).toBe(false);
    expect(w.authorized(undefined)).toBe(false);
    expect(w.checkDuration("14.5")).toBeNull();
    expect(w.checkDuration("600")).toMatch(/duration/);
    expect(w.checkDuration(undefined)).toMatch(/duration/);
  });

  it("writes the streamed files to disk, and refuses anything but a composition's files before writing it", async () => {
    const w = await import("../render-worker/server.mjs");
    const dir = await mkdtemp(join(tmpdir(), "rw-"));
    const body = frames(["index.html", Buffer.from("<html></html>")], ["media/0.mp4", MP4], ["media/1.mp3", MP3]);
    // Arrives in awkward pieces, as it would over the network.
    const pieces = async function* () {
      for (let i = 0; i < body.length; i += 7) yield body.subarray(i, i + 7);
    };
    expect(await w.receiveProject(pieces(), dir)).toEqual(["index.html", "media/0.mp4", "media/1.mp3"]);
    expect(await readFile(join(dir, "media/0.mp4"))).toEqual(MP4);
    expect(await readFile(join(dir, "media/1.mp3"))).toEqual(MP3);

    for (const path of ["../etc/passwd", "kit/../../x.js", "/abs.html", "media/0.svg", "kit/x.html", "media/0.exe"]) {
      const bad = frames(["index.html", Buffer.from("x")], [path, Buffer.from("evil")]);
      await expect(w.receiveProject([bad], await mkdtemp(join(tmpdir(), "rw-")))).rejects.toThrow(/bad file/);
    }
    const cut = frames(["index.html", Buffer.from("<html></html>")]).subarray(0, 20);
    await expect(w.receiveProject([cut], await mkdtemp(join(tmpdir(), "rw-")))).rejects.toThrow(/truncated/);
  });
});

describe("video editing is a service, priced in credits", () => {
  it("shows its price on the card and charges it once, for a finished video", async () => {
    const ws = await createBusiness();
    const id = await photo(ws);
    const r = JSON.parse((await runTool(ctx(ws), "propose_video", reel(id))).content);
    // 10.5 seconds at 2 credits a second (the minimum is 20).
    expect(r.credits).toBe(21);
    const p = await proposal(r.proposalId);
    expect((p.card as any).rows.find((x: any) => x.label === "עלות").value).toBe("21 קרדיטים");
    expect((await creditBalance(ws, TZ)).byKind.video).toBe(0);

    await approveProposal(ws, p.id, p.versionHash);
    await drainJobs();
    expect((await proposal(p.id)).status).toBe("done");
    const b = await creditBalance(ws, TZ);
    expect(b.byKind.video).toBe(21);
    expect(b.used).toBe(21);
    // A failed attempt costs nothing.
    answer = () => new Response("render failed", { status: 500 });
    const second = JSON.parse((await runTool(ctx(ws), "propose_video", reel(id, { title: "גרסה נוספת" }))).content);
    const q = await proposal(second.proposalId);
    await approveProposal(ws, q.id, q.versionHash);
    await drainJobs();
    expect((await creditBalance(ws, TZ)).byKind.video).toBe(21);
  });

  it("is refused when the month's credits cannot cover it, and runs again once credits are added", async () => {
    const ws = await createBusiness({ settings: { credits: 100 } });
    const id = await photo(ws);
    await recordUsage(ws, TZ, "claude", 0.9); // 90 credits of conversation
    const r = JSON.parse((await runTool(ctx(ws), "propose_video", reel(id))).content);
    expect(r.error).toMatch(/costs 21 credits; 10 are left this month/);
    await addCredits(ws, TZ, 50, "bought more");
    const b = await creditBalance(ws, TZ);
    expect([b.total, b.used, b.remaining]).toEqual([150, 90, 60]);
    expect(JSON.parse((await runTool(ctx(ws), "propose_video", reel(id))).content).credits).toBe(21);
  });
});

