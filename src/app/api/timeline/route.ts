import { getSession } from "@/lib/auth";
import { timeline } from "@/lib/conversation";
import { getConversation } from "@/lib/conversations";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const id = new URL(req.url).searchParams.get("conversationId");
  if (!id || !(await getConversation(session.workspace.id, id))) return Response.json({ items: [] });
  return Response.json({ stage: session.workspace.stage, items: await timeline(session.workspace.id, id) });
}
