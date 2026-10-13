"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Building2, MessageCircle, Settings } from "lucide-react";

const LINKS = [
  { href: "/mikee", label: "מייקי", icon: MessageCircle },
  { href: "/results", label: "תוצאות", icon: BarChart3 },
  { href: "/brand", label: "העסק", icon: Building2 },
];

/** Floating glass bar: brand on one side, a segmented control in the middle, settings on the other. */
export function Nav({ business }: { business: string }) {
  const path = usePathname();
  return (
    <header className="pointer-events-none sticky top-0 z-40 bg-gradient-to-b from-bg via-bg/80 to-transparent px-3 pb-5 pt-3 sm:px-5 sm:pt-4">
      <div className="pointer-events-auto mx-auto flex max-w-5xl items-center justify-between gap-3">
        <Link href="/mikee" aria-label="Mikee" className="glass flex h-11 shrink-0 items-center gap-2.5 rounded-full px-2.5 shadow-[var(--float-sm)] sm:px-3.5 sm:pe-5">
          <span className="orb h-6 w-6" />
          <span className="hidden text-[1.05rem] font-semibold tracking-tight sm:inline">Mikee</span>
          <span className="hidden max-w-40 truncate text-sm text-ink-3 md:inline">{business}</span>
        </Link>

        <nav className="glass flex h-11 items-center gap-0.5 rounded-full p-1 shadow-[var(--float-sm)]">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm transition-all duration-300 sm:px-4 ${
                  active ? "bg-ink text-on-ink shadow-sm" : "text-ink-2 hover:text-ink"
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={2} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <Link
          href="/settings"
          aria-label="הגדרות"
          className={`glass flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-[var(--float-sm)] transition-colors ${
            path.startsWith("/settings") ? "text-ink" : "text-ink-2 hover:text-ink"
          }`}
        >
          <Settings className="h-[18px] w-[18px]" strokeWidth={2} />
        </Link>
      </div>
    </header>
  );
}
