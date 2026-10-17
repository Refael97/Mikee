"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

type Option = [value: string, label: string];

/**
 * A select drawn by us instead of the browser: the arrow sits inside the field like the rest of the design,
 * and the list opens attached to the field (same width, joined border) rather than as a system popup.
 * Works inside a form (a hidden input carries the value under `name`) or controlled with value/onChange.
 */
export function Picker({
  name,
  options,
  value,
  defaultValue,
  onChange,
  label,
  className = "",
}: {
  name?: string;
  options: Option[];
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  label?: string;
  className?: string;
}) {
  const [inner, setInner] = useState(defaultValue ?? options[0]?.[0] ?? "");
  const current = value ?? inner;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();
  const chosen = options.find(([v]) => v === current) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const pick = (v: string) => {
    setInner(v);
    onChange?.(v);
    setOpen(false);
  };
  const show = () => {
    setActive(Math.max(0, options.findIndex(([v]) => v === current)));
    setOpen(true);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return show();
      setActive((i) => (i + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!open) return show();
      const o = options[active];
      if (o) pick(o[0]);
    } else if (e.key === "Tab") setOpen(false);
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      {name && <input type="hidden" name={name} value={current} />}
      <button
        type="button"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKey}
        className={`field flex items-center gap-2 text-start ${open ? "!rounded-b-none !border-blue !shadow-none" : ""}`}
      >
        <span dir="auto" className="min-w-0 flex-1 truncate text-start">
          {chosen?.[1] ?? ""}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`} strokeWidth={1.5} />
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-40 -mt-[1.5px] max-h-64 overflow-y-auto rounded-b-[12px] border-[1.5px] border-t-0 border-blue bg-surface py-1 shadow-[var(--shadow-float)]"
        >
          {options.map(([v, l], i) => (
            <li
              key={v}
              role="option"
              aria-selected={v === current}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(v)}
              className={`flex h-10 cursor-pointer items-center gap-2 px-3.5 text-[15px] ${i === active ? "bg-surface-2" : ""}`}
            >
              <span dir="auto" className="min-w-0 flex-1 truncate text-start">
                {l}
              </span>
              {v === current && <Check className="h-4 w-4 shrink-0 text-ink-2" strokeWidth={1.5} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
