import "server-only";
import { getConnection, type StoreConfig } from "./connections";
import type { ProductSummary } from "./website";
import { safeFetch } from "./net";

/** Store APIs are called through the network guard, with JSON capped at 20MB and pagination pinned to the store's host. */
async function storeJson(url: string, headers: Record<string, string>, host?: string) {
  const res = await safeFetch(url, { headers, maxBytes: 20 * 1024 * 1024, timeoutMs: 30_000, sameHost: true });
  if (host && new URL(res.url).hostname !== host) throw new Error("The store redirected to another site");
  return { ok: res.ok, status: res.status, headers: res.headers, json: async () => JSON.parse(await res.text()) };
}

/** A Shopify store is always reached through its myshopify.com address. */
export function shopifyDomain(raw: string): string {
  const d = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(d)) throw new Error("כתובת חנות Shopify צריכה להיות בצורה name.myshopify.com");
  return d;
}

const SHOPIFY_API = "2025-07";

type Order = { date: string; total: number; currency: string; customer?: string; items: { name: string; qty: number; total: number }[] };

async function shopifyOrders(domain: string, token: string, sinceIso: string): Promise<Order[]> {
  const out: Order[] = [];
  let url: string | null =
    `https://${domain}/admin/api/${SHOPIFY_API}/orders.json?status=any&limit=250&created_at_min=${encodeURIComponent(sinceIso)}` +
    `&fields=created_at,total_price,currency,customer,line_items,financial_status,cancelled_at`;
  while (url && out.length < 5000) {
    const res = await storeJson(url, { "X-Shopify-Access-Token": token }, shopifyDomain(domain));
    if (!res.ok) throw new Error(`Shopify orders: HTTP ${res.status}`);
    const { orders } = (await res.json()) as { orders: any[] };
    for (const o of orders) {
      if (o.cancelled_at) continue;
      out.push({
        date: o.created_at,
        total: Number(o.total_price),
        currency: o.currency,
        customer: o.customer?.id ? String(o.customer.id) : undefined,
        items: (o.line_items ?? []).map((l: any) => ({ name: l.title, qty: l.quantity, total: Number(l.price) * l.quantity })),
      });
    }
    const link = res.headers.get("link") ?? "";
    const next = /<([^>]+)>;\s*rel="next"/.exec(link)?.[1] ?? null;
    // Pagination must stay on the same store.
    url = next && new URL(next).hostname === shopifyDomain(domain) ? next : null;
  }
  return out;
}

async function wooOrders(site: string, key: string, secret: string, sinceIso: string): Promise<Order[]> {
  const out: Order[] = [];
  const auth = "Basic " + Buffer.from(`${key}:${secret}`).toString("base64");
  for (let page = 1; page <= 50; page++) {
    const res = await storeJson(`${site.replace(/\/$/, "")}/wp-json/wc/v3/orders?per_page=100&page=${page}&after=${encodeURIComponent(sinceIso)}`, { Authorization: auth });
    if (!res.ok) throw new Error(`WooCommerce orders: HTTP ${res.status}`);
    const orders = (await res.json()) as any[];
    for (const o of orders) {
      if (["cancelled", "refunded", "failed"].includes(o.status)) continue;
      out.push({
        date: o.date_created_gmt ?? o.date_created,
        total: Number(o.total),
        currency: o.currency,
        customer: o.customer_id ? String(o.customer_id) : o.billing?.email,
        items: (o.line_items ?? []).map((l: any) => ({ name: l.name, qty: l.quantity, total: Number(l.total) })),
      });
    }
    if (orders.length < 100) break;
  }
  return out;
}

/** Sales story for the last N days: totals, monthly trend, best sellers, returning customers. */
export async function salesSummary(workspaceId: string, days = 180) {
  const conn = await getConnection<StoreConfig>(workspaceId, "store");
  if (!conn?.secret || !conn.config.domain || !conn.config.platform) {
    return { connected: false as const, note: "The online store's order data is not connected yet (Settings → החנות)." };
  }
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const orders =
    conn.config.platform === "shopify"
      ? await shopifyOrders(conn.config.domain, conn.secret, since)
      : await wooOrders(conn.config.domain, conn.config.consumerKey ?? "", conn.secret, since);

  const revenue = orders.reduce((s, o) => s + o.total, 0);
  const byMonth: Record<string, { orders: number; revenue: number }> = {};
  const byProduct: Record<string, { qty: number; revenue: number }> = {};
  const customers: Record<string, number> = {};
  for (const o of orders) {
    const m = o.date.slice(0, 7);
    byMonth[m] ??= { orders: 0, revenue: 0 };
    byMonth[m].orders++;
    byMonth[m].revenue += o.total;
    if (o.customer) customers[o.customer] = (customers[o.customer] ?? 0) + 1;
    for (const i of o.items) {
      byProduct[i.name] ??= { qty: 0, revenue: 0 };
      byProduct[i.name].qty += i.qty;
      byProduct[i.name].revenue += i.total;
    }
  }
  const buyers = Object.values(customers);
  return {
    connected: true as const,
    periodDays: days,
    currency: orders[0]?.currency,
    orders: orders.length,
    revenue: Math.round(revenue),
    averageOrder: orders.length ? Math.round(revenue / orders.length) : 0,
    returningCustomerShare: buyers.length ? Math.round((buyers.filter((n) => n > 1).length / buyers.length) * 100) : null,
    byMonth,
    bestSellers: Object.entries(byProduct)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 15)
      .map(([name, v]) => ({ name, ...v, revenue: Math.round(v.revenue) })),
  };
}

/** Stock levels from the admin API when connected (exact counts), for "almost sold out" signals. */
export async function inventory(workspaceId: string): Promise<ProductSummary[] | null> {
  const conn = await getConnection<StoreConfig>(workspaceId, "store");
  if (!conn?.secret || !conn.config.domain) return null;
  if (conn.config.platform === "shopify") {
    const res = await storeJson(
      `https://${shopifyDomain(conn.config.domain)}/admin/api/${SHOPIFY_API}/products.json?limit=250&status=active&fields=title,handle,variants,images,product_type`,
      { "X-Shopify-Access-Token": conn.secret },
    );
    if (!res.ok) throw new Error(`Shopify products: HTTP ${res.status}`);
    const { products } = (await res.json()) as { products: any[] };
    return products.map((p) => {
      const stock = p.variants?.reduce((s: number, v: any) => s + Math.max(0, v.inventory_quantity ?? 0), 0);
      return { name: p.title, price: p.variants?.[0]?.price, image: p.images?.[0]?.src, stockLeft: stock, inStock: stock > 0, category: p.product_type };
    });
  }
  const auth = "Basic " + Buffer.from(`${conn.config.consumerKey}:${conn.secret}`).toString("base64");
  const res = await storeJson(`${conn.config.domain.replace(/\/$/, "")}/wp-json/wc/v3/products?per_page=100&status=publish`, { Authorization: auth });
  if (!res.ok) throw new Error(`WooCommerce products: HTTP ${res.status}`);
  const products = (await res.json()) as any[];
  return products.map((p) => ({
    name: p.name,
    url: p.permalink,
    price: p.price,
    image: p.images?.[0]?.src,
    inStock: p.stock_status === "instock",
    stockLeft: p.manage_stock ? p.stock_quantity : null,
    category: p.categories?.[0]?.name,
  }));
}
