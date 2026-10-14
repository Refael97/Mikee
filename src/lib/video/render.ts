import "server-only";
import { readFile } from "fs/promises";
import { join } from "path";
import { getMedia, readBytes } from "../media";
import { compose, KIT_FILES, type MediaFiles } from "./compose";
import { mediaUses, type MediaUse, type VideoSpec } from "./spec";

/** The render worker, when it is set up (RENDER_URL + RENDER_SECRET). */
export function videoRenderer(): { url: string; secret: string } | null {
  const url = process.env.RENDER_URL?.replace(/\/+$/, "");
  const secret = process.env.RENDER_SECRET ?? "";
  return url && secret.length >= 24 ? { url, secret } : null;
}

const IMAGE: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const VIDEO = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const AUDIO: Record<string, string> = { "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/wav": "wav", "audio/ogg": "ogg" };
const MAX_PROJECT_BYTES = 900 * 1024 * 1024;

export class VideoProblem extends Error {}

const kindOf = (contentType: string): "image" | "video" | "audio" | null =>
  IMAGE[contentType] ? "image" : VIDEO.has(contentType) ? "video" : AUDIO[contentType] ? "audio" : null;

const FITS: Record<MediaUse, (k: string | null) => boolean> = {
  visual: (k) => k === "image" || k === "video",
  video: (k) => k === "video",
  photo: (k) => k === "image",
  audio: (k) => k === "audio",
};
const NEED: Record<MediaUse, string> = { visual: "a photo or a video", video: "a video", photo: "a photo", audio: "a music file" };

/** Inside the project: media/<n>.<ext>. Videos are always .mp4: the worker re-encodes them to H.264 for exact seeking. */
export function mediaPath(i: number, contentType: string) {
  const k = kindOf(contentType);
  return `media/${i}.${k === "video" ? "mp4" : k === "audio" ? AUDIO[contentType] : IMAGE[contentType]}`;
}

/** The library items a video uses, checked to belong to this business and to be the right kind for their place. */
export async function videoMedia(workspaceId: string, spec: VideoSpec) {
  const rows = [];
  for (const { id, uses } of mediaUses(spec)) {
    const row = await getMedia(workspaceId, id);
    if (!row) throw new VideoProblem(`Item ${id} is not in this business's library (use search_library for ids).`);
    const kind = kindOf(row.contentType);
    const wrong = uses.find((u) => !FITS[u](kind));
    if (wrong) throw new VideoProblem(`Item ${id} is ${row.contentType}, but it is used where ${NEED[wrong]} is needed.`);
    rows.push(row);
  }
  return rows;
}

export function mediaMap(rows: Awaited<ReturnType<typeof videoMedia>>): MediaFiles {
  return Object.fromEntries(rows.map((r, i) => [r.id, { path: mediaPath(i, r.contentType), kind: kindOf(r.contentType)! }]));
}

let kitCache: Record<string, Buffer> | null = null;
export async function kitFiles(): Promise<Record<string, Buffer>> {
  if (!kitCache) {
    const entries = await Promise.all(Object.entries(KIT_FILES).map(async ([to, from]) => [to, await readFile(join(process.cwd(), from))] as const));
    kitCache = Object.fromEntries(entries);
  }
  return kitCache;
}

export type ProjectFile = { path: string; bytes: () => Promise<Uint8Array> };

/** Everything the render worker needs: the composition, its kit, and the library files (read one at a time). */
export async function buildProject(workspaceId: string, spec: VideoSpec) {
  const rows = await videoMedia(workspaceId, spec);
  const size = rows.reduce((s, r) => s + Number(r.size ?? 0), 0);
  if (size > MAX_PROJECT_BYTES) throw new VideoProblem("The clips are too large together for one video. Use fewer or shorter clips.");
  const map = mediaMap(rows);
  const { html, duration, width, height } = compose(spec, map);
  const kit = await kitFiles();
  const files: ProjectFile[] = [
    { path: "index.html", bytes: async () => Buffer.from(html) },
    ...Object.entries(kit).map(([path, b]) => ({ path, bytes: async () => b })),
    ...rows.map((row) => ({
      path: map[row.id].path,
      bytes: async () => {
        const b = await readBytes(row);
        if (!b.length) throw new VideoProblem(`Item ${row.id} could not be read from storage.`);
        return b;
      },
    })),
  ];
  return { files, duration, width, height };
}

/**
 * The project as one stream of frames: [4-byte path length][path][8-byte size][bytes], repeated. Large clips
 * never sit in memory together, and the worker writes each file to disk as it arrives.
 */
export function projectStream(files: ProjectFile[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    async pull(controller) {
      if (i >= files.length) return controller.close();
      const f = files[i++];
      const bytes = await f.bytes();
      const path = Buffer.from(f.path);
      const head = Buffer.alloc(4 + path.length + 8);
      head.writeUInt32BE(path.length, 0);
      path.copy(head, 4);
      head.writeBigUInt64BE(BigInt(bytes.length), 4 + path.length);
      controller.enqueue(new Uint8Array(head));
      controller.enqueue(bytes);
    },
  });
}

/** Sends the project to the worker and returns the MP4. The worker is ours, on the private network. */
export async function renderVideo(project: Awaited<ReturnType<typeof buildProject>>): Promise<Buffer> {
  const r = videoRenderer();
  if (!r) throw new VideoProblem("Video rendering is not connected (RENDER_URL / RENDER_SECRET).");
  const res = await fetch(`${r.url}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", Authorization: `Bearer ${r.secret}`, "X-Duration": String(project.duration) },
    body: projectStream(project.files),
    // @ts-expect-error: Node's fetch needs this to send a streamed body.
    duplex: "half",
    signal: AbortSignal.timeout(20 * 60_000),
  });
  if (res.status === 429) throw new Error("The video renderer is busy. Retrying will try again.");
  if (!res.ok) throw new Error(`Video render failed (HTTP ${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}
