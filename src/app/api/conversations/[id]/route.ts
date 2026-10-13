import { z } from "zod";
import { getSession } from "@/lib/auth";
import { assertSameOrigin, cleanClientText, guarded, readJson } from "@/lib/guard";
import { CATEGORIES, type Category, markRead, updateConversation } from "@/lib/conversations";

/** The client renames, moves (locks the category) or removes a conversation from the list. */
const Patch = z.object({ title: z.string().max(120).optional(), category: z.string().max(20).optional(), archived: z.boolean().optional(), read: z.boolean().optional() });

export const PATCH = guarded(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const body = await readJson(req, Patch);
  if (body.read) await markRead(session.workspace.id, id);
  if (body.category && !(body.category in CATEGORIES)) return new Response("Unknown category", { status: 400 });
  if (body.title || body.category || body.archived != null)
    await updateConversation(session.workspace.id, id, { title: body.title ? cleanClientText(body.title, 120) : undefined, category: body.category as Category | undefined, archived: body.archived });
  return Response.json({ ok: true });
});
