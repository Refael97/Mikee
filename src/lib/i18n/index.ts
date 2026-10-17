import { en } from "./en";

/**
 * The language of the interface. Hebrew is the source: every string in the code is written in Hebrew and is
 * its own key; `en.ts` maps each one to English. A key without an English entry falls back to the Hebrew,
 * so nothing ever disappears from the screen. Conversation content, campaigns and products are never
 * translated: only the frame around them.
 */
export type Lang = "he" | "en";

export const LANGS: readonly Lang[] = ["he", "en"];
export const DEFAULT_LANG: Lang = "he";
export const LANG_COOKIE = "mikee_lang";

export const isLang = (v: unknown): v is Lang => v === "he" || v === "en";

export const dirOf = (lang: Lang): "rtl" | "ltr" => (lang === "he" ? "rtl" : "ltr");

/** The Intl locale for dates and numbers in this language. */
export const localeOf = (lang: Lang): string => (lang === "he" ? "he-IL" : "en-GB");

export const LANG_NAMES: Record<Lang, string> = { he: "עברית", en: "English" };

export type Vars = Record<string, string | number>;

function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Translate one Hebrew string to the given language, filling `{name}` placeholders. */
export function translate(lang: Lang, key: string, vars?: Vars): string {
  const text = lang === "en" ? (en[key] ?? key) : key;
  return fill(text, vars);
}

export type T = (key: string, vars?: Vars) => string;

export const translator = (lang: Lang): T => (key, vars) => translate(lang, key, vars);
