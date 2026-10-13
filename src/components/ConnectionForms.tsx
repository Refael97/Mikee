import { getConnection, type MetaConfig, type StoreConfig, type WebsiteConfig } from "@/lib/connections";
import { discoverAssets, listPixels } from "@/lib/meta/context";
import { Graph } from "@/lib/meta/graph";
import { saveBudget, saveMetaAssets, saveMetaToken, saveWebsiteAndStore } from "@/lib/actions";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export function Section({ step, title, hint, done, children }: { step?: number; title: string; hint?: string; done?: boolean; children: React.ReactNode }) {
  return (
    <section className="card p-6 sm:p-8 fade-in">
      <div className="mb-5 flex items-start gap-3">
        {step != null && (
          <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${done ? "bg-good text-white" : "bg-surface-2 text-ink-2"}`}>
            {done ? "✓" : step}
          </span>
        )}
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          {hint && <p className="mt-1 text-ink-2">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export async function MetaConnect({ workspaceId }: { workspaceId: string }) {
  const conn = await getConnection<MetaConfig>(workspaceId, "meta");
  if (conn?.secret) return <p className="text-ink-2">מחובר בתור {conn.config.userName ?? "החשבון שלך"} ✓</p>;
  return (
    <div className="space-y-4">
      {process.env.META_APP_ID && (
        <a href="/api/meta/connect" className="btn btn-primary">
          התחברות עם פייסבוק
        </a>
      )}
      <details className="text-sm text-ink-2">
        <summary className="cursor-pointer select-none">יש לי מפתח גישה מוכן</summary>
        <form action={saveMetaToken} className="mt-3 flex gap-2">
          <input name="token" className="field" placeholder="מפתח גישה ממטא" dir="ltr" />
          <button className="btn btn-quiet shrink-0">שמירה</button>
        </form>
      </details>
    </div>
  );
}

export async function MetaAssets({ workspaceId }: { workspaceId: string }) {
  const conn = await getConnection<MetaConfig>(workspaceId, "meta");
  if (!conn?.secret) return <p className="text-ink-3">קודם מתחברים לפייסבוק.</p>;
  const graph = new Graph(conn.secret);
  let assets: Awaited<ReturnType<typeof discoverAssets>>;
  try {
    assets = await discoverAssets(graph);
  } catch (e) {
    return <p className="text-warn">לא הצלחנו לקרוא את החשבונות ({(e as Error).message}). נסי להתחבר מחדש.</p>;
  }
  const pixels = (await Promise.all(assets.adAccounts.slice(0, 5).map((a) => listPixels(graph, a.id)))).flat();
  const c = conn.config;
  return (
    <form action={saveMetaAssets} className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1.5">
        <span className="text-sm text-ink-2">חשבון המודעות</span>
        <select name="adAccount" className="field" defaultValue={c.adAccountId ? `${c.adAccountId}|${c.adAccountName}|${c.currency}` : undefined}>
          {assets.adAccounts.map((a) => (
            <option key={a.id} value={`${a.id}|${a.name}|${a.currency}`}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1.5">
        <span className="text-sm text-ink-2">דף הפייסבוק (והאינסטגרם שמחובר אליו)</span>
        <select name="page" className="field" defaultValue={c.pageId ? `${c.pageId}|${c.pageName}|${c.igUserId ?? ""}|${c.igUsername ?? ""}` : undefined}>
          {assets.pages.map((p) => (
            <option key={p.id} value={`${p.id}|${p.name}|${p.instagram_business_account?.id ?? ""}|${p.instagram_business_account?.username ?? ""}`}>
              {p.name}
              {p.instagram_business_account?.username ? ` · @${p.instagram_business_account.username}` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1.5">
        <span className="text-sm text-ink-2">מעקב באתר</span>
        <select name="pixel" className="field" defaultValue={c.pixelId}>
          <option value="">בלי</option>
          {pixels.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1.5">
        <span className="text-sm text-ink-2">קטלוג מוצרים</span>
        <select name="catalog" className="field" defaultValue={c.catalogId}>
          <option value="">בלי</option>
          {assets.catalogs.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
      </label>
      <div className="sm:col-span-2">
        <button className="btn btn-primary">{c.adAccountId ? "עדכון" : "שמירה"}</button>
      </div>
    </form>
  );
}

export async function WebsiteStore({ workspaceId }: { workspaceId: string }) {
  const [site, store] = await Promise.all([
    getConnection<WebsiteConfig>(workspaceId, "website"),
    getConnection<StoreConfig>(workspaceId, "store"),
  ]);
  return (
    <form action={saveWebsiteAndStore} className="space-y-4">
      <input name="website" className="field" placeholder="www.your-site.co.il" dir="ltr" defaultValue={site?.config.url} required />
      <details className="text-sm" open={!!store?.config.domain}>
        <summary className="cursor-pointer select-none text-ink-2">יש חנות אונליין? חברו גם את ההזמנות</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <select name="storePlatform" className="field" defaultValue={store?.config.platform ?? site?.config.platform ?? ""}>
            <option value="">פלטפורמת החנות</option>
            <option value="shopify">Shopify</option>
            <option value="woocommerce">WooCommerce</option>
          </select>
          <input name="storeDomain" className="field" placeholder="shop.myshopify.com / https://site.co.il" dir="ltr" defaultValue={store?.config.domain} />
          <input name="storeKey" className="field" placeholder="WooCommerce: Consumer key" dir="ltr" defaultValue={store?.config.consumerKey} />
          <input name="storeSecret" type="password" className="field" placeholder={store?.secret ? "•••••• (שמור)" : "Shopify admin token / Woo secret"} dir="ltr" />
        </div>
      </details>
      <button className="btn btn-primary">שמירה</button>
    </form>
  );
}

export async function BudgetForm({ workspaceId }: { workspaceId: string }) {
  const d = await db();
  const row = await d.query.budgets.findFirst({ where: eq(schema.budgets.workspaceId, workspaceId) });
  const meta = await getConnection<MetaConfig>(workspaceId, "meta");
  const currency = meta?.config.currency ?? row?.currency ?? "ILS";
  return (
    <form action={saveBudget} className="flex flex-wrap items-center gap-3">
      <div className="relative w-48">
        <input
          name="monthlyLimit"
          inputMode="decimal"
          className="field pe-12 text-lg font-medium"
          placeholder="3,000"
          defaultValue={row ? String(row.monthlyLimit) : undefined}
          required
        />
        <span className="pointer-events-none absolute inset-y-0 end-4 flex items-center text-ink-2">{currency === "ILS" ? "₪" : currency}</span>
      </div>
      <input type="hidden" name="currency" value={currency} />
      <span className="text-ink-2">לחודש</span>
      <button className="btn btn-primary">שמירה</button>
    </form>
  );
}
