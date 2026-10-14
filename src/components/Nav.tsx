"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BarChart3, ChevronsUpDown, Images, LifeBuoy, LogOut, Megaphone, Menu, MessagesSquare, Settings, Store, User, X } from "lucide-react";
import { logout } from "@/app/login/actions";
import { HelpPanel } from "./HelpPanel";
import { MikeeAvatar } from "@/components/MikeeAvatar";

export const LINKS = [
  { href: "/mikee", label: "שיחות", icon: MessagesSquare },
  { href: "/results", label: "תוצאות", icon: BarChart3 },
  { href: "/campaigns", label: "קמפיינים", icon: Megaphone },
  { href: "/library", label: "ספרייה", icon: Images },
  { href: "/brand", label: "העסק", icon: Store },
];

type Who = { name: string; email: string; business: string };

function NavLink({ href, label, icon: Icon, active, compact }: { href: string; label: string; icon: typeof Store; active: boolean; compact?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={compact ? label : undefined}
      className={`group flex h-9 items-center gap-2.5 rounded-[6px] px-2.5 text-[15px] font-medium transition-colors ${
        active ? "bg-brand-tint text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
      } ${compact ? "justify-center xl:justify-start" : ""}`}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
      <span className={compact ? "hidden xl:inline" : ""}>{label}</span>
    </Link>
  );
}

/**
 * The app frame. Desktop: a sidebar on the start side (labels from 1280px, an icon rail between 1024 and 1280).
 * Mobile: a top bar with the current section and a menu sheet.
 */
export function Nav({ who, support }: { who: Who; support: { email?: string; whatsapp?: string } }) {
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
      {/* Desktop sidebar */}
      <aside className="sticky top-0 z-40 hidden h-dvh w-16 shrink-0 flex-col border-e border-line bg-shell px-2.5 py-3 lg:flex xl:w-[232px] xl:px-3">
        <Link href="/mikee" className="mb-4 flex h-10 items-center gap-2.5 rounded-[6px] px-1.5 hover:bg-surface-2" aria-label="מייקי">
          <MikeeAvatar size={28} />
          <span className="hidden min-w-0 leading-tight xl:block">
            <span className="block text-[15px] font-semibold">מייקי</span>
            <span className="block truncate text-[12.5px] text-ink-3">{who.business}</span>
          </span>
        </Link>

        <nav className="flex flex-col gap-0.5" aria-label="ניווט ראשי">
          {LINKS.map((l) => (
            <NavLink key={l.href} {...l} active={path.startsWith(l.href)} compact />
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-0.5">
          <button
            onClick={() => setHelp(true)}
            title="עזרה"
            className="flex h-9 items-center justify-center gap-2.5 rounded-[6px] px-2.5 text-[15px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink xl:justify-start"
          >
            <LifeBuoy className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
            <span className="hidden xl:inline">עזרה</span>
          </button>
          <NavLink href="/settings" label="הגדרות" icon={Settings} active={settingsActive} compact />

          <div ref={menuRef} className="relative mt-2 border-t border-line pt-2">
            <button
              onClick={() => setMenu((m) => !m)}
              aria-expanded={menu}
              aria-label="החשבון שלי"
              className="flex w-full items-center justify-center gap-2.5 rounded-[6px] p-1.5 text-start hover:bg-surface-2 xl:justify-start"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-bg">{initial}</span>
              <span className="hidden min-w-0 flex-1 xl:block">
                <span className="block truncate text-[14px] font-medium">{who.name}</span>
                <span className="block truncate text-[12px] text-ink-3" dir="ltr">
                  {who.email}
                </span>
              </span>
              <ChevronsUpDown className="hidden h-4 w-4 text-ink-3 xl:block" strokeWidth={1.75} />
            </button>
            {menu && (
              <div className="pop-over rise absolute bottom-full start-0 z-50 mb-2 w-56 p-1">
                <MenuLink href="/account" icon={User} label="הפרופיל שלי" />
                <MenuLink href="/settings" icon={Settings} label="הגדרות וחיבורים" />
                <div className="my-1 border-t border-line" />
                <form action={logout}>
                  <button className="flex w-full items-center gap-2.5 rounded-[5px] px-2.5 py-1.5 text-start text-[14.5px] text-ink-2 hover:bg-surface-2 hover:text-ink">
                    <LogOut className="h-4 w-4" strokeWidth={1.75} />
                    יציאה
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="glass sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-line px-4 lg:hidden">
        <Link href="/mikee" aria-label="מייקי" className="flex items-center gap-2">
          <MikeeAvatar size={28} />
        </Link>
        <span className="min-w-0 leading-tight">
          <span className="block text-[15px] font-semibold">מייקי</span>
          <span className="block truncate text-[12px] text-ink-3">{who.business}</span>
        </span>
        <div className="ms-auto flex items-center gap-1">
          <button onClick={() => setHelp(true)} className="btn btn-ghost btn-sm px-2" aria-label="עזרה">
            <LifeBuoy className="h-5 w-5" strokeWidth={1.75} />
          </button>
          <button onClick={() => setSheet(true)} className="btn btn-ghost btn-sm px-2" aria-label="תפריט">
            <Menu className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>
      </header>

      <div className={`fixed inset-0 z-50 lg:hidden ${sheet ? "" : "pointer-events-none"}`} aria-hidden={!sheet}>
        <div className={`absolute inset-0 bg-ink/30 transition-opacity duration-200 ${sheet ? "opacity-100" : "opacity-0"}`} onClick={() => setSheet(false)} />
        <div
          className={`absolute inset-y-0 start-0 flex w-[280px] flex-col bg-shell p-3 shadow-[var(--shadow-float)] transition-transform duration-300 ease-[var(--ease)] ${
            sheet ? "visible translate-x-0" : "invisible translate-x-full"
          }`}
        >
          <div className="mb-3 flex items-center justify-between px-1.5">
            <span className="flex items-center gap-2.5">
              <MikeeAvatar size={28} />
              <span className="leading-tight">
                <span className="block text-[15px] font-semibold">מייקי</span>
                <span className="block text-[12.5px] text-ink-3">{who.business}</span>
              </span>
            </span>
            <button onClick={() => setSheet(false)} className="btn btn-ghost btn-sm px-2" aria-label="סגירה">
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex flex-col gap-0.5">
            {LINKS.map((l) => (
              <NavLink key={l.href} {...l} active={path.startsWith(l.href)} />
            ))}
          </nav>
          <div className="mt-auto flex flex-col gap-0.5 border-t border-line pt-2">
            <NavLink href="/settings" label="הגדרות וחיבורים" icon={Settings} active={settingsActive} />
            <NavLink href="/account" label="הפרופיל שלי" icon={User} active={path.startsWith("/account")} />
            <form action={logout}>
              <button className="flex h-9 w-full items-center gap-2.5 rounded-[6px] px-2.5 text-[15px] font-medium text-ink-2 hover:bg-surface-2">
                <LogOut className="h-[18px] w-[18px]" strokeWidth={1.75} /> יציאה
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
    <Link href={href} className="flex items-center gap-2.5 rounded-[5px] px-2.5 py-1.5 text-[14.5px] text-ink-2 hover:bg-surface-2 hover:text-ink">
      <Icon className="h-4 w-4" strokeWidth={1.75} />
      {label}
    </Link>
  );
}
