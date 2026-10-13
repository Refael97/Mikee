import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { approveProposal, declineProposal } from "@/lib/proposals";

export const runtime = "nodejs";
export const maxDuration = 300;

/** The client's one-tap decision on a card. Approval executes on the server, never in the model. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const { decision } = (await req.json().catch(() => ({}))) as { decision?: "approve" | "decline" };
  try {
    if (decision === "approve") {
      return Response.json(await approveProposal(session.workspace.id, session.workspace.timezone, id));
    }
    if (decision === "decline") {
      await declineProposal(session.workspace.id, id);
      return Response.json({ ok: true });
    }
    return new Response("Unknown decision", { status: 400 });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 409 });
  }
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const d = await db();
  const p = await d.query.proposals.findFirst({
    where: and(eq(schema.proposals.id, id), eq(schema.proposals.workspaceId, session.workspace.id)),
  });
  if (!p) return new Response("Not found", { status: 404 });
  return Response.json({ id: p.id, status: p.status, card: p.card });
}
