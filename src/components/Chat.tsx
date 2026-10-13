"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TimelineItem } from "@/lib/conversation";
import { ProposalCard } from "./ProposalCard";
import { RichText } from "./RichText";

const LIVE_LABELS: Record<string, string> = {
  remember: "רושם לעצמי",
  scan_website: "קורא את האתר",
  read_store: "בודק את החנות",
  read_results: "בודק את התוצאות",
  read_insights: "מעמיק בנתונים",
  read_social: "עובר על הפוסטים",
  budget_status: "בודק את התקציב",
  search_targeting: "מחפש את הקהל הנכון",
  list_audiences: "בודק קהלים שמורים",
  meta_read: "בודק משהו מאחורי הקלעים",
  meta_write: "מסדר משהו מאחורי הקלעים",
  propose_campaign: "מכין לך הצעה",
  propose_change: "מכין לך הצעה",
  propose_post: "מכין פוסט",
  request_budget_increase: "מכין בקשה",
};

const SUGGESTIONS = ["מה כדאי לקדם השבוע?", "צריך יותר פניות", "יש לי קולקציה חדשה", "איך הולך החודש?"];

type LiveProposal = Extract<TimelineItem, { type: "card" }>["proposal"];
type Segment = { kind: "text"; text: string } | { kind: "card"; proposal: LiveProposal };
type Live = { segments: Segment[]; activity: string | null };

function appendText(live: Live | null, delta: string): Live {
  const segments = [...(live?.segments ?? [])];
  const last = segments[segments.length - 1];
  if (last?.kind === "text") segments[segments.length - 1] = { kind: "text", text: last.text + delta };
  else segments.push({ kind: "text", text: delta });
  return { segments, activity: null };
}

export function Chat({ initialItems, stage, firstName }: { initialItems: TimelineItem[]; stage: string; firstName: string }) {
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

  const send = useCallback(
    async (body: { text?: string; kickoff?: "scan" }) => {
      setError(null);
      if (body.text) setItems((prev) => [...prev, { type: "user", id: `local-${Date.now()}`, text: body.text! }]);
      setLive({ segments: [], activity: body.kickoff ? "מתחיל ללמוד את העסק" : null });
      try {
        const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? "משהו השתבש, נסי שוב.");
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const e = JSON.parse(line);
            if (e.t === "text") setLive((l) => appendText(l, e.v));
            if (e.t === "tool" && e.state === "start")
              setLive((l) => ({ segments: l?.segments ?? [], activity: LIVE_LABELS[e.name] ?? "עובד על זה" }));
            if (e.t === "proposal") {
              const p = await fetch(`/api/proposals/${e.id}`).then((r) => (r.ok ? r.json() : null));
              if (p) setLive((l) => ({ segments: [...(l?.segments ?? []), { kind: "card", proposal: p }], activity: null }));
            }
            if (e.t === "error") setError(e.message);
          }
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        await refresh();
        setLive(null);
      }
    },
    [refresh],
  );

  useEffect(() => {
    if (stage === "scanning" && initialItems.length === 0 && !started.current) {
      started.current = true;
      void send({ kickoff: "scan" });
    }
  }, [stage, initialItems.length, send]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items, live]);

  function submit(text = input) {
    const t = text.trim();
    if (!t || live) return;
    setInput("");
    void send({ text: t });
  }

  const empty = items.length === 0 && !live;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4">
      <div className="flex-1 space-y-5 py-8">
        {empty && (
          <div className="flex flex-col items-center pt-16 text-center fade-in">
            <div className="orb h-20 w-20" />
            <h1 className="mt-8 text-3xl font-semibold tracking-tight sm:text-4xl">היי {firstName}, מה עושים היום?</h1>
            <p className="mt-3 text-lg text-ink-2">ספרי לי מה צריך, ואני כבר אדאג לשאר.</p>
          </div>
        )}

        {items.map((item) => {
          if (item.type === "user")
            return (
              <div key={item.id} className="flex justify-end fade-in">
                <div className="max-w-[85%] whitespace-pre-line rounded-[22px] rounded-ee-md bg-accent px-4 py-2.5 text-white">{item.text}</div>
              </div>
            );
          if (item.type === "mikee")
            return (
              <div key={item.id} className="flex gap-3 fade-in">
                <span className="orb mt-1 h-7 w-7 shrink-0" />
                <div className="max-w-[85%] pt-1 text-[1.02rem]">
                  <RichText text={item.text} />
                </div>
              </div>
            );
          if (item.type === "activity")
            return (
              <div key={item.id} className="ps-10 text-sm text-ink-3">
                {item.label}
              </div>
            );
          return (
            <div key={item.id} className="ps-10">
              <ProposalCard proposal={item.proposal} onChange={(title) => submit(`בוא נשנה משהו ב"${title}"`)} />
            </div>
          );
        })}

        {live && (
          <div className="flex gap-3">
            <span className="orb orb-live mt-1 h-7 w-7 shrink-0" />
            <div className="max-w-[85%] pt-1 text-[1.02rem]">
              <div className="space-y-4">
                {live.segments.map((seg, i) =>
                  seg.kind === "text" ? (
                    <RichText key={i} text={seg.text} />
                  ) : (
                    <ProposalCard key={seg.proposal.id} proposal={seg.proposal} onChange={(title) => submit(`בוא נשנה משהו ב"${title}"`)} />
                  ),
                )}
              </div>
              {(live.activity || !live.segments.length) && (
                <div className="flex items-center gap-2 text-ink-2">
                  {live.activity && <span>{live.activity}</span>}
                  <span className="dots">
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
        {error && <p className="ps-10 text-sm text-warn">{error}</p>}
        <div ref={bottom} />
      </div>

      <div className="sticky bottom-0 bg-gradient-to-t from-bg from-70% to-transparent pb-5 pt-6">
        {empty && (
          <div className="mb-3 flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="btn btn-quiet text-sm" onClick={() => submit(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        <form
          className="card glass flex items-end gap-2 p-2"
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
            className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-[1.02rem] outline-none placeholder:text-ink-3"
          />
          <button className="btn btn-primary h-11 w-11 shrink-0 p-0" disabled={!input.trim() || !!live} aria-label="שליחה">
            <svg viewBox="0 0 24 24" className="h-5 w-5 rotate-180" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
