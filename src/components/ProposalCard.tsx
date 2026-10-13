"use client";

import { useEffect, useState } from "react";
import type { CardView } from "@/lib/conversation";

const STATUS: Record<string, { label: string; tone: string }> = {
  done: { label: "בוצע ✓", tone: "text-good" },
  declined: { label: "לא הפעם", tone: "text-ink-3" },
  cancelled: { label: "בוטל", tone: "text-ink-3" },
  superseded: { label: "הוחלף בגרסה חדשה", tone: "text-ink-3" },
  failed: { label: "לא הצליח", tone: "text-warn" },
};

export function ProposalCard({ proposal, onChange }: { proposal: CardView; onChange: (title: string) => void }) {
  const [view, setView] = useState(proposal);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { card } = view;

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

  const media = card.media?.filter((m) => m.url) ?? [];
  const textOnly = card.media?.find((m) => !m.url)?.text;
  const faded = view.status === "superseded" || view.status === "declined" || view.status === "cancelled";

  return (
    <div className={`card fade-in w-full max-w-md overflow-hidden transition-opacity ${faded ? "opacity-60" : ""}`}>
      <div className="p-5 pb-4">
        <h3 className="text-lg font-semibold leading-snug tracking-tight">{card.title}</h3>
        {card.why && <p className="mt-1.5 text-[0.95rem] leading-relaxed text-ink-2">{card.why}</p>}
      </div>

      {media.length > 0 && (
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-4">
          {media.map((m, i) => (
            <figure key={i} className="w-64 shrink-0 snap-start overflow-hidden rounded-2xl bg-surface-2">
              {m.type === "video" ? (
                <video src={m.url} className="aspect-[4/5] w-full object-cover" autoPlay muted loop playsInline />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt="" className="aspect-[4/5] w-full object-cover" />
              )}
              {(m.text || m.headline) && (
                <figcaption className="space-y-1 p-3 text-sm">
                  {m.text && <p className="whitespace-pre-line leading-relaxed">{m.text}</p>}
                  {(m.headline || m.cta) && (
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="truncate font-medium">{m.headline}</span>
                      {m.cta && <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-xs">{m.cta}</span>}
                    </div>
                  )}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      )}
      {textOnly && <p className="mx-5 mb-4 whitespace-pre-line rounded-2xl bg-surface-2 p-4 text-sm leading-relaxed">{textOnly}</p>}

      <dl className="divide-y divide-line border-t border-line px-5">
        {card.rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-4 py-3 text-[0.95rem]">
            <dt className="shrink-0 text-ink-2">{r.label}</dt>
            <dd className="text-start font-medium">{r.value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap items-center gap-2 border-t border-line p-4 [&_.btn]:whitespace-nowrap">
        {view.status === "pending" && (
          <>
            <button className="btn btn-primary" disabled={busy} onClick={() => decide("approve")}>
              {card.approveLabel}
            </button>
            <button className="btn btn-quiet" disabled={busy} onClick={() => decide("decline")}>
              {card.changeLabel}
            </button>
          </>
        )}
        {view.status === "executing" && (
          <span className="flex items-center gap-2 px-1 text-ink-2">
            <span className="orb orb-live h-4 w-4" /> מייקי על זה… אפשר לסגור את המסך, זה ימשיך
          </span>
        )}
        {view.status === "failed" && (
          <div className="w-full space-y-3">
            <p className="px-1 text-sm">
              <span className="font-medium text-warn">לא הצליח. </span>
              <span className="text-ink-2">{view.error}</span>
            </p>
            <div className="flex gap-2">
              {view.retryable !== false && (
                <button className="btn btn-primary" disabled={busy} onClick={() => decide("approve")}>
                  לנסות שוב
                </button>
              )}
              <button className="btn btn-quiet" disabled={busy} onClick={() => decide("decline")}>
                לבטל
              </button>
            </div>
          </div>
        )}
        {STATUS[view.status] && view.status !== "failed" && (
          <span className={`px-1 font-medium ${STATUS[view.status].tone}`}>{STATUS[view.status].label}</span>
        )}
        {notice && <p className="w-full px-1 text-sm text-warn">{notice}</p>}
      </div>
    </div>
  );
}
