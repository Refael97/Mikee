import "server-only";
import { getConnection, markConnection, type MetaConfig } from "../connections";
import { Graph, type MetaError } from "./graph";

export type MetaContext = MetaConfig & { graph: Graph };

/** Resolves the connected Meta assets for a workspace, or explains what is missing. */
export class MetaDisconnected extends Error {}

export async function metaContext(workspaceId: string): Promise<MetaContext> {
  const conn = await getConnection<MetaConfig>(workspaceId, "meta");
  if (!conn?.secret) throw new MetaDisconnected("Facebook and Instagram are not connected yet. The client can connect them in Settings.");
  if (conn.status === "broken") {
    throw new MetaDisconnected(
      `Access to Facebook/Instagram was lost (${conn.statusReason ?? "unknown reason"}). Ask the client to reconnect in Settings; nothing can be read or changed until then.`,
    );
  }
  const onAccessLost = (err: MetaError) => markConnection(workspaceId, "meta", "broken", err.message);
  return { ...conn.config, graph: new Graph(conn.secret, onAccessLost) };
}

export function requireAdAccount(ctx: MetaContext): string {
  if (!ctx.adAccountId) throw new Error("No ad account selected. Ask the client to choose one in Settings.");
  return ctx.adAccountId;
}

/** Currencies Meta stores without minor units. */
const ZERO_DECIMAL = new Set(["JPY", "KRW", "CLP", "COP", "CRC", "HUF", "ISK", "IDR", "PYG", "TWD", "VND"]);

export function minorFactor(currency = "ILS"): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 1 : 100;
}

export const toMinor = (major: number, currency?: string) => Math.round(major * minorFactor(currency));
export const toMajor = (minor: number | string | undefined | null, currency?: string) =>
  minor == null || minor === "" ? 0 : Number(minor) / minorFactor(currency);

export function money(amount: number, currency = "ILS"): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency,
    maximumFractionDigits: amount >= 100 ? 0 : 2,
  }).format(amount);
}

/** Lists every asset the token can reach, for the onboarding picker. */
export async function discoverAssets(graph: Graph) {
  const [me, adAccounts, pages, businesses] = await Promise.all([
    graph.get<{ name: string; id: string }>("/me", { fields: "id,name" }),
    graph.all<{ id: string; name: string; currency: string; account_status: number }>("/me/adaccounts", {
      fields: "id,name,currency,account_status",
    }),
    graph.all<{ id: string; name: string; instagram_business_account?: { id: string; username?: string } }>(
      "/me/accounts",
      { fields: "id,name,instagram_business_account{id,username}" },
    ),
    graph
      .all<{ id: string; name: string; owned_product_catalogs?: { data: { id: string; name: string }[] } }>(
        "/me/businesses",
        { fields: "id,name,owned_product_catalogs{id,name}" },
      )
      .catch(() => []),
  ]);
  const catalogs = businesses.flatMap((b) => b.owned_product_catalogs?.data ?? []);
  return { me, adAccounts, pages, catalogs };
}

export async function listPixels(graph: Graph, adAccountId: string) {
  return graph.all<{ id: string; name: string }>(`/${adAccountId}/adspixels`, { fields: "id,name" }).catch(() => []);
}
