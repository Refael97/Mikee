"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BarChart3, Images, Inbox, LifeBuoy, LogOut, Megaphone, Menu, MessagesSquare, Settings, Store, User, X } from "lucide-react";
import { logout } from "@/app/login/actions";
import { HelpPanel } from "./HelpPanel";
import { MikeeAvatar } from "@/components/MikeeAvatar";

export const LINKS = [
  { href: "/mikee", label: "שיחות", icon: MessagesSquare },
  { href: "/results", label: "תוצאות", icon: BarChart3 },
  { href: "/campaigns", label: "קמפיינים", icon: Megaphone },
  { href: "/library", label: "ספרייה", icon: Images },
  { href: "/inbox", label: "הודעות", icon: Inbox },
  { href: "/brand", label: "העסק", icon: Store },
];

type Who = { name: string; email: string; business: string };

function NavLink({ href, label, icon: Icon, active, compact, dot }: { href: string; label: string; icon: typeof Store; active: boolean; compact?: boolean; dot?: boolean }) {
  // Desktop: an icon in the rail, its name on hover. Mobile sheet: icon and name in a row.
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      title={compact ? label : undefined}
      className={
        compact
          ? `relative flex h-12 w-12 items-center justify-center rounded-[14px] transition-colors ${active ? "bg-black/[.06] text-ink dark:bg-white/[.08]" : "text-ink-2 hover:bg-black/[.04] hover:text-ink dark:hover:bg-white/[.05]"}`
          : `flex h-[38px] items-center gap-3 rounded-[10px] px-2.5 text-[17px] transition-colors ${active ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`
      }
    >
      <Icon className="h-[22px] w-[22px] shrink-0" strokeWidth={1.5} />
      {!compact && <span>{label}</span>}
      {dot && <span className={`h-2 w-2 rounded-full bg-blue ${compact ? "absolute end-2.5 top-2.5" : "ms-auto"}`} aria-label="ממתין לך" />}
    </Link>
  );
}

/**
 * The app frame. Desktop: a sidebar on the start side (labels from 1280px, an icon rail between 1024 and 1280).
 * Mobile: a top bar with the current section and a menu sheet.
 */
export function Nav({ who, support, waiting = {} }: { who: Who; support: { email?: string; whatsapp?: string }; waiting?: Record<string, boolean> }) {
  const path = usePathname();
  const [sheet, setSheet] = useState(false);
  const [menu, setMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
        <Link href="/mikee" className="mb-3 flex h-12 w-12 items-center justify-center rounded-[14px] hover:bg-black/[.04]" aria-label="מייקי" title={`מייקי · ${who.business}`}>
          <MikeeAvatar size={32} />
        </Link>

        <nav className="flex flex-col items-center gap-1" aria-label="ניווט ראשי">
          {LINKS.map((l) => (
            <NavLink key={l.href} {...l} active={path.startsWith(l.href)} dot={waiting[l.href]} compact />
          ))}
        </nav>

        <div className="mt-auto flex flex-col items-center gap-1">
          <button
            onClick={() => setHelp(true)}
            title="עזרה"
            aria-label="עזרה"
            className="flex h-12 w-12 items-center justify-center rounded-[14px] text-ink-2 transition-colors hover:bg-black/[.04] hover:text-ink dark:hover:bg-white/[.05]"
          >
            <LifeBuoy className="h-[22px] w-[22px]" strokeWidth={1.5} />
          </button>
          <NavLink href="/settings" label="הגדרות" icon={Settings} active={settingsActive} compact />

          <div ref={menuRef} className="relative mt-2">
            <button
              onClick={() => setMenu((m) => !m)}
              aria-expanded={menu}
              aria-label="החשבון שלי"
              title={who.name}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-[15px] font-normal text-ink-2 transition-colors hover:text-ink"
            >
              {initial}
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
                <MenuLink href="/account" icon={User} label="הפרופיל שלי" />
                <MenuLink href="/settings" icon={Settings} label="הגדרות וחיבורים" />
                <div className="my-1 border-t border-line" />
                <form action={logout}>
                  <button className="flex h-10 w-full items-center gap-3 rounded-[10px] px-2.5 text-start text-[17px] text-ink-2 hover:bg-surface-2 hover:text-ink">
                    <LogOut className="h-5 w-5" strokeWidth={1.5} />
                    יציאה
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="glass sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-line px-4 lg:hidden" style={{ background: "color-mix(in srgb, var(--bg) 92%, transparent)" }}>
        <Link href="/mikee" aria-label="מייקי" className="flex items-center gap-2">
          <MikeeAvatar size={28} />
        </Link>
        <span className="min-w-0 leading-tight">
          <span className="block text-[17px] font-medium">מייקי</span>
          <span className="meta block truncate text-[12.5px]">{who.business}</span>
        </span>
        <div className="ms-auto flex items-center gap-1">
          <button onClick={() => setHelp(true)} className="btn btn-ghost btn-sm px-2" aria-label="עזרה">
            <LifeBuoy className="h-5 w-5" strokeWidth={1.5} />
          </button>
          <button onClick={() => setSheet(true)} className="btn btn-ghost btn-sm px-2" aria-label="תפריט">
            <Menu className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>
      </header>

      <div className={`fixed inset-0 z-50 lg:hidden ${sheet ? "" : "pointer-events-none"}`} aria-hidden={!sheet}>
        <div className={`absolute inset-0 bg-ink/30 transition-opacity duration-200 ${sheet ? "opacity-100" : "opacity-0"}`} onClick={() => setSheet(false)} />
        <div
          className={`absolute inset-y-0 start-0 flex w-[300px] flex-col bg-surface p-3 shadow-[var(--shadow-float)] transition-transform duration-300 ease-[var(--ease)] ${
            sheet ? "visible translate-x-0" : "invisible translate-x-full"
          }`}
        >
          <div className="mb-3 flex items-center justify-between px-1.5">
            <span className="flex items-center gap-2.5">
              <MikeeAvatar size={28} />
              <span className="leading-tight">
                <span className="block text-[17px] font-medium">מייקי</span>
                <span className="meta block">{who.business}</span>
              </span>
            </span>
            <button onClick={() => setSheet(false)} className="btn btn-ghost btn-sm px-2" aria-label="סגירה">
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex flex-col gap-0.5">
            {LINKS.map((l) => (
              <NavLink key={l.href} {...l} active={path.startsWith(l.href)} dot={waiting[l.href]} />
            ))}
          </nav>
          <div className="mt-auto flex flex-col gap-0.5 border-t border-line pt-2">
            <NavLink href="/settings" label="הגדרות וחיבורים" icon={Settings} active={settingsActive} />
            <NavLink href="/account" label="הפרופיל שלי" icon={User} active={path.startsWith("/account")} />
            <form action={logout}>
              <button className="flex h-[38px] w-full items-center gap-3 rounded-[10px] px-2.5 text-[17px] text-ink-2 hover:bg-surface-2">
                <LogOut className="h-[22px] w-[22px]" strokeWidth={1.5} /> יציאה
              </button>
            </form>
          </div>
        </div>
      </div>

      <HelpPanel open={help} onClose={() => setHelp(false)} support={support} />
    </>
  );
}

function MenuLink({ href, icon: Icon, label }: { href: string; icon: typeof User; label: string }) {
  return (
    <Link href={href} className="flex h-10 items-center gap-3 rounded-[10px] px-2.5 text-[17px] text-ink-2 hover:bg-surface-2 hover:text-ink">
      <Icon className="h-5 w-5" strokeWidth={1.5} />
      {label}
    </Link>
  );
}
