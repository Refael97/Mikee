"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, Megaphone, PenLine, RotateCcw, SlidersHorizontal, Wallet, Wand2 } from "lucide-react";
import type { CardView } from "@/lib/conversation";
import type { ProposalCard as Card } from "@/lib/specs";

export type Brand = { name: string; handle?: string };

const KIND: Record<Card["kind"], { label: string; icon: typeof Megaphone }> = {
  campaign: { label: "קמפיין חדש", icon: Megaphone },
  change: { label: "שינוי בקמפיין", icon: SlidersHorizontal },
  post: { label: "פוסט", icon: PenLine },
  budget: { label: "תקציב", icon: Wallet },
  media: { label: "ויז׳ואל חדש", icon: Wand2 },
};

const STATUS: Record<string, { label: string; dot: string }> = {
  executing: { label: "מייקי על זה", dot: "bg-accent animate-pulse" },
  done: { label: "בוצע", dot: "bg-good" },
  failed: { label: "לא הצליח", dot: "bg-warn" },
  declined: { label: "לא הפעם", dot: "bg-ink-3" },
  cancelled: { label: "בוטל", dot: "bg-ink-3" },
  superseded: { label: "הוחלף בגרסה חדשה", dot: "bg-ink-3" },
};

type Media = NonNullable<Card["media"]>[number];

/** How the ad or post will look in the feed: the client approves what her customers will see. */
function FeedPreview({ m, brand, sponsored }: { m: Media; brand: Brand; sponsored: boolean }) {
  return (
    <div className="overflow-hidden rounded-[18px] bg-surface hairline">
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
            <span className="flex shrink-0 items-center gap-0.5 text-[0.82rem] font-semibold text-accent">
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

function Previews({ card, brand }: { card: Card; brand: Brand }) {
  const media = card.media ?? [];
  const [index, setIndex] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  if (!media.length) return null;

  if (card.kind === "media") {
    return (
      <div className="flex gap-2 px-5 pb-1">
        {media.map((m, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={m.url} alt="" className="h-16 w-16 rounded-xl object-cover hairline" />
        ))}
      </div>
    );
  }
  const textOnly = media.length === 1 && !media[0].url;
  if (textOnly) return <p className="mx-5 whitespace-pre-line rounded-[18px] bg-surface-2 p-4 text-[0.95rem] leading-relaxed">{media[0].text}</p>;

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
            <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? "w-4 bg-ink" : "w-1.5 bg-ink-3/40"}`} />
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
    try {
      const res = await fetch(`/api/proposals/${view.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The approval names the exact version the client is looking at.
        body: JSON.stringify({ decision, version: view.version }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) {
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
    <article className={`float rise w-full max-w-[460px] overflow-hidden rounded-[28px] transition-opacity duration-500 ${settled ? "opacity-55" : ""}`}>
      {view.status === "executing" && (
        <div className="h-0.5 w-full overflow-hidden bg-surface-2">
          <div className="h-full w-1/3 animate-[shimmer_1.4s_linear_infinite] bg-gradient-to-l from-transparent via-accent to-transparent" />
        </div>
      )}

      <header className="flex items-center justify-between gap-3 px-5 pt-5">
        <span className="flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-2">
          <kind.icon className="h-3.5 w-3.5" strokeWidth={2} />
          {kind.label}
        </span>
        {status && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
        )}
      </header>

      <div className="px-5 pb-4 pt-3">
        <h3 className="text-[1.3rem] font-semibold leading-snug tracking-[-0.01em]">{card.title}</h3>
        {card.why && <p className="mt-1.5 text-[0.95rem] leading-relaxed text-ink-2">{card.why}</p>}
      </div>

      <Previews card={card} brand={brand} />

      <dl className="grid grid-cols-2 gap-2 p-5 pb-0">
        {card.rows.map((r) => (
          <div key={r.label} className={`rounded-2xl bg-surface-2 px-3.5 py-3 ${r.value.length > 26 ? "col-span-2" : ""}`}>
            <dt className="text-xs text-ink-3">{r.label}</dt>
            <dd className="mt-0.5 text-[0.95rem] font-medium leading-snug">{r.value}</dd>
          </div>
        ))}
      </dl>

      <footer className="p-5">
        {view.status === "pending" && (
          <div className="flex gap-2">
            <button className="btn btn-primary flex-1" disabled={busy} onClick={() => decide("approve")}>
              <Check className="h-4 w-4" strokeWidth={2.4} />
              {card.approveLabel}
            </button>
            <button className="btn btn-quiet" disabled={busy} onClick={() => decide("decline")}>
              {card.changeLabel}
            </button>
          </div>
        )}
        {view.status === "executing" && <p className="text-sm text-ink-2">אפשר לסגור את המסך, זה ימשיך לרוץ ומייקי יעדכן כשזה מוכן.</p>}
        {view.status === "done" && <p className="flex items-center gap-2 text-sm font-medium text-good"><Check className="h-4 w-4" /> בוצע בהצלחה</p>}
        {view.status === "failed" && (
          <div className="space-y-3">
            <p className="rounded-2xl bg-warn/8 px-3.5 py-3 text-sm leading-relaxed text-ink-2">{view.error}</p>
            <div className="flex gap-2">
              {view.retryable !== false && (
                <button className="btn btn-primary flex-1" disabled={busy} onClick={() => decide("approve")}>
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
        {notice && <p className="mt-3 text-sm text-warn">{notice}</p>}
      </footer>
    </article>
  );
}
