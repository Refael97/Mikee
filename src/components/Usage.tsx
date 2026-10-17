"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ChevronDown, X } from "lucide-react";
import { useLocale, useT } from "@/components/Lang";

/**
 * The usage quota as the client sees it: a share of the month's quota, what is left, when it renews. It updates
 * in the background (after Mikee answers, on focus, every minute), never asks her to approve a cost, and
 * buying more is always her explicit request.
 */
export type Usage = {
  percent: number;
  included: number;
  includedLeft: number;
  purchasedLeft: number;
  renewsOn: string;
  cycle: string;
  used: { conversations: number; media: number };
  plan: string;
  guidance: string | null;
  notice: number | null;
};

let current: Usage | null = null;
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

export function refreshUsage() {
  inflight ??= fetch("/api/credits", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((u: Usage | null) => {
      if (u) {
        current = u;
        listeners.forEach((l) => l());
      }
    })
    .catch(() => undefined)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useUsage() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => current,
    () => null,
  );
}

/** Any screen can say "usage may have changed" (Mikee finished, a card ran) without knowing who listens. */
export const usageChanged = () => window.dispatchEvent(new Event("mikee:usage"));

const n = (v: number, locale: string) => Math.round(v).toLocaleString(locale);
const day = (iso: string, locale: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "long" });

/** Keeps the numbers fresh and shows the 80% and 95% notices, once each. Mounted once in the app layout. */
export function UsageWatcher() {
  const t = useT();
  const u = useUsage();
  const [notice, setNotice] = useState<{ cycle: string; threshold: number } | null>(null);

  useEffect(() => {
    void refreshUsage();
    const again = () => void refreshUsage();
    const timer = setInterval(again, 60_000);
    window.addEventListener("mikee:usage", again);
    window.addEventListener("focus", again);
    return () => {
      clearInterval(timer);
      window.removeEventListener("mikee:usage", again);
      window.removeEventListener("focus", again);
    };
  }, []);

  useEffect(() => {
    if (!u?.notice) return;
    setNotice({ cycle: u.cycle, threshold: u.notice });
    // Counted as shown once it is on screen, so it never comes back for this threshold.
    void fetch("/api/credits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "seen", cycle: u.cycle, threshold: u.notice }) }).catch(() => undefined);
  }, [u?.notice, u?.cycle]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 12_000);
    return () => clearTimeout(timer);
  }, [notice]);

  if (!notice) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div role="status" className="toast-in pointer-events-auto flex max-w-[420px] items-center gap-3 rounded-[12px] bg-surface py-2.5 pe-2 ps-4 text-[14px] shadow-[0_0_0_1px_rgba(26,31,54,0.08),var(--shadow-float)]">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" aria-hidden />
        <span className="min-w-0 flex-1">{t("המכסה החודשית כמעט נגמרה. אפשר להוסיף קרדיטים ולהמשיך.")}</span>
        <button onClick={() => setNotice(null)} aria-label={t("סגירה")} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-ink-3 hover:bg-surface-2 hover:text-ink">
          <X className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

function Bar({ percent }: { percent: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full transition-[width] duration-[var(--dur-3)] ${percent >= 95 ? "bg-bad" : percent >= 80 ? "bg-warn" : "bg-brand"}`} style={{ width: `${percent}%` }} />
    </div>
  );
}

/** Asks for more credits or an upgrade. Nothing is bought here; we come back to her with the options. */
export function UsageRequests({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const [sent, setSent] = useState<null | "credits" | "upgrade">(null);
  const [error, setError] = useState(false);
  const ask = async (kind: "credits" | "upgrade") => {
    setError(false);
    const r = await fetch("/api/credits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "request", kind }) }).catch(() => null);
    if (r?.ok) setSent(kind);
    else setError(true);
  };
  if (sent)
    return (
      <p role="status" className="text-[13px] text-ink-2">
        {sent === "credits" ? t("קיבלנו את הבקשה להוספת קרדיטים.") : t("קיבלנו את הבקשה לשדרוג.")} {t("נחזור אלייך עם האפשרויות. שום דבר לא חויב.")}
      </p>
    );
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void ask("credits")} className={`btn btn-primary ${compact ? "btn-sm" : ""}`}>
          {t("הוספת קרדיטים")}
        </button>
        <button type="button" onClick={() => void ask("upgrade")} className={`btn btn-quiet ${compact ? "btn-sm" : ""}`}>
          {t("שדרוג המנוי")}
        </button>
      </div>
      {error && <p className="text-[13px] text-bad">{t("הבקשה לא נשלחה. נסי שוב.")}</p>}
    </div>
  );
}

/** The compact line in the account menu, opening the usage panel in place. */
export function UsageMenuItem() {
  const t = useT();
  const locale = useLocale();
  const u = useUsage();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open) void refreshUsage();
  }, [open]);
  return (
    <div className="px-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-10 w-full items-center gap-2 rounded-[10px] px-1.5 text-start text-[14px] text-ink-2 hover:bg-surface-2 hover:text-ink"
      >
        <span className="min-w-0 flex-1">
          {t("ניצול המכסה החודשית:")} <span className="num text-ink">{u ? `${Math.round(u.percent)}%` : <span className="skeleton inline-block h-3 w-7 align-middle" />}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-3 transition-transform duration-[var(--dur-2)] ${open ? "rotate-180" : ""}`} strokeWidth={1.5} />
      </button>
      {open && u && (
        <div className="space-y-2.5 px-1.5 pb-2 pt-1">
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="text-ink-3">{u.plan}</span>
            <span className="num">{u.percent}%</span>
          </div>
          <Bar percent={u.percent} />
          <p className="text-[13px] text-ink-2">
            {t("נשארו")} <span className="num">{n(u.includedLeft, locale)}</span> {t("מתוך")} <span className="num">{n(u.included, locale)}</span> {t("קרדיטים")}
          </p>
          <p className="text-[13px] text-ink-3">{t("המכסה מתחדשת ב־{date}", { date: day(u.renewsOn, locale) })}</p>
          {u.purchasedLeft > 0 && (
            <p className="text-[13px] text-ink-2">
              {t("קרדיטים נוספים שרכשת:")} <span className="num">{n(u.purchasedLeft, locale)}</span>
            </p>
          )}
          <UsageRequests compact />
          <Link href="/account#usage" className="link block text-[13px]">
            {t("פירוט השימוש")}
          </Link>
        </div>
      )}
    </div>
  );
}

export { Bar as UsageBar, day as usageDay };
