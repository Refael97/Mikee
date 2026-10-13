import { db, schema } from "@/lib/db";
import { syncMetaSpendCap } from "@/lib/budget";
import { metaContext } from "@/lib/meta/context";
import { checkMetaHealth } from "@/lib/meta/health";
import { runProactive } from "@/lib/proactive";

export const runtime = "nodejs";

/**
 * Hourly maintenance and Mikee's own outreach. Call it every hour (a Railway cron service):
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/checkin
 * Verifies Meta access, re-syncs the hard spending limit (new month, outside changes), then lets Mikee
 * decide whether to reach out now (see src/lib/proactive.ts for the reasons and the limits).
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const d = await db();
  const workspaces = await d.select().from(schema.workspaces);
  const report: Record<string, unknown> = {};
  for (const ws of workspaces.filter((w) => w.stage !== "connect" && w.stage !== "scanning")) {
    const health = await checkMetaHealth(ws.id).catch((e) => ({ ok: false, problems: [(e as Error).message] }));
    if (health.ok) await syncMetaSpendCap(ws.id, ws.timezone, await metaContext(ws.id)).catch(() => undefined);
    const outreach = await runProactive(ws.id, ws.timezone).catch((e) => ({ skipped: (e as Error).message }));
    report[ws.id] = { health, outreach };
  }
  return Response.json(report);
}
