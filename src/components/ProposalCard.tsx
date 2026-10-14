"use client";

import type { Autonomy } from "@/lib/autonomy";
import { useEffect, useRef, useState } from "react";
import { Bookmark, Check, ChevronLeft, ChevronRight, Clapperboard, Heart, ImageIcon, Megaphone, MessageCircle, MoreHorizontal, PenLine, Power, RotateCcw, Send, SlidersHorizontal, Wallet } from "lucide-react";
import type { CardView } from "@/lib/conversation";
import type { ProposalCard as Card } from "@/lib/specs";
import { MediaGenerating } from "./Live";
import { plainTitle } from "@/lib/text";
import { cueMikee } from "./MikeeAvatar";
import { IdentityPicker } from "./AdvertiserIdentity";

export type Brand = { name: string; handle?: string; /** The profile picture (Instagram, else the page). */ avatar?: string };

const KIND: Record<Card["kind"], { label: string; done: string; icon: typeof Megaphone }> = {
  campaign: { label: "קמפיין חדש", done: "נבנה, מושהה", icon: Megaphone },
  activate: { label: "הפעלת קמפיין", done: "פעיל", icon: Power },
  change: { label: "שינוי בקמפיין", done: "עודכן", icon: SlidersHorizontal },
  post: { label: "פוסט", done: "פורסם", icon: PenLine },
  budget: { label: "תוספת תקציב", done: "אושר", icon: Wallet },
  media: { label: "תמונות וסרטונים", done: "מוכן", icon: ImageIcon },
  video: { label: "סרטון", done: "מוכן", icon: Clapperboard },
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

/** Instagram shows a feed photo at its own shape between 4:5 (tall) and 1.91:1 (wide); beyond that it crops. */
const clampRatio = (r: number) => Math.min(1.91, Math.max(0.8, r));

/** The business's picture, or its initial while there is none. */
function Avatar({ brand }: { brand: Brand }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#feda75] via-[#d62976] to-[#4f5bd5] p-[2px]">
      <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 border-surface bg-surface text-xs font-semibold">
        {brand.avatar && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.avatar} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
        ) : (
          brand.name.slice(0, 1)
        )}
      </span>
    </span>
  );
}

/** How the ad or post will look in the feed: the client approves what her customers will see. */
function FeedPreview({ m, brand, sponsored }: { m: Media; brand: Brand; sponsored: boolean }) {
  const [ratio, setRatio] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  const [failed, setFailed] = useState(false);
  // Media already in the ad account is shown through a fresh link (Meta's own links expire).
  const src = m.metaVideoId ? `/api/meta/media?video=${m.metaVideoId}` : m.metaImageHash ? `/api/meta/media?image=${m.metaImageHash}` : m.url;
  const poster = m.metaVideoId ? `/api/meta/media?video=${m.metaVideoId}&poster=1` : undefined;
  // A "video" whose address is a picture (a thumbnail) is shown as the picture.
  const isVideo = m.type === "video" && !(!m.metaVideoId && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(m.url));
  const name = brand.handle ?? brand.name;
  const icon = "h-[22px] w-[22px]";
  return (
    <div className="overflow-hidden rounded-[8px] border border-line bg-surface text-ink" dir="ltr">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Avatar brand={brand} />
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[0.85rem] font-semibold">{name}</span>
          {sponsored && <span className="block text-[0.72rem] text-ink-3">ממומן</span>}
        </span>
        <MoreHorizontal className="ms-auto h-5 w-5 text-ink-2" />
      </div>
      <div className="relative w-full overflow-hidden bg-surface-2" style={{ aspectRatio: String(ratio ?? 0.8) }}>
        {src &&
          !failed &&
          (isVideo ? (
            <video
              src={src}
              poster={poster}
              className="absolute inset-0 h-full w-full object-cover"
              autoPlay
              muted
              loop
              playsInline
              onError={() => setFailed(true)}
              onLoadedMetadata={(e) => e.currentTarget.videoWidth && setRatio(clampRatio(e.currentTarget.videoWidth / e.currentTarget.videoHeight))}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              onError={() => setFailed(true)}
              onLoad={(e) => e.currentTarget.naturalWidth && setRatio(clampRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight))}
            />
          ))}
        {(failed || !src) && (
          <span className="absolute inset-0 flex items-center justify-center px-6 text-center text-[13px] text-ink-3" dir="rtl">
            {m.type === "video" ? "לא הצלחנו לטעון את התצוגה של הסרטון. הוא עדיין ישמש במודעה." : "לא הצלחנו לטעון את התמונה."}
          </span>
        )}
      </div>
      {sponsored && (m.cta || m.headline) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2.5" dir="rtl">
          <span className="truncate text-[0.85rem] font-semibold">{m.headline}</span>
          {m.cta && (
            <span className="flex shrink-0 items-center gap-0.5 text-[0.82rem] font-semibold text-[#0095f6]">
              {m.cta}
              <ChevronLeft className="h-4 w-4" />
            </span>
          )}
        </div>
      )}
      <div className="flex items-center gap-3.5 px-3 pt-2.5 text-ink">
        <Heart className={icon} strokeWidth={1.8} />
        <MessageCircle className={`${icon} -scale-x-100`} strokeWidth={1.8} />
        <Send className={icon} strokeWidth={1.8} />
        <Bookmark className={`${icon} ms-auto`} strokeWidth={1.8} />
      </div>
      {m.text && (
        <div className="px-3 pb-3 pt-2 text-[0.85rem] leading-[1.45]" dir="rtl">
          <p className={`whitespace-pre-line ${more ? "" : "line-clamp-3"}`}>
            <span className="font-semibold" dir="ltr">
              {name}
            </span>{" "}
            {m.text}
          </p>
          {!more && m.text.length > 120 && (
            <button type="button" onClick={() => setMore(true)} className="mt-0.5 text-ink-3">
              עוד
            </button>
          )}
        </div>
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
      <div className={`grid gap-2 px-4 ${cols(gen.count)}`}>
        {Array.from({ length: gen.count }, (_, i) => (
          <MediaGenerating key={i} ratio={gen.ratio} label={gen.type === "video" ? "יוצר סרטון" : "יוצר תמונה"} />
        ))}
      </div>
    );
  }
  if (view.status === "done" && view.output?.length) {
    return (
      <div className={`grid gap-2 px-4 ${cols(view.output.length)}`}>
        {view.output.map((m, i) => (
          <a key={m.url} href={m.url} target="_blank" rel="noreferrer" className="reveal block overflow-hidden rounded-[12px] bg-surface-2" style={{ animationDelay: `${i * 140}ms`, aspectRatio: gen?.ratio ?? "4/5" }}>
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
    <div className="flex gap-2 px-4 pb-1">
      {refs.map((m, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={m.url} alt="" className="h-16 w-16 rounded-[12px] border border-line object-cover" />
      ))}
    </div>
  );
}

/** A video card: the composition plays in the card before approval; then the forming canvas, then the MP4. */
function VideoPreview({ view }: { view: CardView }) {
  const preview = view.card.preview;
  if (!preview) return <MediaResult view={view} />;
  const tall = preview.ratio === "9/16";
  const out = view.status === "done" ? view.output?.[0] : undefined;
  return (
    <div className="px-4">
      <div className="mx-auto overflow-hidden rounded-[12px] border border-line bg-[#111]" style={{ aspectRatio: preview.ratio, width: tall ? "min(62%, 270px)" : "100%" }}>
        {out ? (
          <video src={out.url} className="reveal h-full w-full" controls playsInline preload="metadata" />
        ) : view.status === "executing" ? (
          <MediaGenerating ratio={preview.ratio} label="מרנדר את הסרטון" />
        ) : (
          <iframe
            src={`/api/video/preview/${view.id}/index.html`}
            title="תצוגה מקדימה של הסרטון"
            className="h-full w-full border-0"
            sandbox="allow-scripts allow-same-origin"
            loading="lazy"
          />
        )}
      </div>
      {view.status === "pending" && <p className="mt-2 text-center text-[13px] text-ink-3">תצוגה מקדימה. הסרטון הסופי יהיה באיכות מלאה.</p>}
      {out && (
        <p className="mt-2 text-center text-[13px]">
          <a href={out.url} download className="link">
            הורדת הסרטון
          </a>
        </p>
      )}
    </div>
  );
}

function Previews({ card, brand }: { card: Card; brand: Brand }) {
  const media = card.media ?? [];
  const [index, setIndex] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  if (!media.length) return null;

  const textOnly = media.length === 1 && !media[0].url;
  if (textOnly) return <p className="mx-4 whitespace-pre-line rounded-[12px] bg-surface-2 p-3 text-[15px] leading-relaxed">{media[0].text}</p>;

  const endDrag = (el: HTMLDivElement) => {
    if (!drag.current) return;
    dragged.current = drag.current.moved;
    drag.current = null;
    el.style.scrollSnapType = "";
    el.style.scrollBehavior = "";
    // Settle on the nearest preview.
    const w = (el.firstElementChild as HTMLElement).offsetWidth + 12;
    go(Math.round(Math.abs(el.scrollLeft) / w));
  };
  // Each preview is brought into view by index; scrollIntoView handles right-to-left layout by itself.
  const go = (i: number) => {
    const el = strip.current?.children[Math.max(0, Math.min(media.length - 1, i))] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  };

  return (
    <div className="relative">
      <div
        ref={strip}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(Math.abs(el.scrollLeft) / (el.firstElementChild as HTMLElement).offsetWidth));
        }}
        // With a mouse, the strip can be dragged sideways (touch and trackpads already swipe).
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse" || media.length < 2) return;
          const el = e.currentTarget;
          e.preventDefault(); // no native image drag or text selection
          el.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, left: el.scrollLeft, moved: false };
          el.style.scrollSnapType = "none";
          el.style.scrollBehavior = "auto";
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          if (Math.abs(e.clientX - d.x) > 4) d.moved = true;
          e.currentTarget.scrollLeft = d.left - (e.clientX - d.x);
        }}
        onPointerUp={(e) => endDrag(e.currentTarget)}
        onPointerCancel={(e) => endDrag(e.currentTarget)}
        onDragStart={(e) => e.preventDefault()}
        onClickCapture={(e) => {
          // A drag is not a click on the video or the caption.
          if (dragged.current) {
            e.stopPropagation();
            e.preventDefault();
            dragged.current = false;
          }
        }}
        className={`no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 ${media.length === 1 ? "justify-center" : ""}`}
      >
        {media.map((m, i) => (
          <div key={i} className={`shrink-0 snap-center ${media.length === 1 ? "w-full max-w-[360px]" : "w-[min(80%,320px)]"}`}>
            <FeedPreview m={m} brand={brand} sponsored={card.kind === "campaign" || card.kind === "activate"} />
          </div>
        ))}
      </div>
      {media.length > 1 && (
        <>
          <button
            type="button"
            aria-label="המודעה הקודמת"
            onClick={() => go(index - 1)}
            disabled={index === 0}
            className="absolute start-1 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface shadow-[var(--shadow)] transition-opacity disabled:pointer-events-none disabled:opacity-0 sm:flex"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="המודעה הבאה"
            onClick={() => go(index + 1)}
            disabled={index >= media.length - 1}
            className="absolute end-1 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface shadow-[var(--shadow)] transition-opacity disabled:pointer-events-none disabled:opacity-0 sm:flex"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="mt-3 flex justify-center gap-1">
            {media.map((_, i) => (
              <button key={i} type="button" aria-label={`מודעה ${i + 1} מתוך ${media.length}`} onClick={() => go(i)} className="flex h-6 items-center px-0.5">
                <span className={`h-1.5 rounded-full transition-all duration-300 ease-[var(--ease)] ${i === index ? "w-4 bg-brand" : "w-1.5 bg-ink-3/40"}`} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function ProposalCard({ proposal, brand, onChange, autonomy }: { proposal: CardView; brand: Brand; onChange: (title: string) => void; autonomy?: Autonomy }) {
  // At "final approval only" a campaign card is the one approval: it is built and, if the check passes, goes live.
  const finalOnly = autonomy === "final" && proposal.card.kind === "campaign";
  const [view, setView] = useState(proposal);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [identitySaved, setIdentitySaved] = useState(false);
  const { card } = view;
  const kind = KIND[card.kind] ?? KIND.campaign;

  // While the platform executes in the background, follow the card until it finishes.
  useEffect(() => {
    if (view.status !== "executing") return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/proposals/${view.id}`, { cache: "no-store" });
      if (res.ok) {
        const next = await res.json();
        if (next.status !== "executing") {
          setView((v) => ({ ...v, ...next }));
          // A built campaign opens its activation card: let the conversation pick it up.
          if (next.status === "done") window.dispatchEvent(new CustomEvent("mikee:timeline"));
          if (next.status === "done") cueMikee("celebrate");
          if (next.status === "failed") cueMikee("concern");
        }
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
        // Only a decline that means "let's change it" asks Mikee for a new version. "Not now" on an
        // activation (or a budget or change card) is just a no: nothing is said on her behalf.
        if (data.status === "declined" && ["campaign", "post", "media", "video"].includes(card.kind)) onChange(card.title);
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
      <header className="relative flex items-center justify-between gap-3 border-b border-line bg-surface-2 px-4 py-2">
        <span className="flex items-center gap-2 text-[13.5px] font-medium text-ink-2">
          <kind.icon className="h-4 w-4" strokeWidth={1.75} />
          {kind.label}
        </span>
        {status && <span className={status.tag}>{view.status === "done" ? kind.done : status.label}</span>}
        {view.status === "executing" && (
          <span className="absolute inset-x-0 bottom-[-1px] h-[2px] overflow-hidden">
            <span className="progress-light block h-full w-1/3" />
          </span>
        )}
      </header>

      <div className="px-4 pb-3 pt-3.5">
        <h3 className="text-[18px] font-semibold leading-snug">{plainTitle(card.title)}</h3>
        {card.why && <p className="mt-1 text-[15px] leading-[1.55] text-ink-2">{card.why}</p>}
      </div>

      {card.kind === "video" ? <VideoPreview view={view} /> : card.kind === "media" ? <MediaResult view={view} /> : <Previews card={card} brand={brand} />}

      <dl className="mx-4 mt-3 divide-y divide-line rounded-[12px] border border-line">
        {card.rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-6 px-3 py-2">
            <dt className="shrink-0 text-[14px] text-ink-2">{r.label}</dt>
            <dd className="text-end text-[14.5px] font-medium leading-snug">{r.value}</dd>
          </div>
        ))}
      </dl>

      <footer className="p-4">
        {view.status === "pending" && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button className="btn btn-primary btn-lg sm:flex-1" disabled={busy} onClick={() => decide("approve")}>
              <Check className="h-4 w-4" strokeWidth={2.4} />
              {finalOnly ? "לבנות ולהעלות לאוויר" : card.approveLabel}
            </button>
            <button className="btn btn-quiet btn-lg" disabled={busy} onClick={() => decide("decline")}>
              {card.changeLabel}
            </button>
          </div>
        )}
        {view.status === "pending" && finalOnly && (
          <p className="mt-2 text-[13.5px] text-ink-3">זה האישור היחיד: הקמפיין ייבנה, ייבדק ויעלה לאוויר. אם מטא תמצא בעיה הוא יישאר מושהה, ויגיע אלייך כרטיס הפעלה.</p>
        )}
        {view.status === "executing" && (
          <p className="text-[14.5px] text-ink-2">
            <span className="shimmer font-medium">{({ media: "יוצר", video: "מרנדר את הסרטון", campaign: finalOnly ? "בונה את הקמפיין ובודק אותו לפני העלייה לאוויר" : "בונה את הקמפיין במצב מושהה", activate: "מפעיל" } as Record<string, string>)[card.kind] ?? "מבצע"}</span>. אפשר לסגור את המסך, ומייקי יעדכן כשזה מוכן.
          </p>
        )}
        {view.status === "done" && (
          <p className="flex items-center gap-2 text-[14.5px] font-medium text-good">
            <Check className="pop h-4 w-4" strokeWidth={2.6} />
            {card.kind === "media"
              ? "מוכן. התמונות נשמרו בספרייה"
              : card.kind === "video"
                ? "מוכן. הסרטון נשמר בספרייה"
              : card.kind === "campaign"
                ? view.autoActivated
                  ? "נבנה, נבדק ועלה לאוויר לפי האישור שלך"
                  : "נבנה במצב מושהה ונבדק. כרטיס ההפעלה מחכה לך למטה"
                : `${kind.done}. מייקי עוקב אחרי זה מעכשיו`}
          </p>
        )}
        {view.status === "failed" && (
          <div className="space-y-3">
            <p className="note note-bad text-[15px] leading-relaxed">{view.error}</p>
            {view.needsIdentity && !identitySaved && (
              <div className="rounded-[12px] border border-line p-3">
                <IdentityPicker
                  proposalId={view.id}
                  onSaved={() => {
                    setIdentitySaved(true);
                    setNotice(null);
                  }}
                />
              </div>
            )}
            {identitySaved && <p className="note note-good text-[14.5px]">נשמר. עכשיו אפשר לנסות שוב, וקבוצת המודעות תיבנה עם המפרסם והמשלם שבחרת.</p>}
            {view.technical && (
              <details className="rounded-[12px] border border-line px-3 py-2 text-[13.5px]">
                <summary className="cursor-pointer text-ink-2">פרטים טכניים מהשגיאה</summary>
                <dl className="mt-2 space-y-1">
                  {view.technical.lines.map((l) => (
                    <div key={l.label} className="flex gap-2">
                      <dt className="shrink-0 text-ink-3">{l.label}:</dt>
                      <dd className="min-w-0 select-all break-words font-mono text-[12.5px]" dir="auto">
                        {l.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
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
