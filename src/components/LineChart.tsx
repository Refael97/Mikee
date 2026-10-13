"use client";

import { useMemo, useRef, useState } from "react";

type Point = { date: string; value: number };

const dayLabel = (iso: string) => new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short" }).format(new Date(iso));

/**
 * A plain line chart for a daily series, read right to left like the page: day one on the right edge,
 * today on the left. Hovering (or touching) shows the day and its value.
 */
export function LineChart({ points, unit, height = 180 }: { points: Point[]; unit: string; height?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = height;
  const pad = { top: 12, bottom: 24 };
  const max = Math.max(1, ...points.map((p) => p.value));
  const nice = useMemo(() => {
    const step = Math.pow(10, Math.floor(Math.log10(max)));
    return Math.ceil(max / step) * step;
  }, [max]);
  const x = (i: number) => (points.length < 2 ? W / 2 : W - (i / (points.length - 1)) * W);
  const y = (v: number) => pad.top + (1 - v / nice) * (H - pad.top - pad.bottom);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = points.length ? `${line} L${x(points.length - 1)},${H - pad.bottom} L${x(0)},${H - pad.bottom} Z` : "";

  function onMove(clientX: number) {
    const r = box.current?.getBoundingClientRect();
    if (!r || points.length < 2) return;
    const rel = (r.right - clientX) / r.width;
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(rel * (points.length - 1)))));
  }

  if (!points.length) return <div className="flex items-center justify-center text-[14px] text-ink-3" style={{ height }}>עוד אין נתונים לחודש הזה</div>;
  const h = hover != null ? points[hover] : null;

  return (
    <div
      ref={box}
      className="relative select-none"
      onMouseMove={(e) => onMove(e.clientX)}
      onMouseLeave={() => setHover(null)}
      onTouchMove={(e) => onMove(e.touches[0].clientX)}
      onTouchEnd={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full" style={{ height }} role="img" aria-label={`${unit} ביום`}>
        <defs>
          <linearGradient id="lc-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--brand)" stopOpacity="0.14" />
            <stop offset="1" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((t) => (
          <line key={t} x1="0" x2={W} y1={y(nice * t)} y2={y(nice * t)} stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray={t === 0 ? undefined : "3 4"} />
        ))}
        <path d={area} fill="url(#lc-fill)" />
        <path d={line} fill="none" stroke="var(--brand)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {h && hover != null && <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={H - pad.bottom} stroke="var(--ink-3)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
      </svg>
      {h && hover != null && (
        <>
          <span className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-brand" style={{ left: `${(x(hover) / W) * 100}%`, top: y(h.value) }} />
          <div
            className="pop-over pointer-events-none absolute top-0 z-10 -translate-x-1/2 px-2.5 py-1.5 text-[13px] whitespace-nowrap"
            style={{ left: `${Math.min(88, Math.max(12, (x(hover) / W) * 100))}%` }}
          >
            <span className="text-ink-3">{dayLabel(h.date)}</span> · <span className="num font-semibold">{new Intl.NumberFormat("he-IL").format(h.value)}</span> {unit}
          </div>
        </>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between text-[12px] text-ink-3">
        <span>{dayLabel(points[0].date)}</span>
        <span>{dayLabel(points[points.length - 1].date)}</span>
      </div>
      <span className="num pointer-events-none absolute end-0 top-0 text-[12px] text-ink-3">{new Intl.NumberFormat("he-IL").format(nice)}</span>
    </div>
  );
}
