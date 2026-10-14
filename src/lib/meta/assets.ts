import "server-only";
import { getConnection, saveConnection, type MetaConfig, type WebsiteConfig } from "../connections";
import { Graph } from "./graph";

/** What is connected to this business, for the account menu at the top of every page. Ids only, never tokens. */
export type ConnectedAssets = {
  meta: {
    connected: boolean;
    status: "ok" | "broken";
    statusReason?: string;
    account: string | null;
    person?: string;
    business?: string;
    adAccount?: { id: string; name?: string; currency?: string };
    page?: { id: string; name?: string };
    instagram?: { id: string; username?: string };
    pixel?: { id: string; name?: string };
    catalog?: { id: string; name?: string };
  };
  website?: string;
  drive: boolean;
};

export async function connectedAssets(workspaceId: string, businessFallback: string): Promise<ConnectedAssets> {
  const [meta, site, drive] = await Promise.all([
    getConnection<MetaConfig>(workspaceId, "meta"),
    getConnection<WebsiteConfig>(workspaceId, "website"),
    getConnection(workspaceId, "google_drive"),
  ]);
  const c = meta?.config ?? {};
  return {
    meta: {
      connected: !!meta?.secret,
      status: meta?.status === "broken" ? "broken" : "ok",
      statusReason: meta?.status === "broken" ? (meta.statusReason ?? undefined) : undefined,
      account: c.businessName ?? c.adAccountName ?? c.pageName ?? (meta?.secret ? businessFallback : null),
      person: c.userName,
      business: c.businessName,
      adAccount: c.adAccountId ? { id: c.adAccountId, name: c.adAccountName, currency: c.currency } : undefined,
      page: c.pageId ? { id: c.pageId, name: c.pageName } : undefined,
      instagram: c.igUserId ? { id: c.igUserId, username: c.igUsername } : undefined,
      pixel: c.pixelId ? { id: c.pixelId, name: c.pixelName } : undefined,
      catalog: c.catalogId ? { id: c.catalogId, name: c.catalogName } : undefined,
    },
    website: site?.config.url,
    drive: !!drive?.secret && drive.status !== "broken",
  };
}

/**
 * Fills in names saved before they were kept (the business portfolio, pixel and catalog), reading them
 * once from Meta with this business's own token. Each one that cannot be read simply stays an id.
 */
export async function fillAssetNames(workspaceId: string): Promise<void> {
  const meta = await getConnection<MetaConfig>(workspaceId, "meta");
  if (!meta?.secret || meta.status === "broken") return;
  const c = meta.config;
  const graph = new Graph(meta.secret, undefined, c.tokenType === "SYSTEM_USER" ? "system_user" : "user");
  const name = <T extends { name?: string }>(p: Promise<T>) => p.then((x) => x.name).catch(() => undefined);
  const [business, pixel, catalog] = await Promise.all([
    !c.businessName && c.adAccountId
      ? graph.get<{ business?: { name?: string } }>(`/${c.adAccountId}`, { fields: "business{name}" }).then((x) => x.business?.name).catch(() => undefined)
      : undefined,
    !c.pixelName && c.pixelId ? name(graph.get(`/${c.pixelId}`, { fields: "name" })) : undefined,
    !c.catalogName && c.catalogId ? name(graph.get(`/${c.catalogId}`, { fields: "name" })) : undefined,
  ]);
  const patch: Partial<MetaConfig> = {};
  if (business) patch.businessName = business;
  if (pixel) patch.pixelName = pixel;
  if (catalog) patch.catalogName = catalog;
  if (Object.keys(patch).length) await saveConnection(workspaceId, "meta", patch);
}
