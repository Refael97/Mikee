import "server-only";
import * as cheerio from "cheerio";
import { type SafeResponse, safeFetch } from "./net";

const UA = "Mozilla/5.0 (compatible; MikeeBot/1.0; +https://mikee.ai)";

/** Pages are fetched through the network guard: public web only, 3MB per page, 12 seconds. */
async function get(url: string, timeoutMs = 12000): Promise<SafeResponse | null> {
  try {
    return await safeFetch(url, { headers: { "User-Agent": UA }, timeoutMs, maxBytes: 3 * 1024 * 1024 });
  } catch {
    return null;
  }
}

export type PageSummary = { url: string; title: string; description?: string; headings: string[]; text: string };

function summarize(url: string, html: string): PageSummary {
  const $ = cheerio.load(html);
  $("script,style,noscript,svg,iframe,nav,footer").remove();
  const headings = $("h1,h2,h3")
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get()
    .filter(Boolean)
    .slice(0, 15);
  const text = ($("main").text() || $("body").text()).replace(/\s+/g, " ").trim().slice(0, 2500);
  return {
    url,
    title: $("title").first().text().trim(),
    description: $('meta[name="description"]').attr("content") ?? $('meta[property="og:description"]').attr("content"),
    headings,
    text,
  };
}

function detectPlatform(html: string): "shopify" | "woocommerce" | "other" {
  if (/cdn\.shopify\.com|Shopify\.theme/i.test(html)) return "shopify";
  if (/woocommerce|wp-content\/plugins\/woocommerce/i.test(html)) return "woocommerce";
  return "other";
}

async function sitemapUrls(origin: string): Promise<string[]> {
  const robots = await get(`${origin}/robots.txt`);
  const fromRobots = robots?.ok ? [...(await robots.text()).matchAll(/^sitemap:\s*(\S+)/gim)].map((m) => m[1]).filter((u) => sameSite(u, origin)) : [];
  const queue = fromRobots.length ? fromRobots : [`${origin}/sitemap.xml`];
  const urls: string[] = [];
  for (let i = 0; i < queue.length && i < 8 && urls.length < 2000; i++) {
    const res = await get(queue[i]);
    if (!res?.ok) continue;
    const xml = await res.text();
    // A sitemap may only point inside the same site.
    const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]).filter((u) => sameSite(u, origin));
    if (/<sitemapindex/i.test(xml)) queue.push(...locs);
    else urls.push(...locs);
  }
  return urls;
}

function sameSite(u: string, origin: string) {
  try {
    return new URL(u).host.replace(/^www\./, "") === new URL(origin).host.replace(/^www\./, "");
  } catch {
    return false;
  }
}

const PRIORITY = /about|odot|אודות|story|collections?|products?|shop|services?|שירות|contact|צור-קשר|faq|שאלות|pricing|מחיר|blog/i;

/** Reads the site the way a new marketer would: home page, key pages, and the product list if it is a store. */
export async function scanWebsite(rawUrl: string, maxPages = 15) {
  const url = /^https?:\/\//.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  const home = await get(url);
  if (!home?.ok) throw new Error(`Could not open ${url}`);
  const html = await home.text();
  const origin = new URL(home.url || url).origin;
  const platform = detectPlatform(html);

  const $ = cheerio.load(html);
  const links = $("a[href]")
    .map((_, el) => {
      try {
        return new URL($(el).attr("href")!, origin).toString().split("#")[0];
      } catch {
        return null;
      }
    })
    .get()
    .filter((u): u is string => !!u && u.startsWith(origin));
  const candidates = [...new Set([...(await sitemapUrls(origin)), ...links])].filter((u) => u !== origin && u !== `${origin}/`);
  candidates.sort((a, b) => Number(PRIORITY.test(b)) - Number(PRIORITY.test(a)));

  const pages: PageSummary[] = [summarize(origin, html)];
  for (let i = 0; i < candidates.length && pages.length < maxPages; i += 4) {
    const batch = await Promise.all(candidates.slice(i, i + 4).map(async (u) => {
      const r = await get(u);
      const type = r?.headers.get("content-type") ?? "";
      return r?.ok && type.includes("html") ? summarize(u, await r.text()) : null;
    }));
    pages.push(...(batch.filter(Boolean) as PageSummary[]).slice(0, maxPages - pages.length));
  }

  const products = await publicProducts(origin, platform).catch(() => []);
  return { origin, platform, pages, products, totalPagesFound: candidates.length + 1 };
}

export type ProductSummary = {
  name: string;
  url?: string;
  price?: string;
  image?: string;
  inStock?: boolean;
  stockLeft?: number | null;
  category?: string;
};

/** Store catalogs that are public without credentials (Shopify products.json, WooCommerce Store API). */
export async function publicProducts(origin: string, platform: string, limit = 250): Promise<ProductSummary[]> {
  if (platform === "shopify") {
    const r = await get(`${origin}/products.json?limit=${Math.min(limit, 250)}`);
    if (!r?.ok) return [];
    const { products } = (await r.json()) as { products: any[] };
    return products.map((p) => ({
      name: p.title,
      url: `${origin}/products/${p.handle}`,
      price: p.variants?.[0]?.price,
      image: p.images?.[0]?.src,
      inStock: p.variants?.some((v: any) => v.available),
      category: p.product_type || undefined,
    }));
  }
  if (platform === "woocommerce") {
    const r = await get(`${origin}/wp-json/wc/store/v1/products?per_page=${Math.min(limit, 100)}`);
    if (!r?.ok) return [];
    const products = (await r.json()) as any[];
    return products.map((p) => ({
      name: p.name,
      url: p.permalink,
      price: p.prices?.price ? (Number(p.prices.price) / 10 ** (p.prices.currency_minor_unit ?? 2)).toString() : undefined,
      image: p.images?.[0]?.src,
      inStock: p.is_in_stock,
      stockLeft: p.low_stock_remaining ?? null,
      category: p.categories?.[0]?.name,
    }));
  }
  return [];
}
