"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Award,
  ArrowRight,
  BookOpen,
  Briefcase,
  ChartLine,
  Check,
  Clapperboard,
  Compass,
  Ellipsis,
  Heart,
  Lightbulb,
  Megaphone,
  MessageCircle,
  Share2,
  ShoppingBag,
  ShoppingCart,
  Sprout,
  Store,
  TrendingDown,
  TrendingUp,
  UserRound,
  Users,
  Wrench,
} from "lucide-react";
import { saveIntake } from "@/lib/actions";
import { BUDGET_STOPS, BUSINESS, GOALS, HELP, KNOWLEDGE, STATE } from "@/lib/intake";

type Option = { id: string; title: string; sub: string };
type Tone = "mint" | "sun" | "coral" | "violet";

const ICONS: Record<string, [typeof Store, Tone]> = {
  "business.ecommerce": [ShoppingBag, "violet"],
  "business.services": [Briefcase, "mint"],
  "business.local": [Store, "sun"],
  "business.content": [UserRound, "coral"],
  "help.ads": [Megaphone, "sun"],
  "help.social": [Share2, "violet"],
  "help.content": [Clapperboard, "coral"],
  "help.strategy": [Compass, "mint"],
  "state.great": [TrendingUp, "mint"],
  "state.good": [ChartLine, "violet"],
  "state.declining": [TrendingDown, "coral"],
  "state.starting": [Sprout, "sun"],
  "goals.leads": [MessageCircle, "mint"],
  "goals.sales": [ShoppingCart, "violet"],
  "goals.followers": [Users, "sun"],
  "goals.engagement": [Heart, "coral"],
  "knowledge.none": [BookOpen, "mint"],
  "knowledge.basic": [Lightbulb, "sun"],
  "knowledge.hands_on": [Wrench, "violet"],
  "knowledge.pro": [Award, "coral"],
};
const TONE: Record<Tone, string> = {
  mint: "text-mint",
  sun: "text-sun",
  coral: "text-coral",
  violet: "text-violet",
};

type Answers = {
  businessType?: string;
  businessOther: string;
  help: string[];
  helpOther: string;
  low: number;
  high: number;
  state?: string;
  goals: string[];
  knowledge?: string;
};

type Step =
  | { id: "business" | "state" | "knowledge"; kind: "single"; question: string; options: readonly Option[] }
  | { id: "help" | "goals"; kind: "multi"; question: string; hint: string; options: readonly Option[] }
  | { id: "budget"; kind: "budget"; question: string };

const STEPS: Step[] = [
  { id: "business", kind: "single", question: "איזה סוג עסק יש לך?", options: BUSINESS },
  { id: "help", kind: "multi", question: "במה מייקי יעזור לך?", hint: "אפשר לבחור יותר מאחד", options: HELP },
  { id: "budget", kind: "budget", question: "מה התקציב החודשי לקמפיינים ממומנים?" },
  { id: "state", kind: "single", question: "איזו תשובה מתארת הכי טוב את מצב השיווק בעסק?", options: STATE },
  { id: "goals", kind: "multi", question: "מה הכי חשוב לך להשיג?", hint: "אפשר לבחור יותר מאחד", options: GOALS },
  { id: "knowledge", kind: "single", question: "מה הידע שלך בשיווק?", options: KNOWLEDGE },
];

const ils = (n: number) => `${n.toLocaleString("he-IL")}\u00a0₪`;
const rangeText = (lo: number, hi: number) => (!hi ? "עדיין אין תקציב" : lo === hi ? ils(hi) : !lo ? `עד ${ils(hi)}` : `${ils(lo)} עד ${ils(hi)}`);

/**
 * Two handles on one track: the right one is the bottom of the range, the left one the top (RTL). Two native
 * range inputs share the track, so the keyboard and screen readers work as usual; only their thumbs take the pointer.
 */
function RangeSlider({ stops, low, high, onChange, format }: { stops: readonly number[]; low: number; high: number; onChange: (low: number, high: number) => void; format: (n: number) => string }) {
  const last = stops.length - 1;
  const pct = (n: number) => (n / last) * 100;
  // When the handles meet, the one that can still move away stays on top.
  const lowOnTop = low === high && high === last;
  return (
    <div className="relative mt-6 h-11">
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-line" aria-hidden />
      <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-ink" style={{ insetInlineStart: `${pct(low)}%`, insetInlineEnd: `${100 - pct(high)}%` }} aria-hidden />
      <input
        type="range"
        min={0}
        max={last}
        step={1}
        value={low}
        onChange={(e) => onChange(Math.min(Number(e.target.value), high), high)}
        aria-label="תקציב מינימלי"
        aria-valuetext={format(stops[low])}
        className="range-dual"
        style={{ zIndex: lowOnTop ? 2 : 1 }}
      />
      <input
        type="range"
        min={0}
        max={last}
        step={1}
        value={high}
        onChange={(e) => onChange(low, Math.max(Number(e.target.value), low))}
        aria-label="תקציב מקסימלי"
        aria-valuetext={format(stops[high])}
        className="range-dual"
        style={{ zIndex: lowOnTop ? 1 : 2 }}
      />
    </div>
  );
}

/** One question at a time in a large card, answers as tiles. Saved once at the end, then the connections screen opens. */
export function Intake() {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [a, setA] = useState<Answers>({ businessOther: "", help: [], helpOther: "", low: BUDGET_STOPS.indexOf(2000), high: BUDGET_STOPS.indexOf(5000), goals: [] });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const advance = useRef<ReturnType<typeof setTimeout> | null>(null);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  const field = { business: "businessType", state: "state", knowledge: "knowledge", help: "help", goals: "goals" } as const;
  const otherText = step.id === "business" ? a.businessOther : step.id === "help" ? a.helpOther : "";
  const otherOn = (step.id === "business" && a.businessType === "other") || (step.id === "help" && a.help.includes("other"));

  const answered = (() => {
    if (step.kind === "budget") return true;
    const v = a[field[step.id]];
    const has = Array.isArray(v) ? v.length > 0 : !!v;
    return has && (!otherOn || otherText.trim().length > 0);
  })();

  const submit = () => {
    setError(null);
    start(async () => {
      const r = await saveIntake({
        businessType: a.businessType,
        businessOther: a.businessOther,
        help: a.help,
        helpOther: a.helpOther,
        adBudget: { min: BUDGET_STOPS[a.low], max: BUDGET_STOPS[a.high] },
        state: a.state,
        goals: a.goals,
        knowledge: a.knowledge,
      }).catch(() => ({ error: "השמירה לא הצליחה. נסו שוב." }));
      if (r?.error) return setError(r.error);
      router.refresh();
    });
  };

  const next = () => {
    if (!answered || pending) return;
    if (last) submit();
    else setI(i + 1);
  };

  const pick = (id: string) => {
    if (advance.current) clearTimeout(advance.current);
    if (step.kind === "single") {
      setA((p) => ({ ...p, [field[step.id]]: id }));
      // A plain choice moves on by itself; "other" waits for the words, and the last question waits for the button.
      if (id !== "other" && !last) advance.current = setTimeout(() => setI((n) => (n === i ? n + 1 : n)), 260);
    } else if (step.kind === "multi") {
      const key = field[step.id];
      setA((p) => ({ ...p, [key]: p[key].includes(id) ? p[key].filter((x) => x !== id) : [...p[key], id] }));
    }
  };

  const selected = (id: string) => {
    if (step.kind === "budget") return false;
    const v = a[field[step.id]];
    return Array.isArray(v) ? v.includes(id) : v === id;
  };

  return (
    <section className="card-float" aria-labelledby="intake-q">
      <div className="p-5 sm:p-8">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex gap-1" aria-hidden>
              {STEPS.map((s, n) => (
                <span key={s.id} className={`h-[3px] w-5 rounded-full transition-colors duration-300 ${n < i || (n === i && pending) ? "bg-ink" : n === i ? "bg-ink-3" : "bg-line"}`} />
              ))}
            </div>
            <p className="meta num whitespace-nowrap">
              שאלה {i + 1} מתוך {STEPS.length}
            </p>
          </div>
          {i > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setI(i - 1)} disabled={pending}>
              <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
              חזרה
            </button>
          )}
        </div>

        <div key={step.id} className="fade-in">
          <h2 id="intake-q" className="text-[22px] font-normal leading-snug tracking-[-0.01em] sm:text-[26px]">
            {step.question}
          </h2>
          {step.kind === "multi" && <p className="mt-1 text-[15px] text-ink-3">{step.hint}</p>}

          {step.kind === "budget" ? (
            <div className="mt-8">
              <p className="num text-[24px] font-normal leading-tight sm:text-[30px]" aria-live="polite">
                <span className="whitespace-nowrap">{rangeText(BUDGET_STOPS[a.low], BUDGET_STOPS[a.high])}</span>
                {BUDGET_STOPS[a.high] > 0 && <span className="ms-2 text-[17px] text-ink-2">לחודש</span>}
              </p>
              <RangeSlider
                stops={BUDGET_STOPS}
                low={a.low}
                high={a.high}
                onChange={(low, high) => setA((p) => ({ ...p, low, high }))}
                format={ils}
              />
              <div className="num flex justify-between text-[13.5px] text-ink-3">
                <span>{ils(0)}</span>
                <span>{ils(BUDGET_STOPS[BUDGET_STOPS.length - 1])}</span>
              </div>
              <p className="mt-5 text-[15px] text-ink-2">זו נקודת פתיחה בלבד. את התקרה המחייבת קובעים בהמשך, ושום שקל לא יוצא בלי אישור.</p>
            </div>
          ) : (
            <div className="mt-6 grid gap-2.5 sm:grid-cols-2" role={step.kind === "single" ? "radiogroup" : "group"} aria-labelledby="intake-q">
              {step.options.map((o) => {
                const on = selected(o.id);
                const [Icon, tone] = ICONS[`${step.id}.${o.id}`] ?? [Ellipsis, "violet"];
                return (
                  <button
                    key={o.id}
                    type="button"
                    role={step.kind === "single" ? "radio" : "checkbox"}
                    aria-checked={on}
                    onClick={() => pick(o.id)}
                    disabled={pending}
                    className={`flex min-h-[76px] items-center gap-3 rounded-[14px] border p-3.5 text-start transition-[border-color,background-color,transform] duration-200 active:scale-[.98] ${
                      on ? "border-ink bg-surface" : "border-line bg-surface hover:border-line-strong hover:bg-surface-2"
                    } ${step.options.length % 2 === 1 && o.id === "other" ? "sm:col-span-2" : ""}`}
                  >
                    <span className={`icon-tile !h-9 !w-9 border border-line bg-surface ${TONE[tone]}`}>
                      <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16.5px] leading-snug text-ink">{o.title}</span>
                      <span className="block text-[13.5px] leading-snug text-ink-3">{o.sub}</span>
                    </span>
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center ${step.kind === "multi" ? "rounded-[6px]" : "rounded-full"} border ${on ? "border-ink bg-ink text-surface" : "border-line-strong"}`} aria-hidden>
                      {on && <Check className="h-3 w-3" strokeWidth={2} />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {otherOn && (
            <label className="mt-4 block space-y-1.5">
              <span className="label">{step.id === "business" ? "איזה עסק?" : "במה עוד לעזור?"}</span>
              <input
                className="field"
                autoFocus
                maxLength={120}
                value={otherText}
                onChange={(e) => setA((p) => (step.id === "business" ? { ...p, businessOther: e.target.value } : { ...p, helpOther: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), next())}
              />
            </label>
          )}
        </div>

        {error && <p className="note note-bad mt-5 text-[14px]">{error}</p>}

        <div className="mt-8 flex items-center gap-4">
          <button type="button" className="btn btn-primary btn-lg" onClick={next} disabled={!answered || pending}>
            {last ? (pending ? "שומר…" : "סיום, ממשיכים לחיבורים") : "המשך"}
          </button>
          {!answered && step.kind !== "budget" && <p className="text-[14px] text-ink-3">{otherOn ? "כמה מילים, ואפשר להמשיך" : "בחירה אחת לפחות"}</p>}
        </div>
      </div>
    </section>
  );
}
