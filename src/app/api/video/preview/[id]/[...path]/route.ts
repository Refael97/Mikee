import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { readBytes } from "@/lib/media";
import { compose, KIT_FILES } from "@/lib/video/compose";
import { kitFiles, mediaPath, videoMedia } from "@/lib/video/render";
import { VideoSpec } from "@/lib/video/spec";

export const runtime = "nodejs";

const TYPES: Record<string, string> = { html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", woff2: "font/woff2", jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

/**
 * The video card's live preview: the same composition the renderer gets, played in the browser. Only the
 * business that owns the card can open it, only the app may frame it, and it may load nothing but its own
 * script, fonts and photos.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string; path: string[] }> }) {
  const { id, path } = await params;
  const file = path.join("/");
  const notFound = () => new Response("Not found", { status: 404 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return notFound();
  const session = await getSession();
  if (!session) return notFound();
  const d = await db();
  const p = await d.query.proposals.findFirst({ where: and(eq(schema.proposals.id, id), eq(schema.proposals.workspaceId, session.workspace.id), eq(schema.proposals.kind, "video")) });
  if (!p) return notFound();
  const spec = VideoSpec.safeParse(p.action);
  if (!spec.success) return notFound();

  let body: Uint8Array<ArrayBuffer> | string;
  if (file === "index.html") {
    const rows = await videoMedia(session.workspace.id, spec.data).catch(() => []);
    const map = Object.fromEntries(rows.map((r, i) => [r.id, mediaPath(i, r.contentType)]));
    body = compose(spec.data, map, { preview: true }).html;
  } else if (file in KIT_FILES) {
    body = new Uint8Array((await kitFiles())[file]);
  } else {
    const m = /^media\/(\d{1,2})\.[a-z]+$/.exec(file);
    const rows = m ? await videoMedia(session.workspace.id, spec.data).catch(() => []) : [];
    const row = m ? rows[Number(m[1])] : undefined;
    if (!row || mediaPath(Number(m![1]), row.contentType) !== file) return notFound();
    body = new Uint8Array(await readBytes(row));
  }
  return new Response(body, {
    headers: {
      "Content-Type": TYPES[file.split(".").pop() ?? ""] ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
      "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self'; font-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Cache-Control": "private, max-age=300",
    },
  });
}
