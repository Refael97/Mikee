import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { acquire, release, runMikee } from "@/lib/agent/run";
import { CHECKIN_KICKOFF } from "@/lib/agent/prompt";

export const runtime = "nodejs";
export const maxDuration = 800;

/**
 * Proactive check-in. Call on a schedule (e.g. a Railway cron service, twice a day):
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/checkin
 * Mikee reviews the business and writes only when there is a real reason.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const d = await db();
  const active = await d.select().from(schema.workspaces).where(eq(schema.workspaces.stage, "active"));
  const report: Record<string, string> = {};
  for (const ws of active) {
    if (!(await acquire(ws.id, 15))) {
      report[ws.id] = "busy";
      continue;
    }
    try {
      const text = await runMikee({
        workspaceId: ws.id,
        input: { kind: "kickoff", text: CHECKIN_KICKOFF },
        discardIf: (t) => t.trim() === "NOTHING",
      });
      report[ws.id] = text.trim() === "NOTHING" ? "nothing to say" : "wrote to the client";
    } catch (e) {
      report[ws.id] = `error: ${(e as Error).message}`;
    } finally {
      await release(ws.id);
    }
  }
  return Response.json(report);
}
