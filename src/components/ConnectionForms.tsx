import { getConnection, type MetaConfig, type StoreConfig, type WebsiteConfig } from "@/lib/connections";
import { type Detected, detectBusiness } from "@/lib/meta/detect";
import { Graph } from "@/lib/meta/graph";
import { recheckMeta, saveBudget, saveMetaAssets, saveMetaToken, saveWebsiteAndStore } from "@/lib/actions";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

/** A titled floating group, like a section in iOS Settings. */
export function Section({ step, title, hint, done, children }: { step?: number; title: string; hint?: string; done?: boolean; children: React.ReactNode }) {
  return (
    <section className="rise">
      <div className="mb-3 flex items-center gap-2.5 px-1.5">
        {step != null && (
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
              done ? "bg-good text-white" : "bg-surface-3 text-ink-2"
            }`}
          >
            {done ? "✓" : step}
          </span>
        )}
        <h2 className="text-[1.05rem] font-semibold tracking-tight">{title}</h2>
      </div>
      {hint && <p className="-mt-1.5 mb-3 px-1.5 text-sm text-ink-3">{hint}</p>}
      <div className="float rounded-[24px] p-5 sm:p-6">{children}</div>
    </section>
  );
}

export async function MetaConnect({ workspaceId }: { workspaceId: string }) {
  const conn = await getConnection<MetaConfig>(workspaceId, "meta");
  if (conn?.secret && conn.status === "broken") {
    return (
      <div className="space-y-3">
        <p className="font-medium text-warn">החיבור לפייסבוק נותק, ולכן מייקי לא יכול לראות תוצאות או לפרסם.</p>
        <p className="text-sm text-ink-2">זה קורה כשמשנים סיסמה, מסירים הרשאה או כשמישהו מוציא את החשבון מהעסק.</p>
        <div className="flex flex-wrap gap-2">
          {process.env.META_APP_ID && (
            <a href="/api/meta/connect" className="btn btn-primary">
              לחבר מחדש
            </a>
          )}
          <form action={recheckMeta}>
            <button className="btn btn-quiet">לבדוק שוב</button>
          </form>
        </div>
        <TokenForm />
      </div>
    );
  }
  if (conn?.secret) return <p className="text-ink-2">מחובר בתור {conn.config.userName ?? "החשבון שלך"} ✓</p>;
  return (
    <div className="space-y-4">
      {process.env.META_APP_ID && (
        <a href="/api/meta/connect" className="btn btn-primary">
          התחברות עם פייסבוק
        </a>
      )}
      <TokenForm />
    </div>
  );
}

function TokenForm() {
  return (
    <details className="text-sm text-ink-2">
      <summary className="cursor-pointer select-none">יש לי מפתח גישה מוכן</summary>
      <form action={saveMetaToken} className="mt-3 flex gap-2">
        <input name="token" className="field" placeholder="מפתח גישה ממטא" dir="ltr" />
        <button className="btn btn-quiet shrink-0">שמירה</button>
      </form>
    </details>
  );
}

/**
 * Finds the business among everything the login can see and asks one question:
 * "these are yours?" Picking by hand stays available, folded away.
 */
export async function MetaAssets({ workspaceId, businessName }: { workspaceId: string; businessName: string }) {
  const conn = await getConnection<MetaConfig>(workspaceId, "meta");
  if (!conn?.secret) return <p className="text-ink-3">קודם מתחברים לפייסבוק.</p>;
  const site = await getConnection<WebsiteConfig>(workspaceId, "website");
  let found: Detected;
  try {
    found = await detectBusiness(new Graph(conn.secret), businessName, site?.config.url);
  } catch (e) {
    return <p className="text-warn">לא הצלחתי לקרוא את החשבונות ({(e as Error).message}). נסי להתחבר מחדש.</p>;
  }
  const c = conn.config;
  const chosen = {
    adAccountId: c.adAccountId ?? found.guess.adAccountId,
    pageId: c.pageId ?? found.guess.pageId,
    pixelId: c.pixelId ?? found.guess.pixelId,
    catalogId: c.catalogId ?? found.guess.catalogId,
  };
  const page = found.pages.find((p) => p.id === chosen.pageId);
  const account = found.adAccounts.find((a) => a.id === chosen.adAccountId);
  const pixel = found.pixels.find((p) => p.id === chosen.pixelId);
  const saved = !!c.adAccountId;

  if (!page && !account) return <p className="text-ink-2">לא מצאתי דף או חשבון מודעות שמחוברים למשתמש הזה.</p>;

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-3 text-sm text-ink-3">{saved ? "אני עובד עם:" : "מצאתי את העסק שלך:"}</p>
        <ul className="group-list text-[0.95rem] [&>li]:px-4 [&>li]:py-3">
          {page && (
            <li>
              דף הפייסבוק <strong>{page.name}</strong>
            </li>
          )}
          {page?.ig && (
            <li>
              האינסטגרם <strong dir="ltr">@{page.ig.username}</strong>
            </li>
          )}
          {account && (
            <li>
              חשבון המודעות <strong>{account.name}</strong>
            </li>
          )}
          {pixel && <li>המעקב באתר פעיל{pixel.lastFired ? ` (נראה לאחרונה ${new Date(pixel.lastFired).toLocaleDateString("he-IL")})` : ""}</li>}
        </ul>
      </div>
      {!saved && (
        <form action={saveMetaAssets}>
          <Hidden chosen={chosen} />
          <button className="btn btn-primary">כן, זה העסק שלי</button>
        </form>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer select-none text-ink-2">{saved ? "להחליף" : "לא, אבחר בעצמי"}</summary>
        <form action={saveMetaAssets} className="mt-4 grid gap-4 sm:grid-cols-2">
          <Select label="דף הפייסבוק" name="page" value={chosen.pageId} options={found.pages.map((p) => [p.id, `${p.name}${p.ig?.username ? ` · @${p.ig.username}` : ""}`])} />
          <Select label="חשבון המודעות" name="adAccount" value={chosen.adAccountId} options={found.adAccounts.map((a) => [a.id, a.name])} />
          <Select label="מעקב באתר" name="pixel" value={chosen.pixelId} options={[["", "בלי"], ...found.pixels.map((p) => [p.id, p.name] as [string, string])]} />
          <Select label="קטלוג מוצרים" name="catalog" value={chosen.catalogId} options={[["", "בלי"], ...found.catalogs.map((k) => [k.id, k.name] as [string, string])]} />
          <div className="sm:col-span-2">
            <button className="btn btn-quiet">שמירה</button>
          </div>
        </form>
      </details>
    </div>
  );
}

function Hidden({ chosen }: { chosen: Record<string, string | undefined> }) {
  return (
    <>
      <input type="hidden" name="page" value={chosen.pageId ?? ""} />
      <input type="hidden" name="adAccount" value={chosen.adAccountId ?? ""} />
      <input type="hidden" name="pixel" value={chosen.pixelId ?? ""} />
      <input type="hidden" name="catalog" value={chosen.catalogId ?? ""} />
    </>
  );
}

function Select({ label, name, value, options }: { label: string; name: string; value?: string; options: [string, string][] }) {
  return (
    <label className="space-y-1.5">
      <span className="text-ink-2">{label}</span>
      <select name={name} className="field" defaultValue={value}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
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
