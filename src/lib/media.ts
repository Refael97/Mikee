import "server-only";
import { db, schema } from "./db";

const MAX_BYTES = 200 * 1024 * 1024;

/**
 * Copies generated media into our own storage and returns a stable public URL, so the server can read it
 * later and Meta can fetch it when building ads or posts (provider URLs may be temporary or private).
 */
export async function storeFromUrl(workspaceId: string, url: string, source: string, sourceRef?: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download generated media (HTTP ${res.status})`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error("Generated media is too large to store");
  const contentType = res.headers.get("content-type")?.split(";")[0] || (/\.(mp4|mov)(\?|$)/i.test(url) ? "video/mp4" : "image/jpeg");
  const d = await db();
  const [row] = await d
    .insert(schema.media)
    .values({ workspaceId, contentType, bytes, size: bytes.length, source, sourceRef })
    .returning({ id: schema.media.id });
  const base = process.env.APP_URL?.replace(/\/$/, "") ?? "";
  return { id: row.id, url: `${base}/api/media/${row.id}`, type: contentType.startsWith("video") ? ("video" as const) : ("image" as const) };
}
