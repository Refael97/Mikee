import { and, eq, isNull } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { readBytes, verifyMediaSignature } from "@/lib/media";

export const runtime = "nodejs";

/**
 * Serves stored files. A signed link (images and videos, so Meta can fetch them for ads and posts) works for
 * anyone holding it; without a signature the signed-in business must own the file. Files are always served
 * as inert content: no sniffing, no scripts, documents download instead of opening.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const signed = verifyMediaSignature(id, new URL(req.url).searchParams.get("s"));
  const d = await db();
  const m = await d.query.media.findFirst({ where: and(eq(schema.media.id, id), isNull(schema.media.deletedAt)) });
  if (!m) return new Response("Not found", { status: 404 });
  if (!signed) {
    const session = await getSession();
    if (!session || session.workspace.id !== m.workspaceId) return new Response("Not found", { status: 404 });
  }
  const bytes = await readBytes(m);
  const visual = /^(image\/(jpeg|png|gif|webp)|video\/(mp4|quicktime|webm)|audio\/(mpeg|mp4|aac|wav|ogg))$/.test(m.contentType);
  const name = encodeURIComponent(m.filename ?? "file");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": visual || m.contentType === "application/pdf" ? m.contentType : "application/octet-stream",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${visual ? "inline" : "attachment"}; filename*=UTF-8''${name}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Cross-Origin-Resource-Policy": signed ? "cross-origin" : "same-origin",
      "Cache-Control": signed ? "public, max-age=31536000, immutable" : "private, max-age=3600",
    },
  });
}
