import { z } from "zod";
import { getSession } from "@/lib/auth";
import { assertSameOrigin, guarded, limit, readJson } from "@/lib/guard";
import { createEvent, eventDetails, listEvents } from "@/lib/meta/events";
import { MetaDisconnected } from "@/lib/meta/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The Instagram account's upcoming events, or one event's details (?id=). */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  try {
    if (id) {
      if (!/^\d{5,40}$/.test(id)) return new Response("Bad request", { status: 400 });
      return Response.json({ event: await eventDetails(session.workspace.id, id) });
    }
    return Response.json({ events: await listEvents(session.workspace.id) });
  } catch (e) {
    if (e instanceof MetaDisconnected) return Response.json({ events: [], disconnected: true });
    console.warn("[events]", (e as Error).message);
    return Response.json({ events: [], error: "מטא לא החזירה את האירועים כרגע." });
  }
}

const Create = z.object({
  title: z.string().trim().min(1).max(100),
  startTime: z.string().datetime({ offset: true }),
  endTime: z.string().datetime({ offset: true }).optional(),
});

/** The owner creates an event herself: clicking "create" is the approval. */
export const POST = guarded(async (req: Request) => {
  assertSameOrigin(req);
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const body = await readJson(req, Create);
  if (new Date(body.startTime).getTime() < Date.now()) return Response.json({ ok: false, error: "מועד האירוע כבר עבר." }, { status: 400 });
  await limit(`events:${session.workspace.id}`, 20, 3600);
  try {
    const id = await createEvent(session.workspace.id, body);
    return Response.json({ ok: true, id, events: await listEvents(session.workspace.id) });
  } catch (e) {
    console.warn("[events] create", (e as Error).message);
    return Response.json({ ok: false, error: "מטא לא יצרה את האירוע. נסי שוב בעוד רגע." }, { status: 400 });
  }
});
