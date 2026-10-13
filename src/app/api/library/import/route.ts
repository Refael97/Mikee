import { z } from "zod";
import { getSession } from "@/lib/auth";
import { importFromDrive } from "@/lib/google";
import { assertSameOrigin, guarded, limit, readJson, Refused } from "@/lib/guard";
import { MediaRejected } from "@/lib/media";

export const runtime = "nodejs";

const Body = z.object({ fileIds: z.array(z.string().max(100)).min(1).max(50) });

/** Copies the files the client picked in Google Drive into the content library. */
export const POST = guarded(async (req: Request) => {
  assertSameOrigin(req);
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { fileIds } = await readJson(req, Body);
  await limit(`drive-import:${session.workspace.id}`, 20, 3600, "יותר מדי ייבואים בשעה האחרונה. נסי שוב מאוחר יותר.");
  try {
    return Response.json(await importFromDrive(session.workspace.id, fileIds));
  } catch (e) {
    if (e instanceof MediaRejected) throw new Refused(e.message, 409);
    throw e;
  }
});
