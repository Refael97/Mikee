"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChartNoAxesColumn, FileText, Megaphone, Sparkles, Wand2 } from "lucide-react";
import type { CardView, TimelineItem } from "@/lib/conversation";
import { Composer, type Upload } from "./Composer";
import { ProposalCard, type Brand } from "./ProposalCard";
import { RichText } from "./RichText";
import { refreshConversations } from "./Sidebar";

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

export function Chat({
  conversationId,
  initialItems,
  autoScan,
  firstName,
  brand,
}: {
  conversationId: string | null;
  initialItems: TimelineItem[];
  autoScan: boolean;
  firstName: string;
  brand: Brand;
}) {
  const [items, setItems] = useState(initialItems);
  const [live, setLive] = useState<Live | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  // A new conversation gets its id from the server with the first message.
  const convId = useRef<string | null>(conversationId);

  const refresh = useCallback(async () => {
    if (!convId.current) return;
    const res = await fetch(`/api/timeline?conversationId=${convId.current}`, { cache: "no-store" });
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
      setLive({ segments: [], activity: body.kickoff ? "מתחיל ללמוד את העסק" : null });
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
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items, live]);

  function submit(text: string, attachments: string[] = [], uploads: Upload[] = []) {
    if ((!text.trim() && !attachments.length) || live) return;
    void send({ text: text.trim(), attachments }, uploads);
  }

  const empty = items.length === 0 && !live;
  const change = (title: string) => submit(`בוא נשנה משהו ב"${title}"`);

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col px-5">
      <div className="flex-1 pb-10 pt-8 sm:pt-12">
        {empty ? (
          <div className="flex flex-col items-center pt-[3vh] text-center">
            <span className="orb orb-glow orb-breathe w-16" aria-hidden />
            <span className="kicker rise mt-7">מייקי, איש השיווק שלך</span>
            <h1 className="title rise mt-3 [animation-delay:40ms]">
              היי {firstName}, <span className="accent-word">מה עושים</span> היום?
            </h1>
            <p className="lead rise mt-4 [animation-delay:80ms]">ספרי לי מה צריך. את כל השאר אני לוקח עליי.</p>
            <div className="mt-9 grid w-full max-w-xl grid-cols-2 gap-3 xl:max-w-none xl:grid-cols-4">
              {SUGGESTIONS.map(({ icon: Icon, title, sub }, i) => (
                <button
                  key={title}
                  onClick={() => submit(title)}
                  style={{ animationDelay: `${120 + i * 50}ms` }}
                  className="card rise flex flex-col items-start gap-3 p-4 text-start transition-[transform,box-shadow] duration-300 ease-[var(--ease)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)] active:scale-[0.97]"
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
                  <div key={item.id} className="rise flex flex-col items-end gap-2">
                    {item.attachments?.length ? (
                      <div className="flex max-w-[80%] flex-wrap justify-end gap-2">
                        {item.attachments.map((a) =>
                          a.type.startsWith("image/") && a.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={a.id} src={a.url} alt={a.name} className="h-28 w-28 rounded-[14px] object-cover shadow-[var(--shadow)]" />
                          ) : (
                            <a key={a.id} href={a.url || undefined} target="_blank" rel="noreferrer" className="card flex h-14 items-center gap-2.5 pe-4 ps-2">
                              <span className="icon-chip h-10 w-10 rounded-[10px]">
                                <FileText className="h-4 w-4" />
                              </span>
                              <span className="max-w-40 truncate text-[14px] font-medium">{a.name}</span>
                            </a>
                          ),
                        )}
                      </div>
                    ) : null}
                    {item.text && item.text !== "(קבצים מצורפים)" && (
                      <div className="card max-w-[80%] whitespace-pre-line rounded-[18px] px-5 py-3 text-[17px]">{item.text}</div>
                    )}
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
        <Composer busy={!!live} placeholder={autoScan && items.length === 0 ? "מייקי לומד את העסק…" : "מה צריך?"} onSend={submit} />
        <p className="mt-2.5 text-center text-[13px] text-ink-3">שום דבר לא עולה לאוויר ושום שקל לא יוצא בלי האישור שלך</p>
      </div>
    </div>
  );
}
