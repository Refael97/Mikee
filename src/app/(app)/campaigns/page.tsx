import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { money } from "@/lib/meta/context";
import { GOAL_LABEL, type Period } from "@/lib/meta/performance";
import { allCampaigns, PLATFORMS, type PlatformCampaign } from "@/lib/platforms";
import { Empty, Page, PageHeader, Segmented } from "@/components/Page";

const PERIODS: { key: Period; label: string }[] = [
  { key: "last_7d", label: "7 ימים" },
  { key: "this_month", label: "החודש" },
  { key: "last_30d", label: "30 יום" },
];

const VERDICT = {
  star: { label: "מוביל", cls: "tag-good" },
  ok: { label: "בסדר", cls: "tag-quiet" },
  weak: { label: "חלש", cls: "tag-warn" },
  new: { label: "עוד לומד", cls: "tag-quiet" },
};

const fmt = (n: number) => new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 }).format(n);
const dateHe = (iso?: string) => (iso ? new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short" }).format(new Date(iso)) : null);
const cleanName = (n: string) => n.replace(/^Mikee · /, "").replace(/ · (mk-\w+|\d{4}-\d{2}-\d{2})$/, "");

function Row({ c, currency }: { c: PlatformCampaign; currency: string }) {
  const g = GOAL_LABEL[c.goal];
  const n = c.numbers;
  return (
    <li className="rise border-b border-line">
      <details className="group">
        <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] items-start gap-x-6 gap-y-3 py-5 sm:grid-cols-[1fr_repeat(3,minmax(90px,auto))] [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className={`tag ${c.live ? "tag-good" : "tag-quiet"}`}>{c.live ? "רץ עכשיו" : c.status === "PAUSED" ? "בהפסקה" : "הסתיים"}</span>
              <span className="text-[14px] text-ink-3">
                {PLATFORMS.find((p) => p.id === c.platform)?.name} · {g.he}
              </span>
            </div>
            <h2 className="serif mt-1.5 truncate text-[22px] leading-[1.25] group-hover:underline group-hover:decoration-line-strong group-hover:underline-offset-4">{cleanName(c.name)}</h2>
            <p className="mt-1 text-[15px] text-ink-2">
              {c.audience}
              {c.budget && ` · ${money(c.budget.amount, currency)} ${c.budget.per === "day" ? "ביום" : "סה״כ"}`}
              {dateHe(c.starts) && ` · מ־${dateHe(c.starts)}`}
              {dateHe(c.ends) ? ` עד ${dateHe(c.ends)}` : ""}
            </p>
          </div>
          <Num label="הושקעו" value={money(n.spend, currency)} />
          <Num label={g.plural} value={c.goal === "awareness" ? fmt(n.reach) : fmt(n.results)} className="hidden sm:block" />
          <Num
            label={c.goal === "sales" && n.roas ? "כל שקל החזיר" : `עלות ל${g.result}`}
            value={c.goal === "sales" && n.roas ? `${n.roas.toFixed(1)} ₪` : n.costPerResult != null ? money(n.costPerResult, currency) : "עוד אין"}
            className="hidden sm:block"
          />
        </summary>

        <div className="pb-6">
          {c.ads.length > 0 && (
            <div className="no-scrollbar flex snap-x gap-3 overflow-x-auto">
              {c.ads.map((a) => (
                <figure key={a.id} className="w-36 shrink-0 snap-start">
                  <div className="overflow-hidden rounded-[6px] border border-line bg-surface-2">
                    {a.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.thumbnail} alt="" className="aspect-[4/5] w-full object-cover" />
                    ) : (
                      <div className="aspect-[4/5]" />
                    )}
                  </div>
                  <figcaption className="mt-2 space-y-0.5 text-[13px] leading-snug">
                    <span className={`tag ${VERDICT[a.verdict].cls} text-[12.5px]`}>{VERDICT[a.verdict].label}</span>
                    <span className="block text-ink-2">
                      {a.numbers.results > 0 && a.numbers.costPerResult != null ? `${fmt(a.numbers.results)} ${g.plural} · ${money(a.numbers.costPerResult, currency)}` : `${money(a.numbers.spend, currency)} הושקעו`}
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-[15px] sm:grid-cols-4">
            {[
              ["חשיפות", fmt(n.impressions)],
              ["אנשים", fmt(n.reach)],
              ["קליקים", fmt(n.clicks)],
              ["אחוז הקלקה", `${n.ctr.toFixed(2)}%`],
              ["תדירות", n.frequency.toFixed(1)],
              [g.plural, fmt(n.results)],
              ["הכנסות", n.revenue ? money(n.revenue, currency) : "אין עדיין"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[13px] text-ink-3">{k}</dt>
                <dd className="num font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <Link href={`/mikee?q=${encodeURIComponent(`מה דעתך על הקמפיין "${cleanName(c.name)}"?`)}`} className="link mt-5 inline-block text-[15px]">
            לשאול את מייקי על הקמפיין הזה
          </Link>
        </div>
      </details>
    </li>
  );
}

function Num({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`text-start ${className}`}>
      <div className="serif num text-[24px] leading-none">{value}</div>
      <div className="mt-1.5 text-[13px] text-ink-3">{label}</div>
    </div>
  );
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
        kicker="בכל הפלטפורמות"
        title={
          <>
            <span className="marked">קמפיינים</span>
          </>
        }
        lead={data.connected.meta ? `${live} רצים עכשיו. לוחצים על קמפיין כדי לראות את המודעות והמספרים.` : "כאן יופיעו כל הקמפיינים, מכל הפלטפורמות, בשפה פשוטה."}
        action={<Segmented active={period} items={PERIODS.map((x) => ({ key: x.key, label: x.label, href: `/campaigns?p=${x.key}${all ? "&show=all" : ""}` }))} />}
      />

      <div className="rise mb-2 flex flex-wrap gap-x-8 gap-y-2 border-y border-line py-3 text-[15px]">
        {PLATFORMS.map((pl) => (
          <span key={pl.id} className="flex items-center gap-2">
            <span className={`tag ${data.connected[pl.id] ? "tag-good" : "tag-quiet"}`}>{pl.name}</span>
            <span className="text-ink-3">{data.connected[pl.id] ? pl.sub : pl.ready ? "לא מחובר" : "בקרוב"}</span>
          </span>
        ))}
      </div>

      {!data.connected.meta ? (
        <Empty
          title="עוד לא חיברנו את חשבון המודעות"
          text="אחרי החיבור, כל הקמפיינים יופיעו כאן עם מה שהם מביאים."
          action={
            <Link href="/settings" className="btn btn-primary">
              לחיבור
            </Link>
          }
        />
      ) : data.error ? (
        <p className="note note-warn mt-6">לא הצלחתי לקרוא את הקמפיינים כרגע. נסי לרענן בעוד רגע.</p>
      ) : list.length === 0 ? (
        <Empty
          title="אין קמפיינים פעילים בתקופה הזאת"
          action={
            <Link href="/mikee?q=בוא נבנה קמפיין" className="btn btn-primary">
              לבנות קמפיין עם מייקי
            </Link>
          }
        />
      ) : (
        <ul>
          {list.map((c) => (
            <Row key={`${c.platform}-${c.id}`} c={c} currency={data.currency} />
          ))}
        </ul>
      )}

      {data.connected.meta && (
        <div className="mt-6 text-[15px]">
          <Link href={`/campaigns?p=${period}${all ? "" : "&show=all"}`} className="link">
            {all ? "להציג רק פעילים" : "להציג גם קמפיינים שהסתיימו"}
          </Link>
        </div>
      )}
    </Page>
  );
}
