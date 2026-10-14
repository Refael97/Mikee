"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Activity, AtSign, Building2, ChevronDown, CreditCard, Flag, Globe, HardDrive, ShoppingBag, UserRound } from "lucide-react";
import type { ConnectedAssets } from "@/lib/meta/assets";

/**
 * The connected account, always in view: the business's name at Meta, and on click every asset Mikee
 * works with (the person who connected, ad account, page, Instagram, pixel, catalog, site, Drive).
 */
export function ConnectedAccount({ initial, compact = false }: { initial: ConnectedAssets; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState(initial);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setAssets(initial), [initial]);
  useEffect(() => {
    if (!open) return;
    // Fresh on every open, with names Meta had not given before.
    void fetch("/api/meta/assets", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((a) => a && setAssets(a))
      .catch(() => undefined);
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const m = assets.meta;
  const label = m.connected ? (m.account ?? "חשבון מחובר") : "לא מחובר למטא";
  const broken = m.connected && m.status === "broken";

  const rows: { icon: typeof Flag; title: string; value?: string; sub?: string }[] = [
    { icon: UserRound, title: "מחובר דרך", value: m.person },
    { icon: Building2, title: "העסק במטא", value: m.business },
    { icon: CreditCard, title: "חשבון מודעות", value: m.adAccount?.name ?? m.adAccount?.id, sub: m.adAccount ? [m.adAccount.id.replace(/^act_/, ""), m.adAccount.currency].filter(Boolean).join(" · ") : undefined },
    { icon: Flag, title: "עמוד פייסבוק", value: m.page?.name ?? m.page?.id },
    { icon: AtSign, title: "אינסטגרם", value: m.instagram ? (m.instagram.username ? `@${m.instagram.username}` : m.instagram.id) : undefined },
    { icon: Activity, title: "פיקסל", value: m.pixel?.name ?? m.pixel?.id, sub: m.pixel?.name ? m.pixel.id : undefined },
    { icon: ShoppingBag, title: "קטלוג מוצרים", value: m.catalog?.name ?? m.catalog?.id },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`flex max-w-[260px] items-center gap-2 rounded-full bg-surface ps-3 pe-2.5 text-ink transition-colors hover:bg-surface-2 ${compact ? "h-8 text-[14px]" : "h-10 text-[15px] shadow-[var(--shadow)]"}`}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${!m.connected ? "bg-ink-3" : broken ? "bg-coral" : "bg-mint"}`} aria-hidden />
        <span dir="auto" className="truncate">{label}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`} strokeWidth={1.5} />
      </button>

      {open && (
        <div role="dialog" aria-label="הנכסים המחוברים" className={`pop-over rise absolute top-full z-50 mt-2 w-[min(340px,calc(100vw-32px))] p-2 ${compact ? "start-0" : "end-0"}`}>
          <div className="px-3 pb-2 pt-1.5">
            <p className="text-[17px]">{label}</p>
            <p className={`text-[13.5px] ${broken ? "text-bad" : "text-ink-3"}`}>
              {!m.connected ? "פייסבוק ואינסטגרם עוד לא מחוברים" : broken ? `החיבור נותק${m.statusReason ? `: ${m.statusReason}` : ""}` : "מחובר. אלה הנכסים שמייקי עובד איתם"}
            </p>
          </div>
          {m.connected && (
            <ul className="border-t border-line pt-1">
              {rows.map((r) => (
                <li key={r.title} className="flex min-h-10 items-center gap-3 rounded-[10px] px-3 py-1.5">
                  <r.icon className="h-5 w-5 shrink-0 text-ink-3" strokeWidth={1.5} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] text-ink-3">{r.title}</span>
                    <span dir="auto" className={`block truncate text-right ${r.value ? "text-ink" : "text-ink-3"}`}>{r.value ?? "לא נבחר"}</span>
                    {r.sub && <span dir="auto" className="num block text-right text-[13px] text-ink-3">{r.sub}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <ul className="mt-1 border-t border-line pt-1">
            <li className="flex min-h-10 items-center gap-3 px-3 py-1.5">
              <Globe className="h-5 w-5 shrink-0 text-ink-3" strokeWidth={1.5} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] text-ink-3">אתר</span>
                <span className={`block truncate ${assets.website ? "" : "text-ink-3"}`} dir="ltr" style={{ textAlign: "right" }}>
                  {assets.website?.replace(/^https?:\/\//, "") ?? "לא חובר"}
                </span>
              </span>
            </li>
            <li className="flex min-h-10 items-center gap-3 px-3 py-1.5">
              <HardDrive className="h-5 w-5 shrink-0 text-ink-3" strokeWidth={1.5} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] text-ink-3">גוגל דרייב</span>
                <span className={`block ${assets.drive ? "" : "text-ink-3"}`}>{assets.drive ? "מחובר" : "לא חובר"}</span>
              </span>
            </li>
          </ul>
          <div className="mt-1 border-t border-line px-1 pt-2">
            <Link href="/settings" onClick={() => setOpen(false)} className="btn btn-quiet btn-sm w-full">
              {broken || !m.connected ? "לחבר בהגדרות" : "לנהל חיבורים"}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
