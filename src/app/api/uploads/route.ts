import { getSession } from "@/lib/auth";
import { assertSameOrigin, guarded, limit, LIMITS, Refused } from "@/lib/guard";
import { MediaRejected, storeBytes } from "@/lib/media";

export const runtime = "nodejs";

const MAX_REQUEST = 310 * 1024 * 1024;

/**
 * Files the client attaches to a message or adds to the library. The real type is read from the bytes
 * (see lib/filetype.ts); the browser's claimed type is ignored.
 */
export const POST = guarded(async (req: Request) => {
  assertSameOrigin(req);
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_REQUEST) throw new Refused("הקובץ גדול מדי", 413);
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
