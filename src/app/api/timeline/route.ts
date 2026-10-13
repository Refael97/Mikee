import { getSession } from "@/lib/auth";
import { timeline } from "@/lib/conversation";

export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  return Response.json({ stage: session.workspace.stage, items: await timeline(session.workspace.id) });
}
