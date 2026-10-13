import { getSession } from "@/lib/auth";
import { appendMessage } from "@/lib/conversation";
import { activeTurn, enqueue, TurnInProgress } from "@/lib/jobs";

export const runtime = "nodejs";

/**
 * Starts a Mikee turn as a background job and returns its id right away. The work continues even if the
 * client closes the tab or the server restarts; the screen follows it through /api/jobs/[id].
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { workspace } = session;
  const body = (await req.json().catch(() => ({}))) as { text?: string; kickoff?: "scan" };

  const running = await activeTurn(workspace.id);
  if (running) return Response.json({ jobId: running.id, alreadyRunning: true }, { status: 409 });

  try {
    if (body.kickoff === "scan") {
      if (workspace.stage !== "scanning") return new Response("Nothing to start", { status: 409 });
      const job = await enqueue(workspace.id, "turn", { kickoff: "scan" });
      return Response.json({ jobId: job.id });
    }
    const text = body.text?.trim();
    if (!text) return new Response("Empty message", { status: 400 });
    if (workspace.stage === "connect") return new Response("Finish connecting first", { status: 409 });
    await appendMessage(workspace.id, "user", "chat", [{ type: "text", text: text.slice(0, 8000) }]);
    const job = await enqueue(workspace.id, "turn", {});
    return Response.json({ jobId: job.id });
  } catch (e) {
    if (e instanceof TurnInProgress) return Response.json({ jobId: e.jobId, alreadyRunning: true }, { status: 409 });
    throw e;
  }
}
