import { z } from "zod";
import { getSession } from "@/lib/auth";
import { assertSameOrigin, guarded, limit, readJson } from "@/lib/guard";
import { metaContext } from "@/lib/meta/context";
import { discoverIdentities, IdentityProblem, listIdentities, removeIdentity, saveIdentity } from "@/lib/meta/identities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const view = (r: Awaited<ReturnType<typeof listIdentities>>[number]) => ({
  id: r.id,
  scope: r.scope,
  adAccountId: r.adAccountId,
  proposalId: r.proposalId,
  beneficiary: { id: r.beneficiaryId, name: r.beneficiaryName },
  payer: { id: r.payerId, name: r.payerName },
  nameSource: r.nameSource,
  confirmedAt: r.confirmedAt,
});

/** The business's saved choices, and (with ?discover=1) the identities its ad account already uses. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const saved = (await listIdentities(session.workspace.id)).map(view);
  if (new URL(req.url).searchParams.get("discover") !== "1") return Response.json({ saved });
  await limit(`identities:${session.workspace.id}`, 20, 3600);
  const ctx = await metaContext(session.workspace.id).catch((e) => e as Error);
  if (ctx instanceof Error) return Response.json({ saved, discovery: { status: "error", error: ctx.message } });
  return Response.json({ saved, adAccountId: ctx.adAccountId, adAccountName: ctx.adAccountName, discovery: await discoverIdentities(ctx) });
}

const Who = z.object({ id: z.string().regex(/^\d{5,25}$/), name: z.string().max(120) });
const Save = z.object({
  scope: z.enum(["ad_account", "workspace", "proposal"]),
  proposalId: z.string().uuid().optional(),
  beneficiary: Who,
  payer: Who,
});

/** The client's choice: saved for this business only. */
export const POST = guarded(async (req: Request) => {
  assertSameOrigin(req);
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const body = await readJson(req, Save);
  await limit(`identities:${session.workspace.id}`, 20, 3600);
  try {
    const ctx = await metaContext(session.workspace.id);
    const row = await saveIdentity(ctx, { workspaceId: session.workspace.id, ...body });
    return Response.json({ ok: true, saved: view(row) });
  } catch (e) {
    if (e instanceof IdentityProblem) return Response.json({ ok: false, error: e.message }, { status: 400 });
    throw e;
  }
});

export const DELETE = guarded(async (req: Request) => {
  assertSameOrigin(req);
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  await removeIdentity(session.workspace.id, id);
  return Response.json({ ok: true });
});
