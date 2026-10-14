import { z } from "zod";
import { getSession } from "@/lib/auth";
import { assertSameOrigin, guarded, limit, readJson } from "@/lib/guard";
import { updateSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The client's approval level for Mikee, for this business. */
export const POST = guarded(async (req: Request) => {
  assertSameOrigin(req);
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { autonomy } = await readJson(req, z.object({ autonomy: z.enum(["every_step", "important", "final"]) }));
  await limit(`autonomy:${session.workspace.id}`, 60, 3600);
  await updateSettings(session.workspace.id, { autonomy });
  return Response.json({ ok: true, autonomy });
});
