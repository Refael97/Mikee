import "server-only";
import { readFile } from "fs/promises";
import { join } from "path";
import { getMedia, readBytes } from "../media";
import { compose, KIT_FILES, type MediaFiles } from "./compose";
import { mediaIdsOf, type VideoSpec } from "./spec";

/** The render worker, when it is set up (RENDER_URL + RENDER_SECRET). */
export function videoRenderer(): { url: string; secret: string } | null {
  const url = process.env.RENDER_URL?.replace(/\/+$/, "");
  const secret = process.env.RENDER_SECRET ?? "";
  return url && secret.length >= 24 ? { url, secret } : null;
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const MAX_PROJECT_BYTES = 60 * 1024 * 1024;

export class VideoProblem extends Error {}

/** The library images a video uses, checked to belong to this business and to be images. */
export async function videoMedia(workspaceId: string, spec: VideoSpec) {
  const rows = [];
  for (const id of mediaIdsOf(spec)) {
    const row = await getMedia(workspaceId, id);
    if (!row) throw new VideoProblem(`Image ${id} is not in this business's library (use search_library for ids).`);
    if (!EXT[row.contentType]) throw new VideoProblem(`Item ${id} is not a photo (${row.contentType}); videos use photos from the library.`);
    rows.push(row);
  }
  return rows;
}

export const mediaPath = (i: number, contentType: string) => `media/${i}.${EXT[contentType]}`;

let kitCache: Record<string, Buffer> | null = null;
export async function kitFiles(): Promise<Record<string, Buffer>> {
  if (!kitCache) {
    const entries = await Promise.all(Object.entries(KIT_FILES).map(async ([to, from]) => [to, await readFile(join(process.cwd(), from))] as const));
    kitCache = Object.fromEntries(entries);
  }
  return kitCache;
}

/** Everything the render worker needs, in one request: the composition, its kit, and the photos' bytes. */
export async function buildProject(workspaceId: string, spec: VideoSpec) {
  const rows = await videoMedia(workspaceId, spec);
  const map: MediaFiles = {};
  const files: { path: string; data: string }[] = [];
  let size = 0;
  for (const [i, row] of rows.entries()) {
    const path = mediaPath(i, row.contentType);
    map[row.id] = path;
    const bytes = await readBytes(row);
    if (!bytes.length) throw new VideoProblem(`Image ${row.id} could not be read from storage.`);
    size += bytes.length;
    files.push({ path, data: Buffer.from(bytes).toString("base64") });
  }
  if (size > MAX_PROJECT_BYTES) throw new VideoProblem("The photos are too large together for one video. Use fewer photos.");
  const { html, duration, width, height } = compose(spec, map);
  files.push({ path: "index.html", data: Buffer.from(html).toString("base64") });
  for (const [path, bytes] of Object.entries(await kitFiles())) files.push({ path, data: bytes.toString("base64") });
  return { files, duration, width, height };
}

/** Sends the project to the worker and returns the MP4. The worker is ours, on the private network. */
export async function renderVideo(project: Awaited<ReturnType<typeof buildProject>>): Promise<Buffer> {
  const r = videoRenderer();
  if (!r) throw new VideoProblem("Video rendering is not connected (RENDER_URL / RENDER_SECRET).");
  const res = await fetch(`${r.url}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${r.secret}` },
    body: JSON.stringify({ files: project.files, duration: project.duration }),
    signal: AbortSignal.timeout(12 * 60_000),
  });
  if (res.status === 429) throw new Error("The video renderer is busy. Retrying will try again.");
  if (!res.ok) throw new Error(`Video render failed (HTTP ${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}
