import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { cardView } from "@/lib/conversation";
import { ApprovalRejected, approveProposal, declineProposal } from "@/lib/proposals";
import { assertSameOrigin, guarded, limit, LIMITS, readJson } from "@/lib/guard";
import { z } from "zod";

const Decision = z.object({ decision: z.enum(["approve", "decline"]), version: z.string().max(128).optional() });

export const runtime = "nodejs";

/** The client's decision on one exact version of a card. Execution runs in the background. */
export const POST = guarded(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const { decision, version } = await readJson(req, Decision);
  await limit(`approve:${session.workspace.id}`, LIMITS.approvalsPerMinute, 60);
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
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const d = await db();
  const p = await d.query.proposals.findFirst({
    where: and(eq(schema.proposals.id, id), eq(schema.proposals.workspaceId, session.workspace.id)),
  });
  if (!p) return new Response("Not found", { status: 404 });
  return Response.json(cardView(p));
}
