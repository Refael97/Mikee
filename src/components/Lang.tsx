"use client";

import { createContext, useContext, useMemo } from "react";
import { DEFAULT_LANG, dirOf, localeOf, translator, type Lang, type T } from "@/lib/i18n";

const Ctx = createContext<Lang>(DEFAULT_LANG);

/** The interface language for every client component below; the root layout provides it from the cookie. */
export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <Ctx.Provider value={lang}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);

/** `const t = useT();` in a client component. */
export function useT(): T {
  const lang = useContext(Ctx);
  return useMemo(() => translator(lang), [lang]);
}

/** The Intl locale of the current language, for dates and numbers. */
export function useLocale(): string {
  return localeOf(useContext(Ctx));
}

export function useDir(): "rtl" | "ltr" {
  return dirOf(useContext(Ctx));
}
