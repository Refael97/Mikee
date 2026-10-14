import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { readBytes } from "@/lib/media";
import { compose, KIT_FILES } from "@/lib/video/compose";
import { kitFiles, mediaMap, videoMedia } from "@/lib/video/render";
import { VideoSpec } from "@/lib/video/spec";

export const runtime = "nodejs";

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  woff2: "font/woff2",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
};

const HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self'; media-src 'self'; font-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Cache-Control": "private, max-age=300",
};

/**
 * The video card's live preview: the same composition the renderer gets, played in the browser. Only the
 * business that owns the card can open it, only the app may frame it, and it may load nothing but its own
 * script, fonts and library files. Clips answer byte ranges, so the player can seek.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; path: string[] }> }) {
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
  const type = TYPES[file.split(".").pop() ?? ""] ?? "application/octet-stream";

  if (file === "index.html") {
    const rows = await videoMedia(session.workspace.id, spec.data).catch(() => []);
    return new Response(compose(spec.data, mediaMap(rows), { preview: true }).html, { headers: { ...HEADERS, "Content-Type": type } });
  }
  if (file in KIT_FILES) return new Response(new Uint8Array((await kitFiles())[file]), { headers: { ...HEADERS, "Content-Type": type } });

  if (!/^media\/\d{1,2}\.[a-z0-9]+$/.test(file)) return notFound();
  const rows = await videoMedia(session.workspace.id, spec.data).catch(() => []);
  const map = mediaMap(rows);
  const row = rows.find((r) => map[r.id].path === file);
  if (!row) return notFound();
  const bytes = new Uint8Array(await readBytes(row));
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const size = bytes.length;
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { ...HEADERS, "Content-Range": `bytes */${size}` } });
    return new Response(bytes.slice(start, end + 1), {
      status: 206,
      headers: { ...HEADERS, "Content-Type": type, "Accept-Ranges": "bytes", "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(bytes, { headers: { ...HEADERS, "Content-Type": type, "Accept-Ranges": "bytes", "Content-Length": String(bytes.length) } });
}
