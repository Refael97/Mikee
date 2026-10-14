import { CheckCircle2, ChevronDown } from "lucide-react";
import { getConnection, type MetaConfig, type StoreConfig, type WebsiteConfig } from "@/lib/connections";
import { type Detected, detectBusiness } from "@/lib/meta/detect";
import { Graph, NEEDED_SCOPES } from "@/lib/meta/graph";
import { StoreFields } from "./StoreFields";
import { recheckMeta, saveBudget, saveMetaAssets, saveMetaToken, saveWebsiteAndStore } from "@/lib/actions";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { remember } from "@/lib/ttl";

/** A settings group: title and explanation on the start side, the controls in a card beside them. */
export function Section({ step, title, hint, done, children, id }: { step?: number; title: string; hint?: string; done?: boolean; children: React.ReactNode; id?: string }) {
  return (
    // The explanation sits right above its fields, so the eye does not cross the page to find them.
    <section id={id} className="scroll-mt-6 space-y-3 border-t border-line py-6 first-of-type:border-t-0 first-of-type:pt-2">
      <div>
        <h2 className="flex items-center gap-2 text-[16px] font-medium">
          {step != null &&
            (done ? (
              <CheckCircle2 className="h-5 w-5 text-good" strokeWidth={1.75} aria-label="הושלם" />
            ) : (
              <span className="num flex h-5 w-5 items-center justify-center rounded-full border border-line-strong text-[12px] text-ink-2">{step}</span>
            ))}
          {title}
        </h2>
        {hint && <p className="mt-0.5 text-[14px] leading-relaxed text-ink-2">{hint}</p>}
      </div>
      <div className="card min-w-0 p-4 sm:p-5">{children}</div>
    </section>
  );
}

export async function MetaConnect({ workspaceId }: { workspaceId: string }) {
  const conn = await getConnection<MetaConfig>(workspaceId, "meta");
  if (conn?.secret && conn.status === "broken") {
    return (
      <div className="space-y-3">
        <p className="note note-warn font-semibold">החיבור לפייסבוק נותק, ולכן מייקי לא יכול לראות תוצאות או לפרסם.</p>
        <p className="text-[15px] text-ink-2">זה קורה כשמשנים סיסמה, מסירים הרשאה או כשמישהו מוציא את החשבון מהעסק.</p>
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
  if (conn?.secret) {
    const missing = conn.config.scopes ? NEEDED_SCOPES.filter((x) => !conn.config.scopes!.includes(x)) : [];
    return (
      <div className="space-y-2">
        <p className="tag tag-good">מחובר בתור {conn.config.userName ?? "החשבון שלך"}</p>
        {missing.length > 0 && (
          <p className="note note-warn text-[14px]">
            חסרות הרשאות, ולכן חלק מהפעולות לא יעבדו: <span dir="ltr">{missing.join(", ")}</span>. אפשר לחבר מחדש ולאשר את כולן.
          </p>
        )}
      </div>
    );
  }
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
    <details className="group text-[15px] text-ink-2">
      <summary className="cursor-pointer select-none flex list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden"><ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" strokeWidth={1.75} />יש לי מפתח גישה מוכן</summary>
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
    // The scan reads everything the login can reach: remembered for a few minutes, cleared when assets change.
    found = await remember(`assets-scan:${workspaceId}`, 5 * 60_000, () => detectBusiness(new Graph(conn.secret!), businessName, site?.config.url));
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
        <p className="mb-3 text-[15px] text-ink-3">{saved ? "אני עובד עם:" : "מצאתי את העסק שלך:"}</p>
        <ul className="group-list text-[15px] [&>li]:px-4 [&>li]:py-2.5">
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
      <details className="group text-[15px]">
        <summary className="cursor-pointer select-none text-ink-2 flex list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden"><ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" strokeWidth={1.75} />{saved ? "להחליף" : "לא, אבחר בעצמי"}</summary>
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
      <label className="block space-y-1.5">
        <span className="label">כתובת האתר</span>
        <input name="website" className="field" placeholder="www.your-site.co.il" dir="ltr" defaultValue={site?.config.url} required />
        <span className="block text-[13px] text-ink-3">הכתובת שהלקוחות שלך מכירים. מייקי קורא ממנה את העסק, המוצרים והמחירים.</span>
      </label>
      <StoreFields
        platform={(store?.config.platform ?? (site?.config.platform === "shopify" || site?.config.platform === "woocommerce" ? site.config.platform : "")) as "" | "shopify" | "woocommerce"}
        domain={store?.config.domain}
        consumerKey={store?.config.consumerKey}
        hasSecret={!!store?.secret}
      />
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
          className="field num pe-10 font-medium"
          placeholder="3,000"
          defaultValue={row ? String(row.monthlyLimit) : undefined}
          required
        />
        <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-ink-2">{currency === "ILS" ? "₪" : currency}</span>
      </div>
      <input type="hidden" name="currency" value={currency} />
      <span className="text-ink-2">לחודש</span>
      <button className="btn btn-primary">שמירה</button>
    </form>
  );
}
