import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { type Kind, limitLabel, maxBytes, safeName, sniff } from "./filetype";
import { safeFetch } from "./net";
import { GB, planOf } from "./plans";
import { getSettings } from "./settings";
import { deleteObject, getObject, putObject } from "./storage";
import { enqueue } from "./jobs";

export class MediaRejected extends Error {}

const base = () => process.env.APP_URL?.replace(/\/$/, "") ?? "";

function signature(id: string) {
  const secret = process.env.SESSION_SECRET ?? "";
  return createHmac("sha256", `media:${secret}`).update(id).digest("base64url").slice(0, 24);
}

export function verifyMediaSignature(id: string, sig: string | null): boolean {
  if (!sig) return false;
  const a = Buffer.from(signature(id));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Images and videos get a signed link: Meta and Instagram fetch them from it when building ads and posts.
 * Documents (PDF, CSV) get a plain link that only works for the signed-in business.
 */
export function mediaUrl(id: string, kind: string | null) {
  const path = `${base()}/api/media/${id}`;
  return kind === "image" || kind === "video" ? `${path}?s=${signature(id)}` : path;
}

export type MediaView = { id: string; url: string; type: string; kind: Kind; name: string; size: number; createdAt?: string; description?: string | null; source?: string; folder?: string | null };

export function toView(r: typeof schema.media.$inferSelect): MediaView {
  const kind = (r.kind ?? (r.contentType.startsWith("video") ? "video" : r.contentType.startsWith("image") ? "image" : "pdf")) as Kind;
  return {
    id: r.id,
    url: mediaUrl(r.id, kind),
    type: r.contentType,
    kind,
    name: r.filename ?? "file",
    size: r.size,
    createdAt: r.createdAt.toISOString(),
    description: r.description,
    source: r.source,
    folder: r.folder,
  };
}

export async function storageUsage(workspaceId: string) {
  const d = await db();
  const [{ used }] = await d
    .select({ used: sql<string>`coalesce(sum(${schema.media.size}), 0)::bigint` })
    .from(schema.media)
    .where(and(eq(schema.media.workspaceId, workspaceId), isNull(schema.media.deletedAt)));
  const plan = planOf(await getSettings(workspaceId));
  return { used: Number(used), limit: plan.storageGb * GB, plan };
}

/**
 * The one way bytes enter Mikee: the real type is read from the content, the size is checked against the
 * type's limit and the plan's storage, and the bytes go to private storage under the business's own prefix.
 */
export async function storeBytes(
  workspaceId: string,
  bytes: Buffer,
  opts: { filename?: string; source: string; sourceRef?: string; inLibrary?: boolean; folder?: string },
): Promise<MediaView> {
  const found = sniff(bytes, opts.filename ?? "");
  if (!found) throw new MediaRejected("סוג הקובץ לא נתמך. אפשר להעלות תמונות, סרטונים, PDF וקבצי טקסט או CSV.");
  if (bytes.length > maxBytes(found.kind)) throw new MediaRejected(`הקובץ גדול מדי (עד ${limitLabel(found.kind)})`);
  const { used, limit } = await storageUsage(workspaceId);
  if (used + bytes.length > limit) throw new MediaRejected("נגמר המקום בספרייה. אפשר למחוק קבצים ישנים או לשדרג את המנוי.");

  const stored = await putObject(workspaceId, bytes, found.type);
  const d = await db();
  const [row] = await d
    .insert(schema.media)
    .values({
      workspaceId,
      contentType: found.type,
      kind: found.kind,
      bytes: stored.bytes,
      storage: stored.storage,
      key: stored.key,
      size: bytes.length,
      source: opts.source,
      sourceRef: opts.sourceRef,
      filename: safeName(opts.filename || `${opts.source}-${Date.now()}`, found.ext),
      inLibrary: opts.inLibrary ?? (found.kind === "image" || found.kind === "video" || found.kind === "audio"),
      folder: opts.folder,
    })
    .returning();
  // New library images get a short description in the background, so Mikee can find them by what they show.
  if (found.kind === "image" && row.inLibrary && process.env.MIKEE_DESCRIBE_MEDIA !== "off") {
    await enqueue(workspaceId, "describe", { mediaId: row.id }).catch(() => undefined);
  }
  return toView(row);
}

/** Copies media from a provider (Higgsfield, Drive export) into our storage, through the network guard. */
export async function storeFromUrl(workspaceId: string, url: string, source: string, sourceRef?: string) {
  const res = await safeFetch(url, { maxBytes: maxBytes("video"), timeoutMs: 180_000 });
  if (!res.ok) throw new Error(`Could not download generated media (HTTP ${res.status})`);
  const name = decodeURIComponent(new URL(res.url).pathname.split("/").pop() ?? "") || source;
  const view = await storeBytes(workspaceId, await res.bytes(), { filename: name, source, sourceRef, inLibrary: true, folder: source === "higgsfield" ? "נוצר על ידי מייקי" : undefined });
  return { id: view.id, url: view.url, type: view.kind === "video" ? ("video" as const) : ("image" as const) };
}

export async function getMedia(workspaceId: string, id: string) {
  const d = await db();
  return d.query.media.findFirst({ where: and(eq(schema.media.id, id), eq(schema.media.workspaceId, workspaceId), isNull(schema.media.deletedAt)) });
}

export async function readBytes(row: typeof schema.media.$inferSelect) {
  return getObject(row);
}

/** Our own media link → its bytes, without going over the network (used when uploading to Meta). */
export async function bytesFromOwnUrl(url: string): Promise<Buffer | null> {
  const m = /\/api\/media\/([0-9a-f-]{36})/i.exec(url);
  if (!m || !url.startsWith(base())) return null;
  const d = await db();
  const row = await d.query.media.findFirst({ where: and(eq(schema.media.id, m[1]), isNull(schema.media.deletedAt)) });
  return row ? getObject(row) : null;
}

export async function deleteMedia(workspaceId: string, id: string) {
  const row = await getMedia(workspaceId, id);
  if (!row) return false;
  const d = await db();
  await d.update(schema.media).set({ deletedAt: new Date(), bytes: null }).where(eq(schema.media.id, id));
  await deleteObject(row);
  return true;
}
