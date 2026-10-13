import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { syncMetaSpendCap } from "@/lib/budget";
import { enqueue, TurnInProgress } from "@/lib/jobs";
import { metaContext } from "@/lib/meta/context";
import { checkMetaHealth } from "@/lib/meta/health";

export const runtime = "nodejs";

/**
 * Scheduled maintenance + proactive check-in. Call on a schedule (e.g. a Railway cron service, twice a day):
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/checkin
 * Verifies Meta access, re-syncs the hard spending limit (new month, outside changes), then queues a
 * check-in where Mikee writes only if there is a real business reason.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const d = await db();
  const active = await d.select().from(schema.workspaces).where(eq(schema.workspaces.stage, "active"));
  const report: Record<string, unknown> = {};
  for (const ws of active) {
    const health = await checkMetaHealth(ws.id).catch((e) => ({ ok: false, problems: [(e as Error).message] }));
    if (health.ok) await syncMetaSpendCap(ws.id, ws.timezone, await metaContext(ws.id)).catch(() => undefined);
    try {
      const job = health.ok ? await enqueue(ws.id, "checkin") : null;
      report[ws.id] = { health, checkin: job?.id ?? "skipped (no Meta access)" };
    } catch (e) {
      report[ws.id] = { health, checkin: e instanceof TurnInProgress ? "busy" : (e as Error).message };
    }
  }
  return Response.json(report);
}
