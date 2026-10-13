"use client";

import { useState } from "react";
import type { ProposalCard as Card } from "@/lib/specs";

const STATUS: Record<string, { label: string; tone: string }> = {
  done: { label: "בוצע ✓", tone: "text-good" },
  declined: { label: "לא הפעם", tone: "text-ink-3" },
  failed: { label: "לא הצליח", tone: "text-warn" },
};

export function ProposalCard({
  proposal,
  onChange,
}: {
  proposal: { id: string; status: string; card: Card; error?: string };
  onChange: (title: string) => void;
}) {
  const [status, setStatus] = useState(proposal.status);
  const [error, setError] = useState(proposal.error);
  const [busy, setBusy] = useState(false);
  const { card } = proposal;

  async function decide(decision: "approve" | "decline") {
    setBusy(true);
    try {
      const res = await fetch(`/api/proposals/${proposal.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json().catch(() => ({}));
      if (decision === "decline") {
        setStatus("declined");
        if (card.kind !== "change" && card.kind !== "budget") onChange(card.title);
      } else {
        setStatus(data.ok ? "done" : "failed");
        if (!data.ok) setError(data.error);
      }
    } finally {
      setBusy(false);
    }
  }

  const media = card.media?.filter((m) => m.url) ?? [];
  const textOnly = card.media?.find((m) => !m.url)?.text;

  return (
    <div className="card fade-in w-full max-w-md overflow-hidden">
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
                  {m.text && <p className="line-clamp-3 leading-relaxed">{m.text}</p>}
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
        {status === "pending" ? (
          busy ? (
            <span className="flex items-center gap-2 px-1 text-ink-2">
              <span className="orb orb-live h-4 w-4" /> מייקי על זה…
            </span>
          ) : (
            <>
              <button className="btn btn-primary" onClick={() => decide("approve")}>
                {card.approveLabel}
              </button>
              <button className="btn btn-quiet" onClick={() => decide("decline")}>
                {card.changeLabel}
              </button>
            </>
          )
        ) : (
          <span className={`px-1 font-medium ${STATUS[status]?.tone ?? "text-ink-2"}`}>
            {STATUS[status]?.label ?? status}
            {status === "failed" && error && <span className="block text-sm font-normal text-ink-2">{error}</span>}
          </span>
        )}
      </div>
    </div>
  );
}
