"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LifeBuoy, LogOut, Menu, Settings, User, X } from "lucide-react";
import { logout } from "@/app/login/actions";
import { HelpPanel } from "./HelpPanel";

export const LINKS = [
  { href: "/mikee", label: "שיחות" },
  { href: "/results", label: "תוצאות" },
  { href: "/campaigns", label: "קמפיינים" },
  { href: "/library", label: "ספרייה" },
  { href: "/brand", label: "העסק" },
];

type Who = { name: string; email: string; business: string };

/** The top of every screen: Mikee and the business on one side, the sections, then help and the account. */
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

  const current = LINKS.find((l) => path.startsWith(l.href));
  const initial = who.name.trim().slice(0, 1);

  return (
    <>
      <header className="glass sticky top-0 z-40 border-b border-line">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-6 px-5">
          <Link href="/mikee" className="flex shrink-0 items-center gap-2.5" aria-label="מייקי">
            <span className="orb w-7" aria-hidden />
            <span className="serif text-[22px] font-medium leading-none">מייקי</span>
            <span className="hidden text-[15px] text-ink-3 md:inline">/ {who.business}</span>
          </Link>

          <nav className="hidden h-full items-stretch gap-1 lg:flex" aria-label="ניווט ראשי">
            {LINKS.map((l) => {
              const active = path.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex items-center px-3 text-[16px] font-semibold transition-colors ${active ? "text-ink" : "text-ink-2 hover:text-ink"}`}
                >
                  {l.label}
                  {active && <span className="absolute inset-x-3 -bottom-px h-[2px] bg-ink" />}
                </Link>
              );
            })}
          </nav>

          <span className="serif text-[19px] lg:hidden">{current?.label ?? ""}</span>

          <div className="ms-auto flex items-center gap-1.5">
            <button onClick={() => setHelp(true)} className="btn btn-ghost btn-sm gap-1.5 px-2.5" aria-label="עזרה">
              <LifeBuoy className="h-[18px] w-[18px]" strokeWidth={1.8} />
              <span className="hidden sm:inline">עזרה</span>
            </button>

            <div ref={menuRef} className="relative hidden lg:block">
              <button
                onClick={() => setMenu((m) => !m)}
                aria-expanded={menu}
                aria-label="החשבון שלי"
                className="flex h-9 w-9 items-center justify-center rounded-[7px] bg-ink text-[15px] font-semibold text-bg transition-transform active:translate-y-px"
              >
                {initial}
              </button>
              {menu && (
                <div className="pop-over rise absolute end-0 top-full z-50 mt-2 w-64 p-1.5">
                  <div className="border-b border-line px-3 pb-3 pt-2">
                    <div className="font-semibold">{who.name}</div>
                    <div className="truncate text-[14px] text-ink-3" dir="ltr">
                      {who.email}
                    </div>
                  </div>
                  <MenuLink href="/account" icon={User} label="הפרופיל שלי" />
                  <MenuLink href="/settings" icon={Settings} label="הגדרות וחיבורים" />
                  <form action={logout}>
                    <button className="flex w-full items-center gap-2.5 rounded-[6px] px-3 py-2 text-start text-[15px] text-ink-2 hover:bg-surface-2 hover:text-ink">
                      <LogOut className="h-4 w-4" strokeWidth={1.8} />
                      יציאה
                    </button>
                  </form>
                </div>
              )}
            </div>

            <button onClick={() => setSheet(true)} className="btn btn-ghost btn-sm px-2 lg:hidden" aria-label="תפריט">
              <Menu className="h-5 w-5" strokeWidth={1.8} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile: the whole menu on one sheet, like the index of a notebook. */}
      <div className={`fixed inset-0 z-50 bg-bg transition-opacity duration-200 lg:hidden ${sheet ? "opacity-100" : "pointer-events-none opacity-0"}`} aria-hidden={!sheet}>
        <div className="flex h-16 items-center justify-between border-b border-line px-5">
          <span className="flex items-center gap-2.5">
            <span className="orb w-7" />
            <span className="serif text-[22px]">מייקי</span>
          </span>
          <button onClick={() => setSheet(false)} className="btn btn-ghost btn-sm px-2" aria-label="סגירה">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="px-5 pt-4">
          {LINKS.map((l, i) => (
            <Link
              key={l.href}
              href={l.href}
              className="flex items-baseline gap-4 border-b border-line py-4"
              style={{ animation: sheet ? `rise 380ms var(--ease) ${i * 40}ms both` : undefined }}
            >
              <span className="num w-6 text-[14px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
              <span className={`serif text-[30px] leading-none ${path.startsWith(l.href) ? "marked" : ""}`}>{l.label}</span>
            </Link>
          ))}
        </nav>
        <div className="mt-6 space-y-1 px-5">
          <Link href="/account" className="flex items-center gap-3 py-2.5 text-[17px]">
            <User className="h-5 w-5 text-ink-2" strokeWidth={1.8} /> הפרופיל שלי
          </Link>
          <Link href="/settings" className="flex items-center gap-3 py-2.5 text-[17px]">
            <Settings className="h-5 w-5 text-ink-2" strokeWidth={1.8} /> הגדרות וחיבורים
          </Link>
          <form action={logout}>
            <button className="flex items-center gap-3 py-2.5 text-[17px] text-ink-2">
              <LogOut className="h-5 w-5" strokeWidth={1.8} /> יציאה
            </button>
          </form>
        </div>
        <p className="absolute inset-x-5 bottom-6 text-[14px] text-ink-3">
          מחובר בתור {who.name} · {who.business}
        </p>
      </div>

      <HelpPanel open={help} onClose={() => setHelp(false)} support={support} />
    </>
  );
}

function MenuLink({ href, icon: Icon, label }: { href: string; icon: typeof User; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-[6px] px-3 py-2 text-[15px] text-ink-2 hover:bg-surface-2 hover:text-ink">
      <Icon className="h-4 w-4" strokeWidth={1.8} />
      {label}
    </Link>
  );
}
