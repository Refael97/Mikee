import { z } from "zod";
import { getSession } from "@/lib/auth";
import { assertSameOrigin, cleanClientText, guarded, readJson } from "@/lib/guard";
import { updateLibraryItem } from "@/lib/library";
import { deleteMedia } from "@/lib/media";

const Patch = z.object({ folder: z.string().max(60).nullable().optional(), name: z.string().max(120).optional(), description: z.string().max(400).optional() });
const valid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

export const PATCH = guarded(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!valid(id)) return new Response("Not found", { status: 404 });
  const body = await readJson(req, Patch);
  await updateLibraryItem(session.workspace.id, id, {
    folder: body.folder === undefined ? undefined : body.folder ? cleanClientText(body.folder, 60) : null,
    name: body.name ? cleanClientText(body.name, 120) : undefined,
    description: body.description !== undefined ? cleanClientText(body.description, 400) : undefined,
  });
  return Response.json({ ok: true });
});

export const DELETE = guarded(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!valid(id)) return new Response("Not found", { status: 404 });
  return Response.json({ ok: await deleteMedia(session.workspace.id, id) });
});
