import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { DEFAULT_LANG, isLang, LANG_COOKIE, localeOf, translator, type Lang, type T } from "./index";

/** The interface language of this request, from the cookie the language menu sets. */
export const getLang = cache(async (): Promise<Lang> => {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(v) ? v : DEFAULT_LANG;
});

/** `const t = await getT();` in a server component or action. */
export async function getT(): Promise<T> {
  return translator(await getLang());
}

/** The Intl locale of this request's language, for dates and numbers. */
export async function getLocale(): Promise<string> {
  return localeOf(await getLang());
}
