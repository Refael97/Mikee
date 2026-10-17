"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import {
  type DateRange,
  type RangePreset,
  MONTHS,
  RANGE_PRESETS,
  longDate,
  monthGrid,
  presetRange,
  rangeLabel,
  rangeQuery,
  shortDate,
} from "@/lib/date-range";

const WEEKDAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const WEEKDAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

/** The month before or after `ym` ([year, month 0 to 11]). */
const shift = ([y, m]: [number, number], by: number): [number, number] => {
  const t = y * 12 + m + by;
  return [Math.floor(t / 12), t % 12];
};
const monthOf = (d: string): [number, number] => [Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1];

/**
 * Ads Manager's date picker: presets on one side, two months on the other, and the range applies only on
 * "עדכן". Picking two days on the calendar makes a custom range; picking a preset fills the calendar with its
 * days. The draft starts again from the applied range every time the panel opens.
 */
export function DateRangePicker({ value, today, tz, path, extra = "" }: { value: DateRange; today: string; tz: string; path: string; extra?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>(value);
  // While choosing the second day of a custom range, the first one waits here.
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState<[number, number]>(monthOf(value.until));
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const reset = () => {
    setDraft(value);
    setAnchor(null);
    setHover(null);
    setView(monthOf(value.until));
  };
  const close = (focus = true) => {
    setOpen(false);
    if (focus) trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("mousedown", outside);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", outside);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const choosePreset = (key: RangePreset) => {
    const days = presetRange(key, today);
    setDraft({ preset: key, ...days });
    setAnchor(null);
    if (key !== "maximum") setView(monthOf(days.until));
  };

  const chooseDay = (d: string) => {
    if (!anchor) {
      setAnchor(d);
      setDraft({ since: d, until: d });
      return;
    }
    const [since, until] = anchor <= d ? [anchor, d] : [d, anchor];
    setDraft({ since, until });
    setAnchor(null);
    setHover(null);
  };

  const apply = () => {
    const chosen = draft;
    setOpen(false);
    trigger.current?.focus();
    if (rangeQuery(chosen) === rangeQuery(value)) return;
    start(() => router.push(`${path}?${rangeQuery(chosen)}${extra}`));
  };

  // While the second day is being chosen, the range follows the pointer.
  const [lo, hi] = anchor && hover ? (anchor <= hover ? [anchor, hover] : [hover, anchor]) : [draft.since, draft.until];
  const showRange = draft.preset !== "maximum" || !!anchor;
  const months = [shift(view, -1), view];
  const canNext = `${view[0]}-${String(view[1] + 1).padStart(2, "0")}` < today.slice(0, 7);

  return (
    <div ref={ref} className="relative max-w-full">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close(false) : (reset(), setOpen(true)))}
        className={`field flex h-10 max-w-full items-center gap-2 !py-0 text-[14.5px] ${pending ? "opacity-70" : ""}`}
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-ink-2" strokeWidth={1.5} />
        <span className="min-w-0 truncate">{rangeLabel(value)}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`} strokeWidth={1.5} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="בחירת טווח תאריכים"
          className="fixed inset-x-3 top-20 z-50 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-[var(--radius)] bg-surface shadow-[var(--shadow-float)] sm:absolute sm:inset-x-auto sm:end-0 sm:top-full sm:mt-2 sm:max-h-none sm:w-[760px] sm:overflow-visible"
        >
          <div className="flex flex-col sm:flex-row">
            <div role="radiogroup" aria-label="טווחים מוכנים" className="flex gap-1 overflow-x-auto border-b border-line p-3 sm:w-[210px] sm:shrink-0 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-e sm:py-4">
              {RANGE_PRESETS.map((p) => {
                const on = draft.preset === p.key && !anchor;
                return (
                  <button
                    key={p.key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => choosePreset(p.key)}
                    className={`flex h-9 shrink-0 items-center gap-2.5 rounded-[var(--radius-item)] px-2.5 text-start text-[14.5px] transition-colors hover:bg-surface-2 ${on ? "font-medium text-ink" : "text-ink-2"}`}
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on ? "border-ink" : "border-line-strong"}`}>
                      {on && <span className="h-2 w-2 rounded-full bg-ink" />}
                    </span>
                    <span className="whitespace-nowrap">{p.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="min-w-0 flex-1 p-4">
              <div className="flex items-center justify-between">
                <button type="button" aria-label="החודש הקודם" onClick={() => setView((v) => shift(v, -1))} className="btn btn-quiet btn-sm !px-2">
                  <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
                </button>
                <button type="button" aria-label="החודש הבא" disabled={!canNext} onClick={() => setView((v) => shift(v, 1))} className="btn btn-quiet btn-sm !px-2 disabled:opacity-30">
                  <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </div>

              <div className="-mt-7 grid gap-6 sm:grid-cols-2">
                {months.map(([y, m], i) => (
                  <div key={`${y}-${m}`} className={i === 0 ? "hidden sm:block" : ""}>
                    <p className="mb-3 text-center text-[15px] font-medium">
                      {MONTHS[m]} {y}
                    </p>
                    <div className="grid grid-cols-7 text-center text-[12.5px] text-ink-3">
                      {WEEKDAYS.map((w, k) => (
                        <abbr key={w} title={WEEKDAY_NAMES[k]} className="pb-1.5 no-underline">
                          {w}
                        </abbr>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-y-1" onMouseLeave={() => setHover(null)}>
                      {monthGrid(y, m).map((d, k) => {
                        if (!d) return <span key={k} />;
                        const future = d > today;
                        const edge = showRange && (d === lo || d === hi);
                        const inside = showRange && d > lo && d < hi;
                        return (
                          <button
                            key={d}
                            type="button"
                            disabled={future}
                            aria-label={longDate(d)}
                            aria-pressed={edge}
                            onClick={() => chooseDay(d)}
                            onMouseEnter={() => anchor && setHover(d)}
                            className={`num h-9 text-[14px] transition-colors disabled:text-ink-3/50 ${
                              edge
                                ? "rounded-[var(--radius-tile)] bg-ink font-medium text-on-brand"
                                : inside
                                  ? "bg-info-tint text-ink"
                                  : `rounded-[var(--radius-tile)] ${future ? "" : "hover:bg-surface-2"} ${d === today ? "font-medium text-info" : "text-ink"}`
                            }`}
                          >
                            {Number(d.slice(8))}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2 text-[14px]">
                <span className="field !h-9 !w-auto flex-1 !py-0 leading-9" aria-label="מתאריך">
                  {draft.preset === "maximum" && !anchor ? "כל התקופה" : shortDate(lo)}
                </span>
                <span className="text-ink-3">עד</span>
                <span className="field !h-9 !w-auto flex-1 !py-0 leading-9" aria-label="עד תאריך">
                  {draft.preset === "maximum" && !anchor ? "היום" : shortDate(hi)}
                </span>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[13px] text-ink-3">{tz === "Asia/Jerusalem" ? "התאריכים לפי שעון ישראל" : `התאריכים לפי אזור הזמן ${tz}`}</p>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => close()}>
                    ביטול
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={apply}>
                    עדכן
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
