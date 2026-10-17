"use client";

import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, Languages } from "lucide-react";
import { LANG_NAMES, LANGS } from "@/lib/i18n";
import { setLanguage } from "@/lib/i18n/actions";
import { useDir, useLang, useT } from "./Lang";

/**
 * The language row of the account menu: "Language · עברית" with an arrow; it opens to the two languages,
 * the current one marked. Picking one submits and the whole app re-renders in that language.
 */
export function LanguageMenu({ className = "" }: { className?: string }) {
  const t = useT();
  const lang = useLang();
  const dir = useDir();
  const [open, setOpen] = useState(false);
  const Arrow = dir === "rtl" ? ChevronLeft : ChevronRight;
  const row = `flex h-10 w-full items-center gap-3 rounded-[10px] px-2.5 text-start text-[15px] text-ink-2 hover:bg-surface-2 hover:text-ink ${className}`;
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={row}>
        <Languages className="h-5 w-5" strokeWidth={1.5} />
        <span className="flex-1">{t("שפה")}</span>
        <span className="meta">{LANG_NAMES[lang]}</span>
        <Arrow className={`h-4 w-4 text-ink-3 transition-transform ${open ? (dir === "rtl" ? "-rotate-90" : "rotate-90") : ""}`} strokeWidth={1.5} />
      </button>
      {open && (
        <form action={setLanguage} className="rise ps-7">
          {LANGS.map((l) => (
            <button
              key={l}
              name="lang"
              value={l}
              type="submit"
              aria-pressed={l === lang}
              className="flex h-9 w-full items-center gap-3 rounded-[10px] px-2.5 text-start text-[15px] text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              <span lang={l} className="flex-1">
                {LANG_NAMES[l]}
              </span>
              {l === lang && <Check className="h-4 w-4 text-ink" strokeWidth={2} />}
            </button>
          ))}
        </form>
      )}
    </div>
  );
}
