"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Building2, MessageCircle, Settings } from "lucide-react";

const LINKS = [
  { href: "/mikee", label: "מייקי", icon: MessageCircle },
  { href: "/results", label: "תוצאות", icon: BarChart3 },
  { href: "/brand", label: "העסק", icon: Building2 },
];

/** Floating glass bar: Mikee on one side, a segmented control in the middle, settings on the other. */
export function Nav({ business }: { business: string }) {
  const path = usePathname();
  return (
    <header className="pointer-events-none sticky top-0 z-40 bg-gradient-to-b from-bg via-bg/80 to-transparent px-5 pb-5 pt-3 sm:pt-4">
      <div className="pointer-events-auto mx-auto flex max-w-[1160px] items-center justify-between gap-2 sm:gap-3">
        <Link href="/mikee" aria-label="Mikee" className="glass flex h-12 w-12 shrink-0 items-center justify-center gap-2.5 rounded-[26px] shadow-[var(--shadow)] sm:w-auto sm:justify-start sm:px-3 sm:pe-5">
          <span className="orb w-7" />
          <span className="hidden text-[18px] font-semibold sm:inline">Mikee</span>
          <span className="hidden max-w-40 truncate text-[15px] text-ink-3 md:inline">{business}</span>
        </Link>

        <nav className="glass flex h-12 items-center gap-1 rounded-[26px] p-1.5 shadow-[var(--shadow)]">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[18px] px-3.5 text-[15px] font-medium transition-colors duration-200 sm:px-4 ${
                  active ? "bg-brand-tint text-brand" : "text-ink-2 hover:text-ink"
                }`}
              >
                <Icon className="hidden h-4 w-4 sm:block" strokeWidth={2} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <Link
          href="/settings"
          aria-label="הגדרות"
          className={`glass flex h-12 w-12 shrink-0 items-center justify-center rounded-[26px] shadow-[var(--shadow)] transition-colors ${
            path.startsWith("/settings") ? "text-brand" : "text-ink-2 hover:text-ink"
          }`}
        >
          <Settings className="h-[19px] w-[19px]" strokeWidth={2} />
        </Link>
      </div>
    </header>
  );
}
