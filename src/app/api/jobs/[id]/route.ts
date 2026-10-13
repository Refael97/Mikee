import { getSession } from "@/lib/auth";
import { eventsSince, getJob } from "@/lib/jobs";

/** Progress of a background job since a cursor. Polling makes reconnecting after a drop trivial. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const job = await getJob(session.workspace.id, id);
  if (!job) return new Response("Not found", { status: 404 });
  const after = Number(new URL(req.url).searchParams.get("after") ?? 0);
  const events = await eventsSince(id, after);
  return Response.json({ status: job.status, kind: job.kind, events: events.map((e) => ({ id: e.id, ...e.event })) });
}
