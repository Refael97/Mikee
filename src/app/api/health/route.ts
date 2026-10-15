import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { missingSettings } from "@/lib/setup";

export const dynamic = "force-dynamic";

/** Used by Railway's health check. Says which settings are missing (names only) and whether the database answers. */
export async function GET() {
  const missing = missingSettings();
  let database = false;
  try {
    await (await db()).execute(sql`select 1`);
    database = true;
  } catch {
    database = false;
  }
  const ok = database && !missing.some((k) => k !== "ANTHROPIC_API_KEY" && k !== "CRON_SECRET");
  return Response.json({ ok, database, missing, release: process.env.RAILWAY_GIT_COMMIT_SHA ?? null, capabilities: { instagramStories: true, instagramStoryTool: "propose_story", scheduledInstagramPublishing: true } }, { status: ok ? 200 : 503 });
}
