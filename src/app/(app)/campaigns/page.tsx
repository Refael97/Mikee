import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { money } from "@/lib/meta/context";
import { DELIVERY_LABEL, GOAL_LABEL, type Period } from "@/lib/meta/performance";
import { allCampaigns, PLATFORMS, type PlatformCampaign } from "@/lib/platforms";
import { getConnection, type MetaConfig } from "@/lib/connections";
import { remember } from "@/lib/ttl";
import { CampaignsShell, PERIODS } from "./shell";

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
  const status = { t: DELIVERY_LABEL[c.delivery], cls: ({ live: "tag-good", paused: "tag-warn", review: "tag-warn", issue: "tag-bad", ended: "tag-quiet" } as const)[c.delivery] };
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

function Num({ value, className = "" }: { value: string; className?: string }) {
  return <div className={`num text-end text-[15px] font-medium ${className}`}>{value}</div>;
}

const load = (workspaceId: string, period: Period, all: boolean) => remember(`campaigns:${workspaceId}:${period}:${all}`, 60_000, () => allCampaigns(workspaceId, period, all));
const shown = (data: Awaited<ReturnType<typeof allCampaigns>>, all: boolean) =>
  data.campaigns.filter((c) => all || c.live || c.numbers.spend > 0).sort((a, b) => Number(b.live) - Number(a.live) || b.numbers.spend - a.numbers.spend);

/** How many really run: the only part of the header that comes from Meta. */
async function LiveCount({ workspaceId, period, all }: { workspaceId: string; period: Period; all: boolean }) {
  const data = await load(workspaceId, period, all);
  return <>{data.campaigns.filter((c) => c.live).length}</>;
}

/** The table body: rows from Meta, or what to do when there are none. */
async function Rows({ workspaceId, period, all }: { workspaceId: string; period: Period; all: boolean }) {
  const data = await load(workspaceId, period, all);
  if (data.error) return <p className="px-4 py-6 text-[14.5px] text-warn">לא הצלחתי לקרוא את הקמפיינים כרגע. נסי לרענן בעוד רגע.</p>;
  const list = shown(data, all);
  if (!list.length)
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <p className="text-[15px] text-ink-2">אין קמפיינים פעילים בתקופה הזאת.</p>
        <Link href="/mikee?q=בוא נבנה קמפיין" className="btn btn-primary btn-sm">
          לבנות קמפיין עם מייקי
        </Link>
      </div>
    );
  return (
    <ul className="divide-y divide-line">
      {list.map((c) => (
        <Row key={`${c.platform}-${c.id}`} c={c} currency={data.currency} />
      ))}
    </ul>
  );
}

/**
 * Everything that does not come from Meta (title, periods, platforms, the table and its header) appears at
 * once; only the numbers and rows wait, shimmering in place.
 */
export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ p?: Period; show?: string }> }) {
  const { workspace } = await requireSession();
  const { p, show } = await searchParams;
  const period = PERIODS.some((x) => x.key === p) ? p! : "last_7d";
  const all = show === "all";
  const meta = await getConnection<MetaConfig>(workspace.id, "meta");
  const connected = !!meta?.secret && meta.status !== "broken";
  return <CampaignsShell period={period} all={all} connected={connected} rows={<Rows workspaceId={workspace.id} period={period} all={all} />} count={<LiveCount workspaceId={workspace.id} period={period} all={all} />} />;
}

