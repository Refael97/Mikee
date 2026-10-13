import { getSession } from "@/lib/auth";
import { CATEGORIES, type Category, updateConversation } from "@/lib/conversations";

/** The client renames, moves (locks the category) or removes a conversation from the list. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { title?: string; category?: string; archived?: boolean };
  if (body.category && !(body.category in CATEGORIES)) return new Response("Unknown category", { status: 400 });
  await updateConversation(session.workspace.id, id, { title: body.title, category: body.category as Category | undefined, archived: body.archived });
  return Response.json({ ok: true });
}
