import { and, eq, inArray } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import type { Attachment } from "@/lib/db/schema";
import { appendMessage } from "@/lib/conversation";
import { createConversation, getConversation } from "@/lib/conversations";
import { activeTurn, enqueue, TurnInProgress } from "@/lib/jobs";

export const runtime = "nodejs";

/**
 * Starts a Mikee turn as a background job and returns its id right away. Without a conversation id a new
 * conversation is opened (filed at once by a quick guess, then by Mikee). The work continues even if the
 * client closes the tab or the server restarts; the screen follows it through /api/jobs/[id].
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { workspace } = session;
  const body = (await req.json().catch(() => ({}))) as { conversationId?: string; text?: string; attachments?: string[]; kickoff?: "scan" };

  try {
    if (body.kickoff === "scan") {
      if (workspace.stage !== "scanning") return new Response("Nothing to start", { status: 409 });
      const conv = await createConversation(workspace.id, { title: "היכרות עם העסק", category: "business" });
      const job = await enqueue(workspace.id, "turn", { conversationId: conv.id, kickoff: "scan" });
      return Response.json({ conversationId: conv.id, jobId: job.id });
    }

    const text = body.text?.trim() ?? "";
    const attachments = await loadAttachments(workspace.id, body.attachments ?? []);
    if (!text && !attachments.length) return new Response("Empty message", { status: 400 });
    if (workspace.stage === "connect") return new Response("Finish connecting first", { status: 409 });

    let conversationId = body.conversationId;
    if (conversationId) {
      if (!(await getConversation(workspace.id, conversationId))) return new Response("Conversation not found", { status: 404 });
      const running = await activeTurn(workspace.id, conversationId);
      if (running) return Response.json({ conversationId, jobId: running.id, alreadyRunning: true }, { status: 409 });
    } else {
      conversationId = (await createConversation(workspace.id, { firstText: text || attachments.map((a) => a.name).join(", ") })).id;
    }

    await appendMessage(workspace.id, conversationId, "user", "chat", text ? [{ type: "text", text: text.slice(0, 8000) }] : [{ type: "text", text: "(קבצים מצורפים)" }], attachments);
    const job = await enqueue(workspace.id, "turn", { conversationId });
    return Response.json({ conversationId, jobId: job.id });
  } catch (e) {
    if (e instanceof TurnInProgress) return Response.json({ conversationId: body.conversationId, jobId: e.jobId, alreadyRunning: true }, { status: 409 });
    throw e;
  }
}

async function loadAttachments(workspaceId: string, ids: string[]): Promise<Attachment[]> {
  if (!ids.length) return [];
  const d = await db();
  const rows = await d
    .select({ id: schema.media.id, name: schema.media.filename, type: schema.media.contentType, size: schema.media.size })
    .from(schema.media)
    .where(and(eq(schema.media.workspaceId, workspaceId), inArray(schema.media.id, ids.slice(0, 10))));
  const base = process.env.APP_URL?.replace(/\/$/, "") ?? "";
  return rows.map((r) => ({ id: r.id, name: r.name ?? "file", type: r.type, size: r.size, url: `${base}/api/media/${r.id}` }));
}
