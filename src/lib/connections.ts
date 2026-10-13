import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { decrypt, encrypt } from "./crypto";

export type Provider = "meta" | "website" | "store" | "google_drive";

export type MetaConfig = {
  userName?: string;
  adAccountId?: string; // "act_123"
  adAccountName?: string;
  currency?: string;
  pageId?: string;
  pageName?: string;
  igUserId?: string;
  igUsername?: string;
  pixelId?: string;
  catalogId?: string;
  tokenExpiresAt?: string | null;
};

export type WebsiteConfig = { url?: string; platform?: "shopify" | "woocommerce" | "other" };

export type StoreConfig = {
  platform?: "shopify" | "woocommerce";
  domain?: string; // shop.myshopify.com or https://site.co.il
  consumerKey?: string; // WooCommerce only (the secret holds the consumer secret / Shopify admin token)
};

export async function getConnection<T = Record<string, unknown>>(
  workspaceId: string,
  provider: Provider,
): Promise<{ config: T; secret: string | null; status: string; statusReason: string | null; checkedAt: Date | null } | null> {
  const d = await db();
  const row = await d.query.connections.findFirst({
    where: and(
      eq(schema.connections.workspaceId, workspaceId),
      eq(schema.connections.provider, provider),
    ),
  });
  if (!row) return null;
  return {
    config: row.config as T,
    secret: row.secret ? decrypt(row.secret) : null,
    status: row.status,
    statusReason: row.statusReason,
    checkedAt: row.checkedAt,
  };
}

/** Merges config; replaces the secret only when one is given. */
export async function saveConnection(
  workspaceId: string,
  provider: Provider,
  config: Record<string, unknown>,
  secret?: string | null,
) {
  const d = await db();
  const existing = await getConnection(workspaceId, provider);
  const merged = { ...(existing?.config ?? {}), ...config };
  const sealed = secret === undefined ? undefined : secret === null ? null : encrypt(secret);
  await d
    .insert(schema.connections)
    .values({ workspaceId, provider, config: merged, secret: sealed ?? null })
    .onConflictDoUpdate({
      target: [schema.connections.workspaceId, schema.connections.provider],
      set: {
        config: merged,
        ...(sealed !== undefined ? { secret: sealed, status: "ok", statusReason: null } : {}),
        updatedAt: sql`now()`,
      },
    });
}

export async function removeConnection(workspaceId: string, provider: Provider) {
  const d = await db();
  await d
    .delete(schema.connections)
    .where(and(eq(schema.connections.workspaceId, workspaceId), eq(schema.connections.provider, provider)));
}

/** Records whether a connection still works, so the UI can ask the client to reconnect. */
export async function markConnection(workspaceId: string, provider: Provider, status: "ok" | "broken", reason?: string) {
  const d = await db();
  await d
    .update(schema.connections)
    .set({ status, statusReason: reason ?? null, checkedAt: new Date() })
    .where(and(eq(schema.connections.workspaceId, workspaceId), eq(schema.connections.provider, provider)));
}
