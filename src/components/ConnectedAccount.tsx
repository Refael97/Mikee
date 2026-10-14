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

  // One compact line per asset: what it is, its name, and whether it is set. Ids wait under "מזהים".
  const rows: { icon: typeof Flag; title: string; value?: string; ltr?: boolean }[] = [
    { icon: UserRound, title: "מחובר דרך", value: m.person },
    { icon: Building2, title: "העסק במטא", value: m.business },
    { icon: CreditCard, title: "חשבון מודעות", value: m.adAccount ? [m.adAccount.name ?? m.adAccount.id, m.adAccount.currency].filter(Boolean).join(" · ") : undefined },
    { icon: Flag, title: "עמוד", value: m.page?.name ?? m.page?.id },
    { icon: AtSign, title: "אינסטגרם", value: m.instagram ? (m.instagram.username ? `@${m.instagram.username}` : m.instagram.id) : undefined },
    { icon: Activity, title: "פיקסל", value: m.pixel?.name ?? m.pixel?.id },
    { icon: ShoppingBag, title: "קטלוג", value: m.catalog?.name ?? m.catalog?.id },
  ];
  const ids = [
    ["חשבון מודעות", m.adAccount?.id.replace(/^act_/, "")],
    ["עמוד", m.page?.id],
    ["אינסטגרם", m.instagram?.id],
    ["פיקסל", m.pixel?.id],
    ["קטלוג", m.catalog?.id],
  ].filter((x): x is [string, string] => !!x[1]);
  const Row = ({ icon: Icon, title, value, ltr, empty = "לא נבחר" }: { icon: typeof Flag; title: string; value?: string; ltr?: boolean; empty?: string }) => (
    <li className="flex h-9 items-center gap-2.5 px-2.5 text-[14px]">
      <Icon className="h-4 w-4 shrink-0 text-ink-3" strokeWidth={1.5} />
      <span className="w-[92px] shrink-0 text-[13px] text-ink-3">{title}</span>
      <span dir={ltr ? "ltr" : "auto"} className={`min-w-0 flex-1 truncate text-right ${value ? "text-ink" : "text-ink-3"}`}>
        {value ?? empty}
      </span>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${value ? "bg-mint" : "bg-line-strong"}`} aria-hidden />
    </li>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`flex max-w-[240px] items-center gap-2 rounded-full bg-surface ps-3 pe-2.5 text-ink transition-colors hover:bg-surface-2 ${compact ? "h-8 text-[14px]" : "h-9 text-[14px] shadow-[var(--shadow)]"}`}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${!m.connected ? "bg-ink-3" : broken ? "bg-coral" : "bg-mint"}`} aria-hidden />
        <span dir="auto" className="truncate">{label}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`} strokeWidth={1.5} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="הנכסים המחוברים"
          className={`pop-over rise absolute top-full z-50 mt-2 flex max-h-[calc(100dvh-96px)] w-[min(340px,calc(100vw-32px))] flex-col !rounded-[16px] ${compact ? "max-lg:fixed max-lg:inset-x-4 max-lg:top-[60px] max-lg:w-auto lg:start-0" : "end-0"}`}
        >
          <div className="shrink-0 border-b border-line px-3.5 py-2.5">
            <p dir="auto" className="truncate text-right text-[15px]">{label}</p>
            <p className={`text-[12.5px] ${broken ? "text-bad" : "text-ink-3"}`}>
              {!m.connected ? "פייסבוק ואינסטגרם עוד לא מחוברים" : broken ? `החיבור נותק${m.statusReason ? `: ${m.statusReason}` : ""}` : "הנכסים שמייקי עובד איתם"}
            </p>
          </div>
          <div className="min-h-0 overflow-y-auto p-1">
            {m.connected && (
              <ul>
                {rows.map((r) => (
                  <Row key={r.title} {...r} />
                ))}
              </ul>
            )}
            <ul className={m.connected ? "mt-1 border-t border-line pt-1" : ""}>
              <Row icon={Globe} title="אתר" value={assets.website?.replace(/^https?:\/\//, "").replace(/\/$/, "")} ltr empty="לא חובר" />
              <Row icon={HardDrive} title="גוגל דרייב" value={assets.drive ? "מחובר" : undefined} empty="לא חובר" />
            </ul>
            {ids.length > 0 && (
              <details className="group mx-2.5 mb-1 mt-1 border-t border-line pt-1.5 text-[12.5px] text-ink-3">
                <summary className="flex h-7 cursor-pointer list-none items-center gap-1 hover:text-ink-2">
                  <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" strokeWidth={1.5} />
                  מזהים
                </summary>
                <dl className="space-y-0.5 pb-1">
                  {ids.map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3">
                      <dt>{k}</dt>
                      <dd dir="ltr" className="num select-all text-ink-2">{v}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
          </div>
          <div className="shrink-0 border-t border-line p-1.5">
            <Link href="/settings" onClick={() => setOpen(false)} className="btn btn-quiet btn-sm w-full">
              {broken || !m.connected ? "לחבר בהגדרות" : "לנהל חיבורים"}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
