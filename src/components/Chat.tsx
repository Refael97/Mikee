"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, ChartNoAxesColumn, Megaphone, Sparkles, Wand2 } from "lucide-react";
import type { CardView, TimelineItem } from "@/lib/conversation";
import { ProposalCard, type Brand } from "./ProposalCard";
import { RichText } from "./RichText";

const LIVE_LABELS: Record<string, string> = {
  remember: "רושם לעצמי",
  forget: "מעדכן את מה שאני יודע",
  scan_website: "קורא את האתר",
  read_store: "בודק את החנות",
  read_results: "בודק את התוצאות",
  read_social: "עובר על הפוסטים",
  budget_status: "בודק את התקציב",
  request_budget_increase: "מכין בקשה",
  ask_copywriter: "כותב טקסטים",
  ask_media_buyer: "עובד על הקמפיין",
  ask_creative: "מכין ויז׳ואל",
  ask_social: "מכין פוסט",
  ask_analyst: "מנתח את התוצאות",
  web_search: "מחפש ברשת",
};

const SUGGESTIONS = [
  { icon: ChartNoAxesColumn, title: "איך הולך החודש?", sub: "תמונת מצב בשתי דקות" },
  { icon: Megaphone, title: "צריך יותר פניות", sub: "מייקי יבנה תוכנית" },
  { icon: Sparkles, title: "יש לי קולקציה חדשה", sub: "בוא נשיק אותה נכון" },
  { icon: Wand2, title: "מה כדאי לקדם השבוע?", sub: "לפי המלאי והתוצאות" },
];

type Segment = { kind: "text"; text: string } | { kind: "card"; proposal: CardView };
type Live = { segments: Segment[]; activity: string | null };

function appendText(live: Live | null, delta: string): Live {
  const segments = [...(live?.segments ?? [])];
  const last = segments[segments.length - 1];
  if (last?.kind === "text") segments[segments.length - 1] = { kind: "text", text: last.text + delta };
  else segments.push({ kind: "text", text: delta });
  return { segments, activity: null };
}

function MikeeMark({ live = false }: { live?: boolean }) {
  return <span className={`orb mt-0.5 w-7 shrink-0 ${live ? "orb-live" : ""}`} aria-hidden />;
}

export function Chat({ initialItems, stage, firstName, brand }: { initialItems: TimelineItem[]; stage: string; firstName: string; brand: Brand }) {
  const [items, setItems] = useState(initialItems);
  const [live, setLive] = useState<Live | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const started = useRef(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/timeline", { cache: "no-store" });
    if (res.ok) setItems((await res.json()).items);
  }, []);

  /** Follows a background job by polling its events; survives refreshes, drops and server restarts. */
  const follow = useCallback(
    async (jobId: string) => {
      setLive((l) => l ?? { segments: [], activity: null });
      let cursor = 0;
      for (;;) {
        const res = await fetch(`/api/jobs/${jobId}?after=${cursor}`, { cache: "no-store" }).catch(() => null);
        if (res?.ok) {
          const data = (await res.json()) as { status: string; events: any[] };
          for (const e of data.events) {
            cursor = e.id;
            if (e.t === "text") setLive((l) => appendText(l, e.v));
            if (e.t === "tool" && e.state === "start") setLive((l) => ({ segments: l?.segments ?? [], activity: LIVE_LABELS[e.name] ?? "עובד על זה" }));
            if (e.t === "proposal") {
              const p = await fetch(`/api/proposals/${e.id}`).then((r) => (r.ok ? r.json() : null));
              if (p)
                setLive((l) =>
                  l?.segments.some((x) => x.kind === "card" && x.proposal.id === p.id)
                    ? l
                    : { segments: [...(l?.segments ?? []), { kind: "card", proposal: p }], activity: null },
                );
            }
            if (e.t === "error") setError(e.message);
          }
          if (data.status === "done" || data.status === "failed") break;
        }
        await new Promise((r) => setTimeout(r, 700));
      }
      await refresh();
      setLive(null);
    },
    [refresh],
  );

  const send = useCallback(
    async (body: { text?: string; kickoff?: "scan" }) => {
      setError(null);
      if (body.text) setItems((prev) => [...prev, { type: "user", id: `local-${Date.now()}`, text: body.text! }]);
      setLive({ segments: [], activity: body.kickoff ? "מתחיל ללמוד את העסק" : null });
      try {
        const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const data = await res.json().catch(() => null);
        if (data?.jobId) {
          if (data.alreadyRunning && body.text) setError("מייקי עוד מסיים משהו קודם. ההודעה לא נשלחה, נסי שוב בעוד רגע.");
          await follow(data.jobId);
          return;
        }
        throw new Error(data?.error ?? "משהו השתבש, נסי שוב.");
      } catch (e) {
        setError((e as Error).message);
        await refresh();
        setLive(null);
      }
    },
    [follow, refresh],
  );

  // Coming back to the screen while Mikee is working: pick up where he is.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const active = await fetch("/api/jobs/active", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
      if (active?.jobId) await follow(active.jobId);
      else if (stage === "scanning" && initialItems.length === 0) await send({ kickoff: "scan" });
    })();
  }, [stage, initialItems.length, send, follow]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items, live]);

  // Grow the composer with its text.
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  function submit(text = input) {
    const t = text.trim();
    if (!t || live) return;
    setInput("");
    void send({ text: t });
  }

  const empty = items.length === 0 && !live;
  const change = (title: string) => submit(`בוא נשנה משהו ב"${title}"`);

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col px-5">
      <div className="flex-1 pb-10 pt-8 sm:pt-12">
        {empty ? (
          <div className="flex flex-col items-center pt-[8vh] text-center">
            <span className="orb orb-glow orb-breathe w-20" aria-hidden />
            <span className="kicker rise mt-10">מייקי, איש השיווק שלך</span>
            <h1 className="title rise mt-3 [animation-delay:40ms]">
              היי {firstName}, <span className="accent-word">מה עושים</span> היום?
            </h1>
            <p className="lead rise mt-4 [animation-delay:80ms]">ספרי לי מה צריך. את כל השאר אני לוקח עליי.</p>
            <div className="mt-12 grid w-full max-w-xl grid-cols-2 gap-3">
              {SUGGESTIONS.map(({ icon: Icon, title, sub }, i) => (
                <button
                  key={title}
                  onClick={() => submit(title)}
                  style={{ animationDelay: `${120 + i * 50}ms` }}
                  className="card rise flex flex-col items-start gap-4 p-5 text-start transition-[transform,box-shadow] duration-300 ease-[var(--ease)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)] active:scale-[0.97]"
                >
                  <span className="icon-chip h-10 w-10">
                    <Icon className="h-5 w-5" strokeWidth={1.9} />
                  </span>
                  <span>
                    <span className="block font-semibold">{title}</span>
                    <span className="mt-0.5 block text-[15px] text-ink-2">{sub}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {items.map((item, i) => {
              const prev = items[i - 1];
              if (item.type === "user")
                return (
                  <div key={item.id} className="rise flex justify-end">
                    <div className="card max-w-[80%] whitespace-pre-line rounded-[18px] px-5 py-3 text-[17px]">{item.text}</div>
                  </div>
                );
              if (item.type === "mikee")
                return (
                  <div key={item.id} className="rise flex gap-3.5">
                    {prev?.type === "mikee" || prev?.type === "activity" || prev?.type === "card" ? <span className="w-7 shrink-0" /> : <MikeeMark />}
                    <div className="min-w-0 flex-1 pt-0.5 text-[18px] leading-[1.6]">
                      <RichText text={item.text} />
                    </div>
                  </div>
                );
              if (item.type === "activity")
                return (
                  <div key={item.id} className="flex items-center gap-3.5 text-[15px] text-ink-3">
                    {prev?.type === "user" ? <MikeeMark /> : <span className="w-7 shrink-0" />}
                    <span className="flex items-center gap-2">
                      <span className="h-1 w-1 rounded-full bg-ink-3" />
                      {item.label}
                    </span>
                  </div>
                );
              return (
                <div key={item.id} className="flex gap-3.5">
                  <span className="hidden w-7 shrink-0 sm:block" />
                  <ProposalCard proposal={item.proposal} brand={brand} onChange={change} />
                </div>
              );
            })}

            {live && (
              <div className="flex gap-3.5">
                <MikeeMark live />
                <div className="min-w-0 flex-1 space-y-5 pt-0.5 text-[18px] leading-[1.6] [&>article]:-ms-10 [&>article]:w-[calc(100%+2.5rem)] sm:[&>article]:ms-0 sm:[&>article]:w-full">
                  {live.segments.map((seg, i) =>
                    seg.kind === "text" ? (
                      <RichText key={i} text={seg.text} />
                    ) : (
                      <ProposalCard key={seg.proposal.id} proposal={seg.proposal} brand={brand} onChange={change} />
                    ),
                  )}
                  {(live.activity || !live.segments.length) && <div className="shimmer text-[16px] font-medium">{live.activity ?? "חושב"}…</div>}
                </div>
              </div>
            )}
            {error && (
              <div className="flex gap-3.5">
                <span className="w-7 shrink-0" />
                <p className="rounded-[14px] bg-bad-tint px-4 py-2.5 text-[15px] text-bad">{error}</p>
              </div>
            )}
          </div>
        )}
        <div ref={bottom} />
      </div>

      <div className="sticky bottom-0 z-20 -mx-5 bg-gradient-to-t from-bg from-60% to-transparent px-5 pb-4 pt-10 sm:pb-6">
        <form
          className="glass mx-auto flex items-end gap-2 rounded-[28px] p-2 ps-5 shadow-[var(--shadow-float)] transition-shadow duration-300 focus-within:shadow-[var(--shadow-float),0_0_0_5px_var(--brand-tint)]"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <textarea
            ref={field}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder={stage === "scanning" && items.length === 0 ? "מייקי לומד את העסק…" : "מה צריך?"}
            className="max-h-[200px] min-h-12 flex-1 resize-none bg-transparent py-3 text-[18px] leading-6 outline-none placeholder:text-ink-3"
          />
          <button
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-on-brand transition-[transform,opacity,background-color] duration-200 ease-[var(--ease)] hover:opacity-90 active:scale-[0.97] disabled:bg-surface-2 disabled:text-ink-3"
            disabled={!input.trim() || !!live}
            aria-label="שליחה"
          >
            <ArrowUp className="h-5 w-5" strokeWidth={2.2} />
          </button>
        </form>
        <p className="mt-2.5 text-center text-[13px] text-ink-3">שום דבר לא עולה לאוויר ושום שקל לא יוצא בלי האישור שלך</p>
      </div>
    </div>
  );
}
