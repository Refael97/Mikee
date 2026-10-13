import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/** Public, unguessable URLs for generated media, so Meta can fetch them when building ads and posts. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const d = await db();
  const m = await d.query.media.findFirst({ where: eq(schema.media.id, id) });
  if (!m) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(m.bytes), {
    headers: { "Content-Type": m.contentType, "Content-Length": String(m.size), "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
