import { getSession } from "@/lib/auth";
import { hit } from "@/lib/guard";
import { connectedAssets, fillAssetNames } from "@/lib/meta/assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The connected assets for the account menu; names missing from older connections are read once from Meta. */
export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const ws = session.workspace.id;
  if ((await hit(`assets:${ws}`, 20, 3600)).ok) await fillAssetNames(ws).catch(() => undefined);
  return Response.json(await connectedAssets(ws, session.workspace.name));
}
