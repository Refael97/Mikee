"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { splitReplies, stripReplies } from "@/lib/replies";

export { splitReplies, stripReplies };

/** An image or video being created: a living dot grid with a diagonal band of light, like a canvas forming. */
export function MediaGenerating({ label = "יוצר תמונה", ratio = "4/5" }: { label?: string; ratio?: string }) {
  const phrases = [label, "מסדר את האור", "מלטש פרטים", "כמעט מוכן"];
  const phrase = useCycle(phrases, 2600);
  return (
    <div className="relative w-full overflow-hidden rounded-[8px] bg-surface-2" style={{ aspectRatio: ratio }} role="status" aria-label={label}>
      <div className="dot-grid absolute inset-0" />
      <div className="dot-grid-glow absolute inset-0" />
      <div className="dot-grid-lit absolute inset-0" />
      <span key={phrase} className="swap-in absolute bottom-3 start-3 rounded-[5px] border border-line bg-surface/90 px-2.5 py-1 text-[13.5px] font-semibold">
        <span className="shimmer">{phrase}…</span>
      </span>
    </div>
  );
}

/** Rotates through phrases on a timer. */
export function useCycle<T>(items: T[], ms: number): T {
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
    if (items.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % items.length), ms);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.join("|"), ms]);
  return items[i] ?? items[0];
}

/** What Mikee is doing, in words that change while the work goes on. */
const PHASES: Record<string, string[]> = {
  "חושב": ["חושב", "מבין מה צריך", "מתכנן את הצעד הבא"],
  "בודק את התוצאות": ["בודק את התוצאות", "משווה לשבוע שעבר", "מחפש מה בולט"],
  "מנתח את התוצאות": ["מנתח את התוצאות", "עובר על המודעות", "משווה תקופות", "מסכם את העיקר"],
  "כותב טקסטים": ["כותב טקסטים", "מנסה כמה כיוונים", "מלטש את הניסוח"],
  "עובד על הקמפיין": ["עובד על הקמפיין", "בודק את התקציב", "בוחר קהל", "מרכיב את המודעות"],
  "מכין ויז׳ואל": ["מכין ויז׳ואל", "עובר על התמונות הכי חזקות", "מתאים לפורמט"],
  "מכין פוסט": ["מכין פוסט", "כותב כיתוב", "בוחר תמונה", "מתזמן"],
  "קורא את האתר": ["קורא את האתר", "עובר על המוצרים", "לומד את הסגנון"],
  "מתחיל ללמוד את העסק": ["מתחיל ללמוד את העסק", "קורא את האתר", "עובר על הפוסטים", "בודק מה עבד בעבר"],
};

function Phrase({ base, className = "" }: { base: string; className?: string }) {
  const phrase = useCycle(PHASES[base] ?? [base], 2400);
  return (
    <span key={phrase} className={`swap-in inline-block ${className}`}>
      <span className="shimmer">{phrase}…</span>
    </span>
  );
}

export function StatusLine({ activity }: { activity: string | null }) {
  return (
    <div className="text-[16px] font-medium">
      <Phrase base={activity ?? "חושב"} />
    </div>
  );
}

export type Step = { name: string; label: string; state: "running" | "done" | "error" };

/** The steps of the current turn, each turning into a check as it completes. */
export function Steps({ steps }: { steps: Step[] }) {
  if (!steps.length) return null;
  return (
    <ul className="space-y-1.5">
      {steps.map((s, i) => (
        <li key={`${s.name}-${i}`} className="rise flex items-center gap-2.5 text-[15px]">
          {s.state === "running" ? (
            <span className="spin h-3.5 w-3.5 rounded-full border-[1.5px] border-ink/15 border-t-ink" />
          ) : (
            <span className={`pop flex h-4 w-4 items-center justify-center ${s.state === "done" ? "text-good" : "text-bad"}`}>
              <Check className="h-4 w-4" strokeWidth={2.6} />
            </span>
          )}
          {s.state === "running" ? <Phrase base={s.label} className="font-medium" /> : <span className="text-ink-2">{s.label}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Text that is still being written: each new word fades in from a soft blur. Words already on screen keep
 * their key, so only the newly arrived ones animate.
 */
export function LiveText({ text }: { text: string }) {
  const paragraphs = stripReplies(text).replace(/^#+\s*/gm, "").split(/\n{2,}/);
  let n = 0;
  let bold = false;
  return (
    <div className="space-y-2.5">
      {paragraphs.map((p, pi) => (
        <p key={pi}>
          {p.split(/(\s+)/).map((w) => {
            const key = n++;
            if (/^\s+$/.test(w)) return w.includes("\n") ? <br key={key} /> : " ";
            // **bold** can span several words: a marker opens or closes it.
            const opens = w.startsWith("**");
            const closes = w.length > 2 && w.endsWith("**");
            if (opens) bold = true;
            const strong = bold;
            if (closes || (opens && w.length > 2 && w.slice(2).includes("**"))) bold = false;
            return (
              <span key={key} className={`word-in ${strong ? "font-semibold text-ink" : ""}`}>
                {w.replace(/\*\*/g, "")}
              </span>
            );
          })}
        </p>
      ))}
    </div>
  );
}

export function QuickReplies({ replies, onPick }: { replies: string[]; onPick: (r: string) => void }) {
  if (!replies.length) return null;
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {replies.map((r, i) => (
        <button
          key={r}
          onClick={() => onPick(r)}
          style={{ animationDelay: `${120 + i * 70}ms` }}
          className="rise h-9 rounded-[7px] border border-line-strong bg-surface px-3.5 text-[15px] font-semibold text-ink transition-[transform,background-color,border-color] duration-150 hover:border-ink active:translate-y-px"
        >
          {r}
        </button>
      ))}
    </div>
  );
}
