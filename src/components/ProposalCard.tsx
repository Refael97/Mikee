"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, RotateCcw } from "lucide-react";
import type { CardView } from "@/lib/conversation";
import type { ProposalCard as Card } from "@/lib/specs";
import { MediaGenerating } from "./Live";

export type Brand = { name: string; handle?: string };

const KIND: Record<Card["kind"], { label: string; done: string }> = {
  campaign: { label: "קמפיין חדש", done: "עלה לאוויר" },
  change: { label: "שינוי בקמפיין", done: "עודכן" },
  post: { label: "פוסט", done: "פורסם" },
  budget: { label: "תוספת תקציב", done: "אושר" },
  media: { label: "תמונות וסרטונים", done: "מוכן" },
};

const STATUS: Record<string, { label: string; tag: string }> = {
  pending: { label: "מחכה לך", tag: "tag tag-brand" },
  executing: { label: "מייקי על זה", tag: "tag tag-brand" },
  done: { label: "", tag: "tag tag-good" },
  failed: { label: "לא הצליח", tag: "tag tag-bad" },
  declined: { label: "לא הפעם", tag: "tag tag-quiet" },
  cancelled: { label: "בוטל", tag: "tag tag-quiet" },
  superseded: { label: "הוחלף בגרסה חדשה", tag: "tag tag-quiet" },
};

type Media = NonNullable<Card["media"]>[number];

/** How the ad or post will look in the feed: the client approves what her customers will see. */
function FeedPreview({ m, brand, sponsored }: { m: Media; brand: Brand; sponsored: boolean }) {
  return (
    <div className="overflow-hidden rounded-[8px] border border-line bg-surface">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#feda75] via-[#d62976] to-[#4f5bd5] p-[1.5px]">
          <span className="flex h-full w-full items-center justify-center rounded-full bg-surface text-xs font-semibold">{brand.name.slice(0, 1)}</span>
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[0.85rem] font-semibold">{brand.handle ?? brand.name}</span>
          {sponsored && <span className="block text-[0.72rem] text-ink-3">ממומן</span>}
        </span>
        <span className="ms-auto text-ink-3">•••</span>
      </div>
      <div className="relative aspect-[4/5] w-full bg-surface-2">
        {m.url &&
          (m.type === "video" ? (
            <video src={m.url} className="absolute inset-0 h-full w-full object-cover" autoPlay muted loop playsInline />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ))}
      </div>
      {sponsored && (m.cta || m.headline) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2.5">
          <span className="truncate text-[0.85rem] font-semibold">{m.headline}</span>
          {m.cta && (
            <span className="flex shrink-0 items-center gap-0.5 text-[0.82rem] font-semibold text-[#0095f6]">
              {m.cta}
              <ChevronLeft className="h-4 w-4" />
            </span>
          )}
        </div>
      )}
      {m.text && (
        <p className="line-clamp-4 whitespace-pre-line px-3 py-2.5 text-[0.85rem] leading-relaxed">
          <span className="font-semibold">{brand.handle ?? brand.name}</span> {m.text}
        </p>
      )}
    </div>
  );
}

/** A media card: the references before approval, a forming canvas while it runs, the result when ready. */
function MediaResult({ view }: { view: CardView }) {
  const gen = view.card.generate;
  const refs = view.card.media ?? [];
  const cols = (n: number) => (n > 1 ? "grid-cols-2" : "grid-cols-1");
  if (view.status === "executing" && gen) {
    return (
      <div className={`grid gap-2 px-5 ${cols(gen.count)}`}>
        {Array.from({ length: gen.count }, (_, i) => (
          <MediaGenerating key={i} ratio={gen.ratio} label={gen.type === "video" ? "יוצר סרטון" : "יוצר תמונה"} />
        ))}
      </div>
    );
  }
  if (view.status === "done" && view.output?.length) {
    return (
      <div className={`grid gap-2 px-5 ${cols(view.output.length)}`}>
        {view.output.map((m, i) => (
          <a key={m.url} href={m.url} target="_blank" rel="noreferrer" className="reveal block overflow-hidden rounded-[8px] bg-surface-2" style={{ animationDelay: `${i * 140}ms`, aspectRatio: gen?.ratio ?? "4/5" }}>
            {m.type === "video" ? (
              <video src={m.url} className="h-full w-full object-cover" autoPlay muted loop playsInline />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.url} alt="" className="h-full w-full object-cover" />
            )}
          </a>
        ))}
      </div>
    );
  }
  if (!refs.length) return null;
  return (
    <div className="flex gap-2 px-5 pb-1">
      {refs.map((m, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={m.url} alt="" className="h-16 w-16 rounded-[6px] border border-line object-cover" />
      ))}
    </div>
  );
}

function Previews({ card, brand }: { card: Card; brand: Brand }) {
  const media = card.media ?? [];
  const [index, setIndex] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  if (!media.length) return null;

  const textOnly = media.length === 1 && !media[0].url;
  if (textOnly) return <p className="note mx-5 whitespace-pre-line text-[16px] leading-relaxed">{media[0].text}</p>;

  return (
    <div>
      <div
        ref={strip}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(Math.abs(el.scrollLeft) / (el.firstElementChild as HTMLElement).offsetWidth));
        }}
        className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-5"
      >
        {media.map((m, i) => (
          <div key={i} className="w-[min(78%,300px)] shrink-0 snap-center">
            <FeedPreview m={m} brand={brand} sponsored={card.kind === "campaign"} />
          </div>
        ))}
      </div>
      {media.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
          {media.map((_, i) => (
            <span key={i} className={`h-1 transition-all duration-300 ease-[var(--ease)] ${i === index ? "w-5 bg-ink" : "w-2 bg-ink-3/40"}`} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ProposalCard({ proposal, brand, onChange }: { proposal: CardView; brand: Brand; onChange: (title: string) => void }) {
  const [view, setView] = useState(proposal);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { card } = view;
  const kind = KIND[card.kind] ?? KIND.campaign;

  // While the platform executes in the background, follow the card until it finishes.
  useEffect(() => {
    if (view.status !== "executing") return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/proposals/${view.id}`, { cache: "no-store" });
      if (res.ok) {
        const next = await res.json();
        if (next.status !== "executing") setView((v) => ({ ...v, ...next }));
      }
    }, 2000);
    return () => clearInterval(t);
  }, [view.status, view.id]);

  async function decide(decision: "approve" | "decline") {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    // Immediate feedback: show the new state now, and roll back only if the server refuses.
    const before = view;
    setView((v) => ({ ...v, status: decision === "approve" ? "executing" : "declined", error: undefined }));
    try {
      const res = await fetch(`/api/proposals/${view.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The approval names the exact version the client is looking at.
        body: JSON.stringify({ decision, version: view.version }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) {
        setView(before);
        setNotice(data.error ?? "משהו השתבש");
        return;
      }
      if (decision === "decline") {
        setView((v) => ({ ...v, status: data.status }));
        if (data.status === "declined" && card.kind !== "change" && card.kind !== "budget") onChange(card.title);
      } else {
        setView((v) => ({ ...v, status: "executing", error: undefined }));
      }
    } finally {
      setBusy(false);
    }
  }

  const status = STATUS[view.status];
  const settled = ["declined", "cancelled", "superseded"].includes(view.status);

  return (
    <article key={view.status === "done" ? "done" : "live"} className={`card-float rise w-full max-w-[480px] overflow-hidden transition-opacity duration-500 ${view.status === "done" ? "flash" : ""} ${settled ? "opacity-60" : ""}`}>
      <div className="h-[2px] w-full overflow-hidden">{view.status === "executing" && <div className="progress-light h-full w-1/3" />}</div>

      <header className="flex items-center justify-between gap-3 px-5 pt-3.5">
        <span className="text-[13.5px] font-semibold text-ink-3">{kind.label}</span>
        {status && <span className={status.tag}>{view.status === "done" ? kind.done : status.label}</span>}
      </header>

      <div className="px-5 pb-4 pt-2">
        <h3 className="serif text-[25px] font-medium leading-[1.2]">{card.title}</h3>
        {card.why && <p className="mt-2 text-[16px] leading-[1.55] text-ink-2">{card.why}</p>}
      </div>

      {card.kind === "media" ? <MediaResult view={view} /> : <Previews card={card} brand={brand} />}

      <dl className="mx-5 mt-4 border-t border-line">
        {card.rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-6 border-b border-line py-2.5">
            <dt className="shrink-0 text-[15px] text-ink-2">{r.label}</dt>
            <dd className="text-end text-[15.5px] font-semibold leading-snug">{r.value}</dd>
          </div>
        ))}
      </dl>

      <footer className="p-5">
        {view.status === "pending" && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button className="btn btn-primary sm:flex-1" disabled={busy} onClick={() => decide("approve")}>
              <Check className="h-4 w-4" strokeWidth={2.4} />
              {card.approveLabel}
            </button>
            <button className="btn btn-quiet" disabled={busy} onClick={() => decide("decline")}>
              {card.changeLabel}
            </button>
          </div>
        )}
        {view.status === "executing" && (
          <p className="text-[15px] text-ink-2">
            <span className="shimmer font-semibold">{card.kind === "media" ? "יוצר" : "מבצע"}</span>. אפשר לסגור את המסך, ומייקי יעדכן כשזה מוכן.
          </p>
        )}
        {view.status === "done" && (
          <p className="flex items-center gap-2 text-[15px] font-semibold text-good">
            <Check className="pop h-4 w-4" strokeWidth={2.6} />
            {card.kind === "media" ? "מוכן. התמונות נשמרו בספרייה" : `${kind.done}. מייקי עוקב אחרי זה מעכשיו`}
          </p>
        )}
        {view.status === "failed" && (
          <div className="space-y-3">
            <p className="note note-bad text-[15px] leading-relaxed">{view.error}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              {view.retryable !== false && (
                <button className="btn btn-primary sm:flex-1" disabled={busy} onClick={() => decide("approve")}>
                  <RotateCcw className="h-4 w-4" />
                  לנסות שוב
                </button>
              )}
              <button className="btn btn-quiet" disabled={busy} onClick={() => decide("decline")}>
                לבטל
              </button>
            </div>
          </div>
        )}
        {notice && <p className="note note-warn mt-3 text-[15px]">{notice}</p>}
      </footer>
    </article>
  );
}
