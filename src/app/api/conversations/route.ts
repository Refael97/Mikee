import { getSession } from "@/lib/auth";
import { listConversations, unreadPreviews } from "@/lib/conversations";

export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const rows = await listConversations(session.workspace.id);
  const previews = await unreadPreviews(session.workspace.id, rows.filter((c) => c.unread).map((c) => c.id));
  return Response.json({
    conversations: rows.map((c) => ({
      id: c.id,
      title: c.title,
      category: c.category,
      auto: c.auto,
      updatedAt: c.updatedAt,
      unread: c.unread,
      preview: previews[c.id],
    })),
  });
}
