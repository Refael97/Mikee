"use client";

import Link from "next/link";
import { UsageMenuItem } from "./Usage";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BarChart3, Clock, Images, Inbox, LifeBuoy, LogOut, Megaphone, Menu, MessagesSquare, Settings, Store, User, X } from "lucide-react";
import { logout } from "@/app/login/actions";
import { HelpPanel } from "./HelpPanel";
import { MikeeAvatar } from "@/components/MikeeAvatar";
import { ConnectedAccount } from "@/components/ConnectedAccount";
import type { ConnectedAssets } from "@/lib/meta/assets";
import { LanguageMenu } from "./LanguageMenu";
import { useT } from "./Lang";

export const LINKS = [
  { href: "/mikee", label: "שיחות", icon: MessagesSquare },
  { href: "/schedule", label: "תזמון", icon: Clock },
  { href: "/results", label: "תוצאות", icon: BarChart3 },
  { href: "/campaigns", label: "קמפיינים", icon: Megaphone },
  { href: "/library", label: "ספרייה", icon: Images },
  { href: "/inbox", label: "הודעות", icon: Inbox },
  { href: "/brand", label: "העסק", icon: Store },
];

type Who = { name: string; email: string; business: string };

/** The name of a rail icon, shown half a second after the pointer rests on it (styles: .rail-tip). */
function Tip({ label }: { label: string }) {
  return (
    <span role="tooltip" className="rail-tip">
      {label}
    </span>
  );
}

function NavLink({ href, label, icon: Icon, active, compact, dot }: { href: string; label: string; icon: typeof Store; active: boolean; compact?: boolean; dot?: boolean }) {
  const t = useT();
  // Desktop: an icon in the rail, its name on hover. Mobile sheet: icon and name in a row.
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={t(label)}
      className={
        compact
          ? `has-tip relative flex h-12 w-12 items-center justify-center rounded-[14px] transition-colors ${active ? "bg-black/[.06] text-ink dark:bg-white/[.08]" : "text-ink-2 hover:bg-black/[.04] hover:text-ink dark:hover:bg-white/[.05]"}`
          : `flex h-[38px] items-center gap-3 rounded-[10px] px-2.5 text-[15px] transition-colors ${active ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`
      }
    >
      <Icon className="h-[22px] w-[22px] shrink-0" strokeWidth={1.5} />
      {compact ? <Tip label={t(label)} /> : <span>{t(label)}</span>}
      {dot && <span className={`h-2 w-2 rounded-full bg-blue ${compact ? "absolute end-2.5 top-2.5" : "ms-auto"}`} aria-label={t("ממתין לך")} />}
    </Link>
  );
}

/**
 * The app frame. Desktop: a sidebar on the start side (labels from 1280px, an icon rail between 1024 and 1280).
 * Mobile: a top bar with the current section and a menu sheet.
 */
export function Nav({ who, support, waiting = {}, assets }: { who: Who; support: { email?: string; whatsapp?: string }; waiting?: Record<string, boolean>; assets: ConnectedAssets }) {
  const t = useT();
  const path = usePathname();
  const [sheet, setSheet] = useState(false);
  const [menu, setMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // New in a conversation: first from the server, then live from the conversations list when it is on screen.
  const unreadAtLoad = !!waiting["/mikee"];
  const [unread, setUnread] = useState(unreadAtLoad);
  useEffect(() => setUnread(unreadAtLoad), [unreadAtLoad]);
  useEffect(() => {
    const h = (e: Event) => setUnread(!!(e as CustomEvent<boolean>).detail);
    window.addEventListener("mikee:unread", h);
    return () => window.removeEventListener("mikee:unread", h);
  }, []);

  useEffect(() => {
    setSheet(false);
    setMenu(false);
  }, [path]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

  const initial = who.name.trim().slice(0, 1);
  const settingsActive = path.startsWith("/settings");

  return (
    <>
      {/* Desktop: the icon rail on the ground, beside the panels */}
      <aside className="sticky top-[10px] z-40 hidden h-[calc(100dvh-20px)] w-[68px] shrink-0 flex-col items-center py-1 lg:flex">
        <Link href="/mikee" className="has-tip relative mb-3 flex h-12 w-12 items-center justify-center rounded-[14px] hover:bg-black/[.04]" aria-label={t("מייקי")}>
          <MikeeAvatar size={32} />
          <Tip label={`${t("מייקי")} · ${who.business}`} />
        </Link>

        <nav className="flex flex-col items-center gap-1" aria-label={t("ניווט ראשי")}>
          {LINKS.map((l) => (
            <NavLink key={l.href} {...l} active={path.startsWith(l.href)} dot={waiting[l.href]} compact />
          ))}
        </nav>

        <div className="mt-auto flex flex-col items-center gap-1">
          <button
            onClick={() => setHelp(true)}
            aria-label={t("עזרה")}
            className="has-tip relative flex h-12 w-12 items-center justify-center rounded-[14px] text-ink-2 transition-colors hover:bg-black/[.04] hover:text-ink dark:hover:bg-white/[.05]"
          >
            <LifeBuoy className="h-[22px] w-[22px]" strokeWidth={1.5} />
            <Tip label={t("עזרה")} />
          </button>
          <NavLink href="/settings" label="הגדרות" icon={Settings} active={settingsActive} compact />

          <div ref={menuRef} className="relative mt-2">
            <button
              onClick={() => setMenu((m) => !m)}
              aria-expanded={menu}
              aria-label={t("החשבון שלי")}
              className="has-tip relative flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-[15px] font-normal text-ink-2 transition-colors hover:text-ink"
            >
              {initial}
              {!menu && <Tip label={who.name} />}
            </button>
            {menu && (
              <div className="pop-over rise absolute bottom-0 start-full z-50 ms-3 w-64 p-1.5">
                <div className="px-2.5 pb-2 pt-1.5">
                  <p className="truncate text-[15px] text-ink">{who.name}</p>
                  <p className="meta truncate" dir="ltr">
                    {who.email}
                  </p>
                </div>
                <div className="my-1 border-t border-line" />
                <UsageMenuItem />
                <div className="my-1 border-t border-line" />
                <MenuLink href="/account" icon={User} label={t("הפרופיל שלי")} />
                <MenuLink href="/settings" icon={Settings} label={t("הגדרות וחיבורים")} />
                <LanguageMenu />
                <div className="my-1 border-t border-line" />
                <form action={logout}>
                  <button className="flex h-10 w-full items-center gap-3 rounded-[10px] px-2.5 text-start text-[15px] text-ink-2 hover:bg-surface-2 hover:text-ink">
                    <LogOut className="h-5 w-5" strokeWidth={1.5} />
                    {t("יציאה")}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile and tablet top bar (RTL): the menu on the right, where its sheet opens; the business in the middle; help and the conversations on the left. */}
      <header className="glass sticky top-0 z-40 grid h-14 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-line px-3 lg:hidden" style={{ background: "color-mix(in srgb, var(--bg) 92%, transparent)" }}>
        <div className="flex items-center">
          <button onClick={() => setSheet(true)} className="btn btn-ghost btn-sm h-10 w-10 px-0" aria-label={t("תפריט")}>
            <Menu className="h-[22px] w-[22px]" strokeWidth={1.5} />
          </button>
        </div>
        <div className="min-w-0 max-w-[52vw] justify-self-center">
          <ConnectedAccount initial={assets} compact />
        </div>
        <div className="flex items-center justify-end gap-0.5">
          <button onClick={() => setHelp(true)} className="btn btn-ghost btn-sm h-10 w-10 px-0" aria-label={t("עזרה")}>
            <LifeBuoy className="h-[22px] w-[22px]" strokeWidth={1.5} />
          </button>
          <ConversationsButton onMikee={path.startsWith("/mikee")} unread={unread} />
        </div>
      </header>

      <div className={`fixed inset-0 z-50 lg:hidden ${sheet ? "" : "pointer-events-none"}`} aria-hidden={!sheet}>
        <div className={`absolute inset-0 bg-ink/30 transition-opacity duration-200 ${sheet ? "opacity-100" : "opacity-0"}`} onClick={() => setSheet(false)} />
        <div
          className={`absolute inset-y-0 start-0 flex w-[300px] flex-col bg-surface p-3 shadow-[var(--shadow-float)] transition-transform duration-300 ease-[var(--ease)] ${
            sheet ? "visible translate-x-0" : "invisible rtl:translate-x-full ltr:-translate-x-full"
          }`}
        >
          <div className="mb-3 flex items-center justify-between px-1.5">
            <span className="flex items-center gap-2.5">
              <MikeeAvatar size={28} />
              <span className="leading-tight">
                <span className="block text-[15px] font-medium">{t("מייקי")}</span>
                <span className="meta block">{who.business}</span>
              </span>
            </span>
            <button onClick={() => setSheet(false)} className="btn btn-ghost btn-sm px-2" aria-label={t("סגירה")}>
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex flex-col gap-0.5">
            {LINKS.map((l) => (
              <NavLink key={l.href} {...l} active={path.startsWith(l.href)} dot={waiting[l.href]} />
            ))}
          </nav>
          <div className="mt-auto flex flex-col gap-0.5 border-t border-line pt-2">
            <UsageMenuItem />
            <NavLink href="/settings" label="הגדרות וחיבורים" icon={Settings} active={settingsActive} />
            <NavLink href="/account" label="הפרופיל שלי" icon={User} active={path.startsWith("/account")} />
            <LanguageMenu className="h-[38px]" />
            <form action={logout}>
              <button className="flex h-[38px] w-full items-center gap-3 rounded-[10px] px-2.5 text-[15px] text-ink-2 hover:bg-surface-2">
                <LogOut className="h-[22px] w-[22px]" strokeWidth={1.5} /> {t("יציאה")}
              </button>
            </form>
          </div>
        </div>
      </div>

      <HelpPanel open={help} onClose={() => setHelp(false)} support={support} />
    </>
  );
}

/** Two speech bubbles, thin like the other icons. */
function ChatsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M14.5 9.5a5.5 5.5 0 1 0-10.3 2.7L3.5 15l2.9-.7a5.5 5.5 0 0 0 8.1-4.8Z" />
      <path d="M9.3 16.4a5.5 5.5 0 0 0 8.3 1.9l2.9.7-.7-2.8a5.5 5.5 0 0 0-3.9-8" />
    </svg>
  );
}

/** Opens the conversations list: in place on the conversations page, otherwise it goes there with the list open. */
function ConversationsButton({ onMikee, unread }: { onMikee: boolean; unread: boolean }) {
  const t = useT();
  const label = unread ? t("שיחות, יש חדש") : t("שיחות");
  const inner = (
    <>
      <ChatsIcon className="h-[22px] w-[22px]" />
      {unread && <span className="pop absolute start-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-bg bg-blue" aria-hidden />}
    </>
  );
  const cls = "btn btn-ghost btn-sm relative h-10 w-10 px-0";
  return onMikee ? (
    <button type="button" className={cls} aria-label={label} onClick={() => window.dispatchEvent(new Event("mikee:open-conversations"))}>
      {inner}
    </button>
  ) : (
    <Link href="/mikee#conversations" className={cls} aria-label={label}>
      {inner}
    </Link>
  );
}

function MenuLink({ href, icon: Icon, label }: { href: string; icon: typeof User; label: string }) {
  return (
    <Link href={href} className="flex h-10 items-center gap-3 rounded-[10px] px-2.5 text-[15px] text-ink-2 hover:bg-surface-2 hover:text-ink">
      <Icon className="h-5 w-5" strokeWidth={1.5} />
      {label}
    </Link>
  );
}
