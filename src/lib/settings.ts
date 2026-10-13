import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { DEFAULT_SETTINGS, type WorkspaceSettings } from "./db/schema";

export async function getSettings(workspaceId: string) {
  const d = await db();
  const ws = await d.query.workspaces.findFirst({ where: eq(schema.workspaces.id, workspaceId) });
  return { ...DEFAULT_SETTINGS, ...(ws?.settings ?? {}) };
}

export async function updateSettings(workspaceId: string, patch: Partial<WorkspaceSettings>) {
  const d = await db();
  const current = await getSettings(workspaceId);
  await d.update(schema.workspaces).set({ settings: { ...current, ...patch } }).where(eq(schema.workspaces.id, workspaceId));
}
