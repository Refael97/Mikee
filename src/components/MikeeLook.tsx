"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { DEFAULT_LOOK, isLook, THEME_EVENT, type MikeeLook } from "@/lib/mikee-look";

const Ctx = createContext<MikeeLook>(DEFAULT_LOOK);

/**
 * The colour this user chose, for every Mikee on their screens. A save on the account page fires THEME_EVENT,
 * so every avatar changes at once, before the server render catches up.
 */
export function MikeeLookProvider({ look, children }: { look: MikeeLook; children: React.ReactNode }) {
  const [current, setCurrent] = useState(look);
  useEffect(() => setCurrent(look), [look]);
  useEffect(() => {
    const h = (e: Event) => {
      const next = (e as CustomEvent<unknown>).detail;
      if (isLook(next)) setCurrent(next);
    };
    window.addEventListener(THEME_EVENT, h);
    return () => window.removeEventListener(THEME_EVENT, h);
  }, []);
  return <Ctx.Provider value={current}>{children}</Ctx.Provider>;
}

export const useMikeeLook = () => useContext(Ctx);
