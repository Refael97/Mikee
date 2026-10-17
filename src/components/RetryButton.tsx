"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useT } from "@/components/Lang";

/**
 * Tries a failed part again: the page asks the server for its data once more, while everything already on
 * the screen stays where it is. Failures are never remembered, so this really asks Meta again.
 */
export function RetryButton({ label = "לנסות שוב" }: { label?: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(() => router.refresh())} className="btn btn-quiet btn-sm">
      {pending ? <span className="shimmer">{t("מנסה שוב…")}</span> : t(label)}
    </button>
  );
}
