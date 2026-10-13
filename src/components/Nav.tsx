"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/mikee", label: "מייקי" },
  { href: "/results", label: "תוצאות" },
  { href: "/brand", label: "העסק שלי" },
  { href: "/settings", label: "הגדרות" },
];

export function Nav({ business }: { business: string }) {
  const path = usePathname();
  return (
    <header className="glass sticky top-0 z-30 border-b border-line">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/mikee" className="flex items-center gap-2.5">
          <span className="orb h-6 w-6" />
          <span className="text-lg font-semibold tracking-tight">Mikee</span>
          <span className="hidden text-sm text-ink-3 sm:inline">· {business}</span>
        </Link>
        <nav className="flex items-center gap-0.5 text-sm sm:gap-1">
          {LINKS.map((l) => {
            const active = path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`whitespace-nowrap rounded-full px-2.5 py-1.5 transition-colors sm:px-3 ${active ? "bg-ink text-bg" : "text-ink-2 hover:text-ink"}`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
