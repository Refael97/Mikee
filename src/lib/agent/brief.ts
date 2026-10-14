import "server-only";
import { brainAsText, listFacts } from "../brain";
import { getConnection, type MetaConfig, type StoreConfig, type WebsiteConfig } from "../connections";
import { openAndRecent } from "../proposals";
import { journeyAsText } from "../journey";

/**
 * The business brief every agent on the team receives: today, what is connected, what is waiting for
 * the client, and the brain (each line with its source and date).
 */
export async function businessBrief(workspaceId: string, tz: string): Promise<string> {
  const [facts, meta, site, store, cards, journey] = await Promise.all([
    listFacts(workspaceId),
    getConnection<MetaConfig>(workspaceId, "meta"),
    getConnection<WebsiteConfig>(workspaceId, "website"),
    getConnection<StoreConfig>(workspaceId, "store"),
    openAndRecent(workspaceId),
    journeyAsText(workspaceId),
  ]);
  const m = meta?.config;
  const today = new Intl.DateTimeFormat("he-IL", { timeZone: tz, dateStyle: "full", timeStyle: "short" }).format(new Date());
  const connections = [
    meta?.status === "broken" ? `!! Facebook/Instagram access is LOST: ${meta.statusReason}. Nothing on Meta can be read or changed until the client reconnects.` : "",
    m?.adAccountId ? `Ad account: ${m.adAccountName ?? ""} (${m.adAccountId}), currency ${m.currency ?? "ILS"}` : "Ad account: not connected",
    m?.pageId ? `Facebook page: ${m.pageName ?? ""} (${m.pageId})` : "Facebook page: not connected",
    m?.igUserId ? `Instagram: @${m.igUsername ?? ""} (${m.igUserId})` : "Instagram: not connected",
    m?.pixelId ? `Website pixel: ${m.pixelId}` : "Website pixel: none",
    m?.catalogId ? `Product catalog: ${m.catalogId}` : "Product catalog: none",
    site?.config.url ? `Website: ${site.config.url} (${site.config.platform ?? "unknown platform"})` : "Website: not connected",
    store?.config.domain ? `Store orders: ${store.config.platform} connected` : "Store orders: not connected",
  ]
    .filter(Boolean)
    .join("\n");
  const by = (agent: string | null) => (agent && agent !== "mikee" ? `, made by ${agent}` : "");
  const open = cards.filter((c) => c.status === "pending");
  const recent = cards.filter((c) => c.status !== "pending").slice(0, 12);
  const cardLines = [
    open.length ? "Waiting for the client (do not suggest these again; refer to them):" : "No cards are waiting for the client.",
    ...open.map((c) => `- [${c.kind}] "${c.card.title}" id ${c.id}, since ${c.createdAt.toISOString().slice(0, 16)}${by(c.agent)}`),
    ...(recent.length ? ["Recently decided:", ...recent.map((c) => `- [${c.kind}] "${c.card.title}": ${c.status} ${c.decidedAt?.toISOString().slice(0, 10) ?? ""}${by(c.agent)}`)] : []),
  ].join("\n");
  return `# Now\n${today} (${tz})\n\n# Connections (internal; never show ids to the client)\n${connections}\n\n# Cards\n${cardLines}\n\n# Where the business stands on its marketing path\n${journey}\n\n# What we know about the business\n${brainAsText(facts)}`;
}
