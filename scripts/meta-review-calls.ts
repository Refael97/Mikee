/**
 * App Review asks for at least one successful API call per permission in the last 30 days ("make the required
 * test API calls"). This makes one read per permission Mikee requests, with the stored token of a business
 * that works (one with a role on the app, e.g. Adrat), and prints which succeeded. Read only: nothing is
 * published, changed or spent. The token itself is never printed.
 * Usage (Railway shell of the Mikee service): npm run meta-review-calls -- אדרט
 */
import { db, schema } from "../src/lib/db";
import { getConnection, type MetaConfig } from "../src/lib/connections";
import { Graph } from "../src/lib/meta/graph";

async function main() {
  const filter = (process.argv[2] ?? "").trim();
  if (!filter) return console.log('Name the business whose connection works: npm run meta-review-calls -- "אדרט"');
  const d = await db();
  const rows = await d.select({ id: schema.workspaces.id, name: schema.workspaces.name }).from(schema.workspaces);
  // The name may be the Mikee business, or the Page, ad account or Meta business it is connected to.
  const all = await Promise.all(rows.map(async (r) => ({ ...r, meta: await getConnection<MetaConfig>(r.id, "meta").catch(() => null) })));
  const names = (x: (typeof all)[number]) => [x.name, x.meta?.config.pageName, x.meta?.config.adAccountName, x.meta?.config.businessName, x.meta?.config.igUsername];
  const w = all.find((x) => x.meta?.secret && names(x).some((n) => n?.includes(filter)));
  if (!w) {
    console.log(`No connected business named like "${filter}". The businesses in Mikee:`);
    for (const x of all) {
      const c = x.meta?.config;
      console.log(`  ${x.name}: ${x.meta?.secret ? `connected (page ${c?.pageName ?? "none"}, ad account ${c?.adAccountName ?? "none"})` : "no Facebook connection"}`);
    }
    return;
  }
  const meta = w.meta!;
  const c = meta.config;
  const g = new Graph(meta.secret!);
  const page = c.pageId ? await g.forPage(c.pageId).catch(() => g) : g;
  console.log(`=== ${w.name} (ad account ${c.adAccountId ?? "none"}, page ${c.pageId ?? "none"}, Instagram ${c.igUserId ?? "none"})\n`);

  let formId: string | undefined;
  const calls: [string, () => Promise<unknown>][] = [
    ["public_profile", () => g.get("/me", { fields: "id,name" })],
    ["business_management", () => g.get("/me/businesses", { fields: "id,name", limit: 1 })],
    ["pages_show_list", () => g.get("/me/accounts", { fields: "id,name", limit: 1 })],
    ["ads_read", () => need(c.adAccountId, () => g.get(`/${c.adAccountId}/insights`, { date_preset: "last_7d", fields: "spend,impressions" }))],
    ["ads_management", () => need(c.adAccountId, () => g.get(`/${c.adAccountId}/campaigns`, { fields: "id,name,status", limit: 1 }))],
    ["pages_read_engagement", () => need(c.pageId, () => page.get(`/${c.pageId}`, { fields: "name,fan_count,followers_count" }))],
    ["pages_read_user_content", () => need(c.pageId, () => page.get(`/${c.pageId}/tagged`, { fields: "id", limit: 1 }))],
    ["pages_manage_posts", () => need(c.pageId, () => page.get(`/${c.pageId}/scheduled_posts`, { fields: "id", limit: 1 }))],
    ["pages_manage_metadata", () => need(c.pageId, () => page.get(`/${c.pageId}/subscribed_apps`))],
    ["read_insights", () => need(c.pageId, () => page.get(`/${c.pageId}/insights`, { metric: "page_post_engagements", period: "day" }))],
    [
      "pages_manage_ads",
      () =>
        need(c.pageId, async () => {
          const forms = await page.get<{ data: { id: string }[] }>(`/${c.pageId}/leadgen_forms`, { fields: "id,name", limit: 1 });
          formId = forms.data[0]?.id;
          return forms;
        }),
    ],
    // Leads are read with the connection's own token first (the Page token does not always carry leads_retrieval).
    ["leads_retrieval", () => need(formId, () => g.get(`/${formId}/leads`, { limit: 1 }).catch(() => page.get(`/${formId}/leads`, { limit: 1 })), "no lead form on the page")],
    ["instagram_basic", () => need(c.igUserId, () => g.get(`/${c.igUserId}`, { fields: "username,media_count" }))],
    ["instagram_content_publish", () => need(c.igUserId, () => g.get(`/${c.igUserId}/content_publishing_limit`, { fields: "quota_usage" }))],
    ["instagram_manage_insights", () => need(c.igUserId, () => g.get(`/${c.igUserId}/insights`, { metric: "reach", period: "day" }))],
    ["instagram_manage_messages", () => need(c.pageId, () => page.get(`/${c.pageId}/conversations`, { platform: "instagram", limit: 1 }))],
    [
      "catalog_management",
      async () => {
        // The chosen catalog, or the first one the connection's businesses own.
        const businesses = c.catalogId ? null : await g.get<{ data: { owned_product_catalogs?: { data: { id: string }[] } }[] }>("/me/businesses", { fields: "owned_product_catalogs{id}" });
        const catalogId = c.catalogId ?? businesses?.data.flatMap((b) => b.owned_product_catalogs?.data ?? [])[0]?.id;
        return need(catalogId, () => g.get(`/${catalogId}/products`, { fields: "id", limit: 1 }), "no product catalog in the business");
      },
    ],
  ];

  for (const [permission, call] of calls) {
    try {
      await call();
      console.log(`ok       ${permission}`);
    } catch (e) {
      console.log(`failed   ${permission}: ${(e as Error).message}`);
    }
  }
  console.log("\nMeta counts the calls within about a day. Write permissions (posting, creating ads) also count when Mikee does them after an approved card.");
}

function need<T>(id: string | undefined, run: () => Promise<T>, why = "not chosen in this business"): Promise<T> {
  if (!id) return Promise.reject(new Error(`skipped, ${why}`));
  return run();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
