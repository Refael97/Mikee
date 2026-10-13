import { getSession } from "@/lib/auth";
import { acquire, type AgentEvent, release, runMikee } from "@/lib/agent/run";
import { SCAN_KICKOFF } from "@/lib/agent/prompt";

export const runtime = "nodejs";
export const maxDuration = 800;

/** Streams one Mikee turn as newline-delimited JSON events. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { workspace } = session;
  const body = (await req.json().catch(() => ({}))) as { text?: string; kickoff?: "scan" };

  let input: { kind: "chat" | "kickoff"; text: string };
  if (body.kickoff === "scan") {
    if (workspace.stage !== "scanning") return new Response("Nothing to start", { status: 409 });
    input = { kind: "kickoff", text: SCAN_KICKOFF };
  } else {
    const text = body.text?.trim();
    if (!text) return new Response("Empty message", { status: 400 });
    if (workspace.stage === "connect") return new Response("Finish connecting first", { status: 409 });
    input = { kind: "chat", text: text.slice(0, 8000) };
  }

  if (!(await acquire(workspace.id, 15))) {
    return Response.json({ error: "מייקי באמצע משהו, עוד רגע הוא איתך." }, { status: 429 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          // client went away; the turn still finishes and is saved
        }
      };
      try {
        await runMikee({ workspaceId: workspace.id, input, emit });
      } finally {
        await release(workspace.id);
        try {
          controller.close();
        } catch {}
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
