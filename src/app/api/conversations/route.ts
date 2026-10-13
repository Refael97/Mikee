import { getSession } from "@/lib/auth";
import { listConversations } from "@/lib/conversations";

export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const rows = await listConversations(session.workspace.id);
  return Response.json({
    conversations: rows.map((c) => ({ id: c.id, title: c.title, category: c.category, auto: c.auto, updatedAt: c.updatedAt })),
  });
}
