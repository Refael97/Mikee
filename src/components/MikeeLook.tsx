"use client";

import { createContext, useContext } from "react";
import { DEFAULT_LOOK, type MikeeLook } from "@/lib/mikee-look";

const Ctx = createContext<MikeeLook>(DEFAULT_LOOK);

/** The look this business chose, for every Mikee on its screens. */
export function MikeeLookProvider({ look, children }: { look: MikeeLook; children: React.ReactNode }) {
  return <Ctx.Provider value={look}>{children}</Ctx.Provider>;
}

export const useMikeeLook = () => useContext(Ctx);
