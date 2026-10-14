"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * Tries a failed part again: the page asks the server for its data once more, while everything already on
 * the screen stays where it is. Failures are never remembered, so this really asks Meta again.
 */
export function RetryButton({ label = "לנסות שוב" }: { label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(() => router.refresh())} className="btn btn-quiet btn-sm">
      {pending ? <span className="shimmer">מנסה שוב…</span> : label}
    </button>
  );
}
