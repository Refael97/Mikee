import Link from "next/link";
import { Suspense } from "react";
import { type DateRange, rangeQuery } from "@/lib/date-range";
import { PLATFORMS } from "@/lib/platforms";
import { DateRangePicker } from "@/components/DateRangePicker";
import { Page, PageHeader } from "@/components/Page";
import { Sk } from "@/components/Skeleton";

export function TableHead() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 border-b border-line bg-surface-2 px-4 py-2 text-[13px] font-medium text-ink-2 sm:grid-cols-[minmax(0,1fr)_110px_110px_130px]">
      <span className="ps-6">קמפיין</span>
      <span className="text-end">הושקעו</span>
      <span className="hidden text-end sm:block">תוצאות</span>
      <span className="hidden text-end sm:block">עלות לתוצאה</span>
    </div>
  );
}

/** The rows the table waits for: shimmering in the shape of real campaigns, under the real header. */
export function RowsSkeleton() {
  return (
    <ul className="divide-y divide-line" aria-busy="true" aria-label="טוען את הקמפיינים">
      {[0, 1, 2].map((i) => (
        <li key={i} className="grid grid-cols-[1fr_auto] items-center gap-x-6 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_110px_110px_130px]">
          <div className="min-w-0 ps-6">
            <Sk w={["55%", "42%", "48%"][i]} h="15px" />
            <div className="mt-2">
              <Sk w={["70%", "60%", "66%"][i]} h="11px" />
            </div>
          </div>
          <div className="text-end">
            <Sk w="64px" h="14px" />
          </div>
          <div className="hidden text-end sm:block">
            <Sk w="28px" h="14px" />
          </div>
          <div className="hidden text-end sm:block">
            <Sk w="56px" h="14px" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CampaignsShell({ range, today, tz, all, connected, rows, count }: { range?: DateRange; today?: string; tz?: string; all: boolean; connected: boolean; rows?: React.ReactNode; count?: React.ReactNode }) {
  const period = range ? rangeQuery(range) : undefined;
  return (
    <Page>
      <PageHeader
        title="קמפיינים"
        lead={
          connected ? (
            <>
              <Suspense key={`${period}-${all}`} fallback={<Sk w="1.2em" />}>{count ?? <Sk w="1.2em" />}</Suspense> פעילים עכשיו, בכל הפלטפורמות
            </>
          ) : (
            "כל הקמפיינים, מכל הפלטפורמות, בשפה פשוטה"
          )
        }
        action={
          range && today && tz ? (
            <DateRangePicker value={range} today={today} tz={tz} path="/campaigns" extra={all ? "&show=all" : ""} />
          ) : (
            <Sk w="260px" h="40px" />
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-line">
        {PLATFORMS.map((pl) => (
          <span key={pl.id} className={`-mb-px flex h-10 items-center gap-2 border-b-2 px-1 text-[14.5px] ${pl.id === "meta" ? "border-brand font-medium text-ink" : "border-transparent text-ink-3"}`}>
            {pl.name}
            {!pl.ready && <span className="tag tag-quiet">בקרוב</span>}
            {pl.ready && pl.id === "meta" && !connected && <span className="tag tag-warn">לא מחובר</span>}
          </span>
        ))}
        <span className="flex-1" />
        {connected && (
          <Link href={`/campaigns?${period ?? "p=last_7d"}${all ? "" : "&show=all"}`} className="link pb-2 text-[14px]">
            {all ? "רק פעילים" : "כולל קמפיינים שהסתיימו"}
          </Link>
        )}
      </div>

      <div className="card overflow-hidden">
        <TableHead />
        {!connected ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <p className="text-[15px] text-ink-2">אחרי חיבור חשבון המודעות, כל הקמפיינים יופיעו כאן עם מה שהם מביאים.</p>
            <Link href="/settings#connectors" className="btn btn-primary btn-sm">
              לחיבור חשבון המודעות
            </Link>
          </div>
        ) : (
          // A new key per view: switching the period shows the skeleton in the table at once, not the old rows.
          <Suspense key={`${period}-${all}`} fallback={<RowsSkeleton />}>
            {rows ?? <RowsSkeleton />}
          </Suspense>
        )}
      </div>
    </Page>
  );
}
