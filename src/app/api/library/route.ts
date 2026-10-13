import { getSession } from "@/lib/auth";
import { guarded } from "@/lib/guard";
import { listLibrary } from "@/lib/library";
import { storageUsage } from "@/lib/media";

export const GET = guarded(async (req: Request) => {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const p = new URL(req.url).searchParams;
  const kind = p.get("kind");
  const items = await listLibrary(session.workspace.id, {
    kind: kind === "image" || kind === "video" ? kind : undefined,
    q: p.get("q") ?? undefined,
    folder: p.get("folder") ?? undefined,
    before: p.get("before") && !Number.isNaN(Date.parse(p.get("before")!)) ? p.get("before")! : undefined,
  });
  const usage = await storageUsage(session.workspace.id);
  return Response.json({ items, usage: { used: usage.used, limit: usage.limit } });
});
