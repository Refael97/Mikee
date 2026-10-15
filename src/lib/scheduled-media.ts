import "server-only";
import { createHash } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "./db";
import { getMedia, storeFromUrl, toView } from "./media";
import { instagramPublishAt } from "./post-schedule";
import type { PostSpec } from "./specs";

/** Keep provider/CDN links from expiring between approval and publication. */
export async function preserveScheduledMedia(workspaceId: string, spec: PostSpec): Promise<PostSpec> {
  if (!instagramPublishAt("post", spec)) return spec;
  const base = process.env.APP_URL?.replace(/\/$/, "");
  const media: PostSpec["media"] = [];
  for (const item of spec.media) {
    const url = new URL(item.url);
    const own = base && url.origin === new URL(base).origin ? /^\/api\/media\/([0-9a-f-]{36})$/i.exec(url.pathname) : null;
    if (own) {
      const row = await getMedia(workspaceId, own[1]);
      if (!row) throw new Error("הקובץ לפרסום לא נמצא בספרייה של העסק הזה. צריך לבחור קובץ זמין.");
      const view = toView(row);
      if (view.kind !== item.type) throw new Error("סוג הקובץ לא תואם למדיה שנבחרה.");
      media.push({ ...item, url: view.url });
      continue;
    }
    const sourceRef = createHash("sha256").update(item.url).digest("hex");
    const d = await db();
    const cached = await d.query.media.findFirst({ where: and(eq(schema.media.workspaceId, workspaceId), eq(schema.media.source, "scheduled"), eq(schema.media.sourceRef, sourceRef), isNull(schema.media.deletedAt)) });
    const saved = cached ? { url: toView(cached).url, type: toView(cached).kind } : await storeFromUrl(workspaceId, item.url, "scheduled", sourceRef);
    if (saved.type !== item.type) throw new Error("הקובץ שבקישור אינו מהסוג שנבחר לפרסום.");
    media.push({ ...item, url: saved.url });
  }
  return { ...spec, media };
}
