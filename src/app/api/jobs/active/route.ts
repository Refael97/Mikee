import { getSession } from "@/lib/auth";
import { activeTurn } from "@/lib/jobs";

export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const job = await activeTurn(session.workspace.id);
  return Response.json({ jobId: job?.id ?? null });
}
