import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { cardView } from "@/lib/conversation";
import { ApprovalRejected, approveProposal, declineProposal } from "@/lib/proposals";

export const runtime = "nodejs";

/** The client's decision on one exact version of a card. Execution runs in the background. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const { decision, version } = (await req.json().catch(() => ({}))) as { decision?: "approve" | "decline"; version?: string };
  try {
    if (decision === "approve") {
      if (!version) return Response.json({ ok: false, error: "חסרה גרסת הכרטיס" }, { status: 400 });
      return Response.json({ ok: true, ...(await approveProposal(session.workspace.id, id, version)) });
    }
    if (decision === "decline") {
      const p = await declineProposal(session.workspace.id, id);
      return Response.json({ ok: true, status: p.status });
    }
    return new Response("Unknown decision", { status: 400 });
  } catch (e) {
    if (e instanceof ApprovalRejected) return Response.json({ ok: false, error: e.message }, { status: 409 });
    throw e;
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
  return Response.json(cardView(p));
}
