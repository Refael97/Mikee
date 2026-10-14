"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, Check, FileText } from "lucide-react";
import type { CardView, TimelineItem } from "@/lib/conversation";
import { Composer, type Upload } from "./Composer";
import { MikeeAvatar, type MikeeState } from "./MikeeAvatar";
import { ProposalCard, type Brand } from "./ProposalCard";
import { LiveText, QuickReplies, StatusLine, type Step, Steps, splitReplies } from "./Live";
import { RichText } from "./RichText";
import { refreshConversations } from "./Sidebar";
import { SILENT_STEPS, stepLabel } from "@/lib/progress";

const SUGGESTIONS = [
  { title: "איך הולך החודש?", sub: "תמונת מצב קצרה, במספרים אמיתיים" },
  { title: "צריך יותר פניות", sub: "מייקי בונה תוכנית ומכין קמפיין" },
  { title: "יש לי קולקציה חדשה", sub: "נשיק אותה נכון, עם תוכן מהספרייה" },
  { title: "מה כדאי לקדם השבוע?", sub: "לפי המלאי, העונה והתוצאות" },
];

type Segment = { kind: "text"; text: string } | { kind: "card"; proposal: CardView };
type Live = { segments: Segment[]; steps: Step[]; activity: string | null };
const EMPTY: Live = { segments: [], steps: [], activity: null };

function appendText(live: Live | null, delta: string): Live {
  const l = live ?? EMPTY;
  const segments = [...l.segments];
  const last = segments[segments.length - 1];
  if (last?.kind === "text") segments[segments.length - 1] = { kind: "text", text: last.text + delta };
  else segments.push({ kind: "text", text: delta });
  return { ...l, segments, activity: null };
}

/** A tool started or finished: the step list grows, and finished steps turn into checks. */
function toolEvent(live: Live | null, name: string, state: "start" | "done" | "error", agent?: string): Live {
  const l = live ?? EMPTY;
  if (SILENT_STEPS.has(name)) return l;
  // Who does what, in plain words: "סוכן הקמפיינים בודק כמה תקציב פנוי החודש". A specialist's steps sit under
  // the step where Mikee handed it the work.
  const label = stepLabel(name, agent);
  const sub = !!agent && agent !== "mikee";
  if (state === "start") {
    // The same kind of work twice in a row reads as one step.
    const running = l.steps.find((s) => s.label === label && s.state === "running");
    return { ...l, steps: running ? l.steps : [...l.steps, { name, label, state: "running", sub }], activity: label };
  }
  const steps = [...l.steps];
  const i = steps.findLastIndex((s) => s.name === name && !!s.sub === sub && s.state === "running");
  if (i >= 0) steps[i] = { ...steps[i], state };
  const stillRunning = steps.findLast((s) => s.state === "running");
  return { ...l, steps, activity: stillRunning?.label ?? null };
}

/** Mikee beside his words. Only the avatar the client is looking at moves; older ones stay still. */
/** The true end of the page, below the composer, so the last message is never hidden behind it. */
function toEnd() {
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" as ScrollBehavior });
}

function MikeeMark({ state = "idle", active = false }: { state?: MikeeState; active?: boolean }) {
  return <MikeeAvatar size={24} state={state} animate={active} cues={active} className="mt-1" />;
}

/** What Mikee is doing right now: words on the screen are talking, anything else he is busy with is thinking. */
function liveState(live: Live): MikeeState {
  if (live.steps.some((s) => s.state === "running")) return "thinking";
  return live.segments[live.segments.length - 1]?.kind === "text" ? "talking" : "thinking";
}

export function Chat({
  conversationId,
  initialItems,
  autoScan,
  firstName,
  brand,
  draft,
  nextMoves = [],
}: {
  conversationId: string | null;
  initialItems: TimelineItem[];
  autoScan: boolean;
  firstName: string;
  brand: Brand;
  draft?: string;
  nextMoves?: { title: string; why: string }[];
}) {
  const [items, setItems] = useState(initialItems);
  const [live, setLive] = useState<Live | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  /** Whether the view follows the conversation's end; scrolling up to read stops that until she comes back down. */
  const pinned = useRef(true);
  const started = useRef(false);
  // A new conversation gets its id from the server with the first message.
  const convId = useRef<string | null>(conversationId);

  const refresh = useCallback(async () => {
    if (!convId.current) return;
    // A failed read is tried again once; it never throws, so whatever follows it (clearing the live
    // block) always runs.
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(`/api/timeline?conversationId=${convId.current}`, { cache: "no-store" }).catch(() => null);
      if (res?.ok) {
        const data = await res.json().catch(() => null);
        if (data?.items) return setItems(data.items);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }, []);

  /** Follows a background job by polling its events; survives refreshes, drops and server restarts. */
  const follow = useCallback(
    async (jobId: string) => {
      setLive((l) => l ?? EMPTY);
      let cursor = 0;
      let finished = false;
      for (;;) {
        const res = await fetch(`/api/jobs/${jobId}?after=${cursor}`, { cache: "no-store" }).catch(() => null);
        if (res?.ok) {
          const data = (await res.json()) as { status: string; events: any[] };
          for (const e of data.events) {
            cursor = e.id;
            if (e.t === "text") setLive((l) => appendText(l, e.v));
            if (e.t === "tool") setLive((l) => toolEvent(l, e.name, e.state, e.agent));
            if (e.t === "proposal") {
              const p = await fetch(`/api/proposals/${e.id}`).then((r) => (r.ok ? r.json() : null));
              if (p)
                setLive((l) =>
                  l?.segments.some((x) => x.kind === "card" && x.proposal.id === p.id)
                    ? l
                    : { ...(l ?? EMPTY), segments: [...(l?.segments ?? []), { kind: "card", proposal: p }], activity: null },
                );
            }
            if (e.t === "error") setError(e.message);
            if (e.t === "done") finished = true;
          }
          if (finished || data.status === "done" || data.status === "failed") break;
        }
        await new Promise((r) => setTimeout(r, 700));
      }
      // The saved timeline replaces the live block in one go: no gap, no stale "working" line.
      await refresh();
      setLive(null);
      pinned.current = true;
      refreshConversations(convId.current ?? undefined); // Mikee may have titled or filed the conversation
    },
    [refresh],
  );

  const send = useCallback(
    async (body: { text?: string; kickoff?: "scan"; attachments?: string[] }, uploads: Upload[] = []) => {
      setError(null);
      if (body.text || uploads.length)
        setItems((prev) => [
          ...prev,
          {
            type: "user",
            id: `local-${Date.now()}`,
            text: body.text ?? "",
            attachments: uploads.map((u) => ({ id: u.id!, name: u.name, type: u.type, size: u.size, url: u.preview ?? "" })),
          },
        ]);
      setLive({ ...EMPTY, activity: body.kickoff ? "מתחיל ללמוד את העסק" : null });
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, conversationId: convId.current ?? undefined }),
        });
        const data = await res.json().catch(() => null);
        if (data?.conversationId && !convId.current) {
          convId.current = data.conversationId;
          window.history.replaceState(null, "", `/mikee/${data.conversationId}`);
          refreshConversations(data.conversationId);
        }
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

  // Coming back to a conversation while Mikee is working on it: pick up where he is.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      if (autoScan) return void (await send({ kickoff: "scan" }));
      if (!convId.current) return;
      const active = await fetch(`/api/jobs/active?conversationId=${convId.current}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
      if (active?.jobId) await follow(active.jobId);
    })();
  }, [autoScan, send, follow]);

  useEffect(() => {
    const h = () => void refresh();
    window.addEventListener("mikee:timeline", h);
    return () => window.removeEventListener("mikee:timeline", h);
  }, [refresh]);

  // Mikee can start talking here on his own (a reminder about a waiting card, a fix for a failed one).
  // While the conversation is open and quiet, look for that every few seconds and show it live.
  const liveRef = useRef(live);
  liveRef.current = live;
  useEffect(() => {
    if (!conversationId) return;
    const t = setInterval(async () => {
      if (liveRef.current || document.hidden || !convId.current) return;
      const active = await fetch(`/api/jobs/active?conversationId=${convId.current}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!active?.jobId || liveRef.current) return;
      await follow(active.jobId);
      // She watched it arrive, so it is already read.
      await fetch(`/api/conversations/${convId.current}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ read: true }) });
    }, 12_000);
    return () => clearInterval(t);
  }, [conversationId, follow]);

  // Stay at the end while it grows: new words, a card, an image that finishes loading. Nothing jumps
  // while she reads further up.
  useEffect(() => {
    const onScroll = () => {
      const fromBottom = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      pinned.current = fromBottom < 200;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    const el = list.current;
    const observer = el
      ? new ResizeObserver(() => {
          if (pinned.current) toEnd();
        })
      : null;
    if (el) observer!.observe(el);
    return () => {
      window.removeEventListener("scroll", onScroll);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (pinned.current) toEnd();
  }, [items, live]);

  // Opening or refreshing a conversation lands at its end before the first paint: the browser does not
  // restore an old position halfway down, and nothing scrolls visibly into place.
  useLayoutEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    toEnd();
  }, []);

  function submit(text: string, attachments: string[] = [], uploads: Upload[] = []) {
    if ((!text.trim() && !attachments.length) || live) return;
    pinned.current = true;
    void send({ text: text.trim(), attachments }, uploads);
  }

  const empty = items.length === 0 && !live;
  // Quick replies belong to Mikee's latest words only, and disappear once the client answers.
  const lastItem = items[items.length - 1];
  const replies = !live && lastItem?.type === "mikee" ? splitReplies(lastItem.text).replies : [];
  // The newest avatar in the conversation is the one that reacts (listens, celebrates a card that went live).
  const markIds = items.filter((it, i) => (it.type === "mikee" && !["mikee", "activity", "card"].includes(items[i - 1]?.type ?? "")) || (it.type === "activity" && items[i - 1]?.type === "user")).map((it) => it.id);
  const activeMark = live ? null : markIds[markIds.length - 1];
  const change = (title: string) => submit(`בוא נשנה משהו ב"${title}"`);

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col px-5">
      <div ref={list} className="flex-1 pb-10 pt-8 sm:pt-12">
        {empty ? (
          <div className="mx-auto max-w-[640px] pt-[6vh]">
            <MikeeAvatar size={40} state={typing ? "listening" : "idle"} cues />
            <h1 className="display mt-5">היי {firstName}, מה עושים היום?</h1>
            <p className="lead mt-2">ספרי לי מה צריך. את כל השאר אני לוקח עליי.</p>

            {nextMoves.length > 0 && (
              <section className="mt-8">
                <h2 className="label mb-2">מייקי מציע להמשיך</h2>
                <ul className="group-list">
                  {nextMoves.map((m) => (
                    <li key={m.title}>
                      <button onClick={() => submit(`בוא נדבר על הצעד הבא: ${m.title}`)} className="group flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-surface-2">
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{m.title}</span>
                          <span className="mt-0.5 block text-[14.5px] text-ink-2">{m.why}</span>
                        </span>
                        <ArrowLeft className="h-4 w-4 shrink-0 text-ink-3 transition-transform group-hover:-translate-x-0.5 group-hover:text-brand" strokeWidth={1.75} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="mt-6">
              <h2 className="label mb-2">או להתחיל מכאן</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map(({ title, sub }) => (
                  <button key={title} onClick={() => submit(title)} className="card px-4 py-3 text-start transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-[var(--shadow)]">
                    <span className="block text-[15px] font-medium">{title}</span>
                    <span className="mt-0.5 block text-[14px] text-ink-2">{sub}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : (
          <div className="space-y-6">
            {items.map((item, i) => {
              const prev = items[i - 1];
              if (item.type === "user")
                return (
                  <div key={item.id} className="rise flex flex-col items-end gap-2">
                    {item.attachments?.length ? (
                      <div className="flex max-w-[80%] flex-wrap justify-end gap-2">
                        {item.attachments.map((a) =>
                          a.type.startsWith("image/") && a.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={a.id} src={a.url} alt={a.name} className="h-28 w-28 rounded-[8px] border border-line object-cover" />
                          ) : (
                            <a key={a.id} href={a.url || undefined} target="_blank" rel="noreferrer" className="card flex h-14 items-center gap-2.5 pe-4 ps-3">
                              <FileText className="h-5 w-5 text-ink-2" strokeWidth={1.6} />
                              <span className="max-w-40 truncate text-[14px] font-medium">{a.name}</span>
                            </a>
                          ),
                        )}
                      </div>
                    ) : null}
                    {item.text && item.text !== "(קבצים מצורפים)" && (
                      <div className="max-w-[80%] whitespace-pre-line rounded-[10px] bg-surface-2 px-3.5 py-2 text-[16px]">{item.text}</div>
                    )}
                  </div>
                );
              if (item.type === "mikee")
                return (
                  <div key={item.id} className="rise flex gap-3.5">
                    {prev?.type === "mikee" || prev?.type === "activity" || prev?.type === "card" ? <span className="w-7 shrink-0" /> : <MikeeMark active={item.id === activeMark} state={item.id === activeMark && typing ? "listening" : "idle"} />}
                    <div className="min-w-0 flex-1 space-y-3 pt-0.5 text-[16.5px] leading-[1.65]">
                      <RichText text={splitReplies(item.text).text} />
                      {item === lastItem && <QuickReplies replies={replies} onPick={(r) => submit(r)} />}
                    </div>
                  </div>
                );
              if (item.type === "activity")
                return (
                  <div key={item.id} className="flex items-center gap-3.5 text-[15px] text-ink-3">
                    {prev?.type === "user" ? <MikeeMark active={item.id === activeMark} state={item.id === activeMark && typing ? "listening" : "idle"} /> : <span className="w-7 shrink-0" />}
                    <span className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-good" strokeWidth={2.6} />
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
                <MikeeMark active state={liveState(live)} />
                <div className="min-w-0 flex-1 space-y-5 pt-0.5 text-[16.5px] leading-[1.65] [&>article]:-ms-10 [&>article]:w-[calc(100%+2.5rem)] sm:[&>article]:ms-0 sm:[&>article]:w-full">
                  <Steps steps={live.steps} />
                  {live.segments.map((seg, i) =>
                    seg.kind === "text" ? (
                      <LiveText key={i} text={seg.text} />
                    ) : (
                      <ProposalCard key={seg.proposal.id} proposal={seg.proposal} brand={brand} onChange={change} />
                    ),
                  )}
                  {!live.steps.some((x) => x.state === "running") && live.segments[live.segments.length - 1]?.kind !== "text" && <StatusLine activity={live.activity} />}
                </div>
              </div>
            )}
            {error && (
              <div className="flex gap-3.5">
                <span className="w-7 shrink-0" />
                <p className="note note-bad text-[15px]">{error}</p>
              </div>
            )}
          </div>
        )}
        <div ref={bottom} />
      </div>

      <div className="sticky bottom-0 z-20 -mx-5 bg-gradient-to-t from-bg from-70% to-transparent px-5 pb-3 pt-8 sm:pb-5">
        <Composer onTyping={setTyping} busy={!!live} initialText={draft} placeholder={autoScan && items.length === 0 ? "מייקי לומד את העסק…" : "מה צריך?"} onSend={submit} />
        <p className="mt-2 text-center text-[12.5px] text-ink-3">שום דבר לא עולה לאוויר ושום שקל לא יוצא בלי האישור שלך</p>
      </div>
    </div>
  );
}
