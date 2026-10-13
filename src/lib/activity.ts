import "server-only";
import { db, schema } from "./db";

export async function logActivity(
  workspaceId: string,
  kind: string,
  summary: string,
  detail?: Record<string, unknown>,
  ok = true,
) {
  const d = await db();
  await d.insert(schema.activity).values({ workspaceId, kind, summary, detail, ok });
}
