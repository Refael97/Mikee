"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

/**
 * Tabs that move between views of one page (a period, a filter). The choice is marked the moment it is
 * clicked; the page keeps its place and only the part that depends on the data loads. No full reload.
 * Quick clicks: the last one wins. Once the navigations settle, if the page shows another view than the
 * last choice (an earlier answer arrived last), it is asked for again.
 */
export function Segmented({ items, active }: { items: { href: string; label: string; key: string }[]; active: string }) {
  const router = useRouter();
  const [chosen, setChosen] = useState(active);
  const [pending, start] = useTransition();
  const lastClick = useRef<string | null>(null);

  useEffect(() => {
    if (pending) return;
    const want = lastClick.current;
    if (want && want !== active) {
      const href = items.find((x) => x.key === want)?.href;
      if (href) start(() => router.replace(href, { scroll: false }));
      return;
    }
    lastClick.current = null;
    setChosen(active);
  }, [active, pending, items, router]);

  return (
    <nav className="inline-flex flex-wrap gap-1">
      {items.map((x) => (
        <Link
          key={x.key}
          href={x.href}
          scroll={false}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            setChosen(x.key);
            lastClick.current = x.key;
            start(() => router.push(x.href, { scroll: false }));
          }}
          aria-current={x.key === chosen ? "page" : undefined}
          className="tab"
        >
          {x.label}
        </Link>
      ))}
    </nav>
  );
}
