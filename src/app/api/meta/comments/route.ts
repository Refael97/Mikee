import { z } from "zod";
import { getSession } from "@/lib/auth";
import { assertSameOrigin, guarded, limit, readJson } from "@/lib/guard";
import { actOnComment, listComments } from "@/lib/meta/comments";
import { MetaDisconnected } from "@/lib/meta/context";
import { MetaError } from "@/lib/meta/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The comments on the business's latest Facebook and Instagram posts. */
export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  try {
    return Response.json({ posts: await listComments(session.workspace.id) });
  } catch (e) {
    if (e instanceof MetaDisconnected) return Response.json({ posts: [], disconnected: true });
    throw e;
  }
}

const Id = z.string().regex(/^[0-9_]{5,80}$/);
const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reply"), id: Id, text: z.string().trim().min(1).max(1000) }),
  z.object({ action: z.literal("hide"), id: Id, hidden: z.boolean() }),
  z.object({ action: z.literal("like"), id: Id, liked: z.boolean() }),
  z.object({ action: z.literal("delete"), id: Id }),
  z.object({ action: z.literal("delete_post"), id: Id }),
]);

/** The owner's own action on a comment (reply, hide, like, delete) or deleting an Instagram post: clicking it is the approval. */
export const POST = guarded(async (req: Request) => {
  assertSameOrigin(req);
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const ws = session.workspace.id;
  const body = await readJson(req, Action);
  await limit(`comments:${ws}`, 120, 3600);
  try {
    await actOnComment(ws, body);
    return Response.json({ ok: true, posts: await listComments(ws) });
  } catch (e) {
    const msg = e instanceof MetaError ? e.message : (e as Error).message;
    console.warn("[comments]", body.action, msg);
    return Response.json({ ok: false, error: "מטא לא אישרה את הפעולה. נסי שוב בעוד רגע." }, { status: 400 });
  }
});
