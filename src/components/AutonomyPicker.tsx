"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CheckCheck, ChevronDown, Hand, ShieldCheck } from "lucide-react";
import { AUTONOMY, type Autonomy } from "@/lib/autonomy";

const ICON: Record<Autonomy, typeof Hand> = { every_step: Hand, important: ShieldCheck, final: CheckCheck };

/** How much Mikee asks before moving on, chosen right where she writes (like an AI assistant's approval mode). */
export function AutonomyPicker({ value, onChange }: { value: Autonomy; onChange: (a: Autonomy) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const current = AUTONOMY.find((a) => a.id === value) ?? AUTONOMY[1];
  const Icon = ICON[current.id];
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="מתי מייקי מבקש אישור"
        className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-[14.5px] transition-colors ${open ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
        <span className="max-sm:hidden">אישור {current.short}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-ink-3 transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={1.5} />
      </button>
      {open && (
        <div role="menu" className="pop-over rise absolute bottom-12 start-0 z-30 w-[min(340px,calc(100vw-48px))] p-1.5">
          <p className="px-3 pb-1.5 pt-2 text-[13.5px] text-ink-3">מתי מייקי מבקש ממך אישור?</p>
          {AUTONOMY.map((a) => {
            const I = ICON[a.id];
            const on = a.id === value;
            return (
              <button
                key={a.id}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                onClick={() => {
                  onChange(a.id);
                  setOpen(false);
                }}
                className="flex w-full items-start gap-3 rounded-[10px] px-3 py-2.5 text-start hover:bg-surface-2"
              >
                <I className="mt-0.5 h-5 w-5 shrink-0 text-ink-2" strokeWidth={1.5} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] text-ink">{a.label}</span>
                  <span className="block text-[14px] text-ink-3">{a.description}</span>
                </span>
                {on && <Check className="mt-1 h-4 w-4 shrink-0 text-ink" strokeWidth={2} />}
              </button>
            );
          })}
          <p className="mx-3 mt-1 border-t border-line pb-1.5 pt-2 text-[13px] text-ink-3">בכל רמה, כסף ופרסום יוצאים רק באישור שלך, והתקציב החודשי לא נחצה.</p>
        </div>
      )}
    </div>
  );
}
