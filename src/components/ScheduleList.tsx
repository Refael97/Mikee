"use client";

import { useState } from "react";
import Link from "next/link";
import { Empty } from "./Page";
import type { ScheduledTask } from "@/lib/schedule-list";
import { useT } from "@/components/Lang";

/** Every publication she asked Mikee to run later: the task, when, and a way to stop it. */
export function ScheduleList({ tasks }: { tasks: ScheduledTask[] }) {
  const t = useT();
  const [rows, setRows] = useState(tasks);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function cancel(id: string) {
    setBusy(id);
    setErrors((e) => ({ ...e, [id]: "" }));
    try {
      const res = await fetch(`/api/proposals/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "decline" }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || data.ok === false) {
        setErrors((e) => ({ ...e, [id]: data.error || t("לא הצלחתי לבטל. אפשר לנסות שוב.") }));
        setBusy(null);
        return;
      }
      setRows((list) => list.filter((row) => row.id !== id));
    } catch {
      setErrors((e) => ({ ...e, [id]: t("לא הצלחתי לבטל. אפשר לנסות שוב.") }));
    }
    setBusy(null);
  }

  if (!rows.length) {
    return <Empty title={t("אין תזמונים")} text={t("כשתאשרי למייקי לפרסם במועד, המשימה תופיע כאן.")} action={<Link href="/mikee" className="btn btn-primary">{t("לשיחה עם מייקי")}</Link>} />;
  }

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.id} className="card flex items-center gap-4 px-4 py-4 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-light leading-snug text-ink">{t(row.title)}</p>
            <p className="meta mt-1 tabular-nums">{row.when}</p>
            {errors[row.id] && <p className="mt-1.5 text-[13.5px] text-bad">{errors[row.id]}</p>}
          </div>
          <button type="button" className="btn btn-quiet btn-sm shrink-0" disabled={busy === row.id} onClick={() => cancel(row.id)}>
            {busy === row.id ? t("מבטל") : t("ביטול")}
          </button>
        </li>
      ))}
    </ul>
  );
}
