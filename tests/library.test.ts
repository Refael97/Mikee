import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { describeMedia, listLibrary, updateLibraryItem } from "@/lib/library";
import { deleteMedia, storageUsage, storeBytes } from "@/lib/media";
import { runTool } from "@/lib/agent/tools";
import { setAnthropicForTests } from "@/lib/agent/run";
import { createBusiness, fakeClaude, NOW, TZ } from "./support/setup";

beforeAll(() => vi.useFakeTimers({ toFake: ["Date"], now: NOW }));
afterAll(() => vi.useRealTimers());

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypisom"), Buffer.alloc(8)]);

describe("the content library", () => {
  it("keeps photos and videos, counts storage, and leaves documents out of the library", async () => {
    const ws = await createBusiness();
    await storeBytes(ws, JPEG, { filename: "שמלה.jpg", source: "upload" });
    await storeBytes(ws, MP4, { filename: "reel.mp4", source: "upload" });
    await storeBytes(ws, Buffer.from("%PDF-1.7\n"), { filename: "מחירון.pdf", source: "upload" });
    const all = await listLibrary(ws);
    expect(all.map((m) => m.kind).sort()).toEqual(["image", "video"]);
    expect((await listLibrary(ws, { kind: "video" })).map((m) => m.name)).toEqual(["reel.mp4"]);
    expect((await storageUsage(ws)).used).toBe(JPEG.length + MP4.length + 9);
  });

  it("Mikee describes an image once, then finds it by what it shows", async () => {
    const ws = await createBusiness();
    const m = await storeBytes(ws, JPEG, { filename: "IMG_2041.jpg", source: "upload" });
    const fake = fakeClaude([() => ({ content: [{ type: "text", text: '{"description":"שמלה אדומה על רקע לבן","tags":["שמלה","אדום"]}' }], stop_reason: "end_turn" })]);
    setAnthropicForTests(fake);
    await describeMedia(ws, TZ, m.id);
    await describeMedia(ws, TZ, m.id); // already described: no second call
    expect(fake.requests).toHaveLength(1);

    const r = await runTool({ workspaceId: ws, tz: TZ }, "search_library", { q: "אדומה" });
    const out = JSON.parse(r.content);
    expect(out.count).toBe(1);
    expect(out.items[0].url).toMatch(/\?s=/); // a signed link Meta can fetch
    expect(r.content).toContain("untrusted"); // descriptions are data, not instructions
    expect(JSON.parse(r.content).items[0].id).toBe(m.id);
  });

  it("folders, deletion, and no reach into another business", async () => {
    const a = await createBusiness();
    const b = await createBusiness();
    const m = await storeBytes(a, JPEG, { filename: "x.jpg", source: "upload" });
    await updateLibraryItem(b, m.id, { folder: "פרוץ" });
    expect(await deleteMedia(b, m.id)).toBe(false);
    await updateLibraryItem(a, m.id, { folder: "קולקציית חורף" });
    expect((await listLibrary(a, { folder: "קולקציית חורף" })).length).toBe(1);
    expect(await deleteMedia(a, m.id)).toBe(true);
    expect(await listLibrary(a)).toEqual([]);
    const d = await db();
    const row = await d.query.media.findFirst({ where: eq(schema.media.id, m.id) });
    expect(row?.bytes).toBeNull();
  });
});
