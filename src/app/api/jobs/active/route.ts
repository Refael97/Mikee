import { getSession } from "@/lib/auth";
import { activeTurn } from "@/lib/jobs";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const id = new URL(req.url).searchParams.get("conversationId");
  const job = id ? await activeTurn(session.workspace.id, id) : undefined;
  return Response.json({ jobId: job?.id ?? null });
}
