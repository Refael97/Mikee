import { getSession } from "@/lib/auth";
import { assertSameOrigin, guarded, limit, LIMITS, Refused } from "@/lib/guard";
import { MediaRejected, storeBytes, tooBig, uploadLimit } from "@/lib/media";

export const runtime = "nodejs";

/** Room for the form's own fields around the file. */
const FORM_OVERHEAD = 1024 * 1024;

/** The largest file the server takes now, so the page can say so before sending anything. */
export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  return Response.json({ maxBytes: uploadLimit() });
}

/**
 * Files the client attaches to a message or adds to the library. The real type is read from the bytes
 * (see lib/filetype.ts); the browser's claimed type is ignored.
 */
export const POST = guarded(async (req: Request) => {
  assertSameOrigin(req);
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  // Refused before the body is read, so an oversized file never fills the server's memory.
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > uploadLimit() + FORM_OVERHEAD) throw new Refused(tooBig(length - FORM_OVERHEAD), 413);
  await limit(`upload:${session.workspace.id}`, LIMITS.uploadsPerHour, 3600, "יותר מדי העלאות בשעה האחרונה. נסי שוב מאוחר יותר.");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new Refused("לא התקבל קובץ");
  const folder = String(form?.get("folder") ?? "").slice(0, 60) || undefined;
  const library = form?.get("library") === "1";
  try {
    const m = await storeBytes(session.workspace.id, Buffer.from(await file.arrayBuffer()), { filename: file.name, source: "upload", folder, inLibrary: library || undefined });
    return Response.json({ id: m.id, name: m.name, type: m.type, kind: m.kind, size: m.size, url: m.url });
  } catch (e) {
    if (e instanceof MediaRejected) throw new Refused(e.message, 415);
    throw e;
  }
});
