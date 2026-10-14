import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { money } from "@/lib/meta/context";
import { GOAL_LABEL, type Period } from "@/lib/meta/performance";
import { allCampaigns, PLATFORMS, type PlatformCampaign } from "@/lib/platforms";
import { Page, PageHeader, Segmented } from "@/components/Page";

const PERIODS: { key: Period; label: string }[] = [
  { key: "last_7d", label: "7 ימים" },
  { key: "this_month", label: "החודש" },
  { key: "last_30d", label: "30 יום" },
];

const VERDICT = {
  star: { label: "מוביל", cls: "tag-good" },
  ok: { label: "בסדר", cls: "" },
  weak: { label: "חלש", cls: "tag-warn" },
  new: { label: "עוד לומד", cls: "tag-quiet" },
};

const fmt = (n: number) => new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 }).format(n);
const dateHe = (iso?: string) => (iso ? new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short" }).format(new Date(iso)) : null);
const cleanName = (n: string) => n.replace(/^Mikee · /, "").replace(/ · (mk-\w+|\d{4}-\d{2}-\d{2})$/, "");

function Row({ c, currency }: { c: PlatformCampaign; currency: string }) {
  const g = GOAL_LABEL[c.goal];
  const n = c.numbers;
  const status = c.live ? { t: "פעיל", cls: "tag-good" } : c.status === "PAUSED" ? { t: "מושהה", cls: "tag-warn" } : { t: "הסתיים", cls: "tag-quiet" };
  return (
    <li>
      <details className="group">
        <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] items-center gap-x-6 px-4 py-3 hover:bg-surface-2 sm:grid-cols-[minmax(0,1fr)_110px_110px_130px] [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ChevronLeft className="h-4 w-4 shrink-0 text-ink-3 transition-transform group-open:-rotate-90" strokeWidth={1.75} />
              <span className="truncate font-medium">{cleanName(c.name)}</span>
              <span className={`tag ${status.cls}`}>{status.t}</span>
            </div>
            <p className="mt-0.5 truncate ps-6 text-[13.5px] text-ink-3">
              {PLATFORMS.find((p) => p.id === c.platform)?.name} · {g.he} · {c.audience}
              {c.budget && ` · ${money(c.budget.amount, currency)} ${c.budget.per === "day" ? "ביום" : "סה״כ"}`}
            </p>
          </div>
          <Num value={money(n.spend, currency)} />
          <Num value={c.goal === "awareness" ? fmt(n.reach) : fmt(n.results)} className="hidden sm:block" />
          <Num
            value={c.goal === "sales" && n.roas ? `${n.roas.toFixed(1)} ₪` : n.costPerResult != null ? money(n.costPerResult, currency) : "—"}
            className="hidden sm:block"
          />
        </summary>

        <div className="border-t border-line bg-surface-2/50 px-4 py-4 sm:ps-10">
          {c.ads.length > 0 && (
            <div className="no-scrollbar flex snap-x gap-3 overflow-x-auto pb-1">
              {c.ads.map((a) => (
                <figure key={a.id} className="w-32 shrink-0 snap-start">
                  <div className="overflow-hidden rounded-[12px] border border-line bg-surface">
                    {a.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.thumbnail} alt="" className="aspect-[4/5] w-full object-cover" />
                    ) : (
                      <div className="aspect-[4/5]" />
                    )}
                  </div>
                  <figcaption className="mt-1.5 space-y-1 text-[12.5px] leading-snug">
                    <span className={`tag ${VERDICT[a.verdict].cls}`}>{VERDICT[a.verdict].label}</span>
                    <span className="block text-ink-2">
                      {a.numbers.results > 0 && a.numbers.costPerResult != null ? `${fmt(a.numbers.results)} ${g.plural} · ${money(a.numbers.costPerResult, currency)}` : `${money(a.numbers.spend, currency)} הושקעו`}
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-[14px] sm:grid-cols-4">
            {[
              ["חשיפות", fmt(n.impressions)],
              ["אנשים", fmt(n.reach)],
              ["קליקים", fmt(n.clicks)],
              ["אחוז הקלקה", `${n.ctr.toFixed(2)}%`],
              ["תדירות", n.frequency.toFixed(1)],
              [g.plural, fmt(n.results)],
              ["הכנסות", n.revenue ? money(n.revenue, currency) : "—"],
              ["תאריכים", `${dateHe(c.starts) ?? "—"}${dateHe(c.ends) ? ` עד ${dateHe(c.ends)}` : ""}`],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[12.5px] text-ink-3">{k}</dt>
                <dd className="num font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <Link href={`/mikee?q=${encodeURIComponent(`מה דעתך על הקמפיין "${cleanName(c.name)}"?`)}`} className="link mt-3 inline-block text-[14.5px]">
            לשאול את מייקי על הקמפיין הזה
          </Link>
        </div>
      </details>
    </li>
  );
}

function TableHead() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 border-b border-line bg-surface-2 px-4 py-2 text-[13px] font-medium text-ink-2 sm:grid-cols-[minmax(0,1fr)_110px_110px_130px]">
      <span className="ps-6">קמפיין</span>
      <span className="text-end">הושקעו</span>
      <span className="hidden text-end sm:block">תוצאות</span>
      <span className="hidden text-end sm:block">עלות לתוצאה</span>
    </div>
  );
}

function Num({ value, className = "" }: { value: string; className?: string }) {
  return <div className={`num text-end text-[15px] font-medium ${className}`}>{value}</div>;
}

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ p?: Period; show?: string }> }) {
  const { workspace } = await requireSession();
  const { p, show } = await searchParams;
  const period = PERIODS.some((x) => x.key === p) ? p! : "last_7d";
  const all = show === "all";
  const data = await allCampaigns(workspace.id, period);
  const list = data.campaigns
    .filter((c) => all || c.live || c.numbers.spend > 0)
    .sort((a, b) => Number(b.live) - Number(a.live) || b.numbers.spend - a.numbers.spend);
  const live = data.campaigns.filter((c) => c.live).length;

  return (
    <Page>
      <PageHeader
        title="קמפיינים"
        lead={data.connected.meta ? `${live} פעילים עכשיו, בכל הפלטפורמות` : "כל הקמפיינים, מכל הפלטפורמות, בשפה פשוטה"}
        action={<Segmented active={period} items={PERIODS.map((x) => ({ key: x.key, label: x.label, href: `/campaigns?p=${x.key}${all ? "&show=all" : ""}` }))} />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-line">
        {PLATFORMS.map((pl) => (
          <span key={pl.id} className={`-mb-px flex h-10 items-center gap-2 border-b-2 px-1 text-[14.5px] ${pl.id === "meta" ? "border-brand font-medium text-ink" : "border-transparent text-ink-3"}`}>
            {pl.name}
            {!pl.ready && <span className="tag tag-quiet">בקרוב</span>}
            {pl.ready && !data.connected[pl.id] && <span className="tag tag-warn">לא מחובר</span>}
          </span>
        ))}
        <span className="flex-1" />
        {data.connected.meta && (
          <Link href={`/campaigns?p=${period}${all ? "" : "&show=all"}`} className="link pb-2 text-[14px]">
            {all ? "רק פעילים" : "כולל קמפיינים שהסתיימו"}
          </Link>
        )}
      </div>

      {!data.connected.meta ? (
        <div className="card overflow-hidden">
          <TableHead />
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <p className="text-[15px] text-ink-2">אחרי חיבור חשבון המודעות, כל הקמפיינים יופיעו כאן עם מה שהם מביאים.</p>
            <Link href="/settings#connectors" className="btn btn-primary btn-sm">
              לחיבור חשבון המודעות
            </Link>
          </div>
        </div>
      ) : data.error ? (
        <p className="note note-warn">לא הצלחתי לקרוא את הקמפיינים כרגע. נסי לרענן בעוד רגע.</p>
      ) : list.length === 0 ? (
        <div className="card overflow-hidden">
          <TableHead />
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <p className="text-[15px] text-ink-2">אין קמפיינים פעילים בתקופה הזאת.</p>
            <Link href="/mikee?q=בוא נבנה קמפיין" className="btn btn-primary btn-sm">
              לבנות קמפיין עם מייקי
            </Link>
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <TableHead />
          <ul className="divide-y divide-line">
            {list.map((c) => (
              <Row key={`${c.platform}-${c.id}`} c={c} currency={data.currency} />
            ))}
          </ul>
        </div>
      )}
    </Page>
  );
}
