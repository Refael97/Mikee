"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * One rule for scrolling between pages: a new page starts at its top; going back returns to where that page
 * was left; a filter or tab on the same page (only the query changes) does not move the view. The chat keeps
 * its own rule (it opens at the latest message), so conversation pages are left to it.
 */
const positions = new Map<string, number>();

export function NavScroll() {
  const path = usePathname();
  const popped = useRef(false);
  const current = useRef(path);

  useEffect(() => {
    // The browser's own restoration would fight streamed content; this component restores instead.
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    const onPop = () => (popped.current = true);
    const onScroll = () => positions.set(current.current, window.scrollY);
    window.addEventListener("popstate", onPop);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  useLayoutEffect(() => {
    current.current = path;
    const back = popped.current;
    popped.current = false;
    if (path.startsWith("/mikee/")) return;
    const target = back ? (positions.get(path) ?? 0) : 0;
    // Never return what scrollTo returns: an effect's return value is its cleanup, and some browsers and
    // extensions make scrollTo return a value, which React then tries to call (a crash on every page).
    if (!target) {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      return;
    }
    // Content streams in after the frame: try until the page is tall enough, for up to a second.
    let tries = 0;
    const restore = () => {
      window.scrollTo({ top: target, behavior: "instant" as ScrollBehavior });
      if (Math.abs(window.scrollY - target) > 2 && tries++ < 30) requestAnimationFrame(restore);
    };
    restore();
  }, [path]);

  return null;
}
