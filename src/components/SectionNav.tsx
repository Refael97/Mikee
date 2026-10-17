"use client";

import { useEffect, useState } from "react";

/**
 * The page's sections as a list beside it: a click scrolls to one, and the section being read is the one
 * the list shows larger. Only on wide screens, where there is room beside the content.
 */
export function SectionNav({ items }: { items: { id: string; label: string }[] }) {
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    const pick = () => {
      // At the bottom of the page the last section counts, even when it is too short to reach the top.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) return setActive(items[items.length - 1]?.id);
      let current = items[0]?.id;
      for (const { id } of items) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= window.innerHeight * 0.3) current = id;
      }
      setActive(current);
    };
    pick();
    window.addEventListener("scroll", pick, { passive: true, capture: true });
    window.addEventListener("resize", pick);
    return () => {
      window.removeEventListener("scroll", pick, { capture: true });
      window.removeEventListener("resize", pick);
    };
  }, [items]);

  const go = (e: React.MouseEvent, id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
    setActive(id);
  };

  return (
    <nav aria-label="בעמוד הזה" className="sticky top-8 hidden lg:block">
      <ul className="space-y-1 border-s border-line">
        {items.map(({ id, label }) => {
          const on = id === active;
          return (
            <li key={id}>
              <a
                href={`#${id}`}
                onClick={(e) => go(e, id)}
                aria-current={on ? "location" : undefined}
                className={`-ms-px block border-s-2 py-1.5 ps-4 transition-all duration-[var(--dur-2)] ease-[var(--ease)] ${
                  on ? "border-ink text-[16px] font-medium text-ink" : "border-transparent text-[14px] text-ink-3 hover:text-ink-2"
                }`}
              >
                {label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
