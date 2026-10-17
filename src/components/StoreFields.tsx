"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useT } from "@/components/Lang";

type Platform = "" | "shopify" | "woocommerce";

function Steps({ items }: { items: string[] }) {
  const t = useT();
  return (
    <details className="group rounded-[12px] border border-line bg-surface-2 px-3 py-2 text-[14px] text-ink-2">
      <summary className="flex cursor-pointer list-none select-none items-center gap-1.5 font-medium text-ink [&::-webkit-details-marker]:hidden">
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" strokeWidth={1.75} />
        {t("איפה מוצאים את זה?")}
      </summary>
      <ol className="mt-2 list-decimal space-y-1 ps-5 leading-relaxed">
        {items.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </details>
  );
}

/**
 * The online-store part of the website step. One platform at a time, each with only its own fields, a plain
 * name for each, and where to find it. Optional: a website without a store needs none of this.
 */
export function StoreFields({ platform: initial, domain, consumerKey, hasSecret }: { platform: Platform; domain?: string; consumerKey?: string; hasSecret: boolean }) {
  const t = useT();
  const [platform, setPlatform] = useState<Platform>(initial);
  const saved = hasSecret ? t("•••••• שמור. להשאיר ריק כדי לא לשנות") : undefined;

  return (
    <div className="space-y-4 rounded-[8px] border border-line p-4">
      <div>
        <p className="font-medium">{t("יש באתר חנות אונליין?")}</p>
        <p className="mt-0.5 text-[14px] text-ink-2">{t("לא חובה. אם מחברים, מייקי רואה מכירות אמיתיות, מוצרים ומלאי, ולא רק קליקים. ככה הוא יודע מה באמת מוכר ומה כמעט אזל.")}</p>
      </div>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("פלטפורמת החנות")}>
        {(
          [
            ["", t("אין חנות / לא עכשיו")],
            ["shopify", "Shopify"],
            ["woocommerce", t("WooCommerce (וורדפרס)")],
          ] as const
        ).map(([v, l]) => (
          <button
            key={v || "none"}
            type="button"
            role="radio"
            aria-checked={platform === v}
            onClick={() => setPlatform(v)}
            className="tab tab-sm"
          >
            {l}
          </button>
        ))}
      </div>
      <input type="hidden" name="storePlatform" value={platform} />

      {platform === "shopify" && (
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="label">{t("כתובת החנות ב־Shopify")}</span>
            <input name="storeDomain" className="field" placeholder="my-store.myshopify.com" dir="ltr" defaultValue={domain} required />
            <span className="block text-[13px] text-ink-3">{t("הכתובת הפנימית שמסתיימת ב־myshopify.com, גם אם לאתר יש דומיין משלו.")}</span>
          </label>
          <label className="block space-y-1.5">
            <span className="label">{t("מפתח גישה (Admin API access token)")}</span>
            <input name="storeSecret" type="password" className="field" placeholder={saved ?? "shpat_…"} dir="ltr" autoComplete="off" required={!hasSecret} />
            <span className="block text-[13px] text-ink-3">{t("מתחיל ב־shpat_. מאפשר למייקי רק לקרוא הזמנות ומוצרים, לא לשנות כלום.")}</span>
          </label>
          <Steps
            items={[
              t("בניהול של Shopify: Settings ← Apps and sales channels ← Develop apps."),
              t("Create an app, ותנו לה שם (למשל Mikee)."),
              t("Configure Admin API scopes: לסמן read_orders, read_products ו־read_inventory בלבד, ולשמור."),
              t("Install app, ואז Reveal token once. להעתיק את המפתח ולהדביק כאן (הוא מוצג פעם אחת בלבד)."),
            ]}
          />
        </div>
      )}

      {platform === "woocommerce" && (
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="label">{t("מפתח צרכן (Consumer key)")}</span>
            <input name="storeKey" className="field" placeholder="ck_…" dir="ltr" autoComplete="off" defaultValue={consumerKey} required />
          </label>
          <label className="block space-y-1.5">
            <span className="label">{t("סוד צרכן (Consumer secret)")}</span>
            <input name="storeSecret" type="password" className="field" placeholder={saved ?? "cs_…"} dir="ltr" autoComplete="off" required={!hasSecret} />
            <span className="block text-[13px] text-ink-3">{t("שני המפתחות נוצרים יחד. הרשאת קריאה בלבד: מייקי לא יכול לשנות כלום בחנות.")}</span>
          </label>
          <label className="block space-y-1.5">
            <span className="label">{t("כתובת החנות (לא חובה)")}</span>
            <input name="storeDomain" className="field" placeholder={t("ריק = כתובת האתר שלמעלה")} dir="ltr" defaultValue={domain} />
          </label>
          <Steps
            items={[
              t("בניהול של וורדפרס: WooCommerce ← Settings ← Advanced ← REST API."),
              t("Add key. תיאור: Mikee. משתמש: אתם. Permissions: Read."),
              t("Generate API key. להעתיק את ה־Consumer key ואת ה־Consumer secret לכאן (הסוד מוצג פעם אחת בלבד)."),
            ]}
          />
        </div>
      )}
    </div>
  );
}
