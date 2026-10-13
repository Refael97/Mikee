import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";

export const runtime = "nodejs";

const MAX = 50 * 1024 * 1024;
const ALLOWED = /^(image\/|video\/|audio\/|application\/pdf$|text\/|application\/json$|application\/vnd\.openxmlformats|application\/vnd\.ms-excel|text\/csv$)/;

/** Files the client attaches to a message. Stored with an unguessable public URL so Meta can use them too. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "לא התקבל קובץ" }, { status: 400 });
  if (file.size > MAX) return Response.json({ error: "הקובץ גדול מדי (עד 50MB)" }, { status: 413 });
  const type = file.type || "application/octet-stream";
  if (!ALLOWED.test(type)) return Response.json({ error: "סוג הקובץ לא נתמך" }, { status: 415 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const d = await db();
  const [row] = await d
    .insert(schema.media)
    .values({ workspaceId: session.workspace.id, contentType: type, bytes, size: bytes.length, source: "upload", filename: file.name.slice(0, 200) })
    .returning({ id: schema.media.id });
  const base = process.env.APP_URL?.replace(/\/$/, "") ?? "";
  return Response.json({ id: row.id, name: file.name, type, size: bytes.length, url: `${base}/api/media/${row.id}` });
}
