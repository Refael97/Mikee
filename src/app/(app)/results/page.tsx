import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { metaContext, money } from "@/lib/meta/context";
import { describeError } from "@/lib/meta/actions";
import { type FriendlyCampaign, GOAL_LABEL, type Period, readCampaigns } from "@/lib/meta/performance";

const PERIODS: { key: Period; label: string }[] = [
  { key: "last_7d", label: "7 ימים" },
  { key: "this_month", label: "החודש" },
  { key: "last_30d", label: "30 יום" },
];

const VERDICT = {
  star: { label: "מוביל", cls: "text-good" },
  ok: { label: "בסדר", cls: "text-ink-2" },
  weak: { label: "חלש", cls: "text-warn" },
  new: { label: "עוד לומד", cls: "text-ink-3" },
};

const fmt = (n: number) => new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 }).format(n);
const dateHe = (iso?: string) => (iso ? new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short" }).format(new Date(iso)) : null);

function headline(c: FriendlyCampaign, currency: string) {
  const g = GOAL_LABEL[c.goal];
  const n = c.numbers;
  if (n.spend === 0) return "עוד לא הוציא כסף בתקופה הזאת";
  if (c.goal === "sales" && n.roas) return `${fmt(n.results)} ${g.plural} · כל שקל החזיר ${n.roas.toFixed(1)}`;
  if (n.results > 0 && n.costPerResult != null) return `${fmt(n.results)} ${g.plural} · ${money(n.costPerResult, currency)} ל${g.result}`;
  return `${fmt(n.reach)} אנשים ראו · עוד אין ${g.plural}`;
}

function CampaignCard({ c, currency, i }: { c: FriendlyCampaign; currency: string; i: number }) {
  const n = c.numbers;
  return (
    <article className="card rise overflow-hidden" style={{ animationDelay: `${i * 60}ms` }}>
      <div className="p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
              <span className={c.live ? "tag tag-good" : "tag tag-quiet"}>{c.live ? "רץ עכשיו" : "בהפסקה"}</span>
              <span className="tag">{GOAL_LABEL[c.goal].he}</span>
            </div>
            <h2 className="mt-3 truncate text-[24px] font-semibold leading-[1.2]">{c.name.replace(/^Mikee · /, "").replace(/ · (mk-\w+|\d{4}-\d{2}-\d{2})$/, "")}</h2>
            <p className="mt-1.5 text-[17px] text-ink-2">{headline(c, currency)}</p>
          </div>
          <div className="shrink-0 text-start">
            <div className="text-[30px] font-bold leading-[1.08] tabular-nums">{money(n.spend, currency)}</div>
            <div className="text-[13px] text-ink-3">הושקעו</div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2 text-[15px]">
          <span className="tag tag-quiet">{c.audience}</span>
          {c.budget && (
            <span className="tag tag-quiet">
              {money(c.budget.amount, currency)} {c.budget.per === "day" ? "ביום" : "סה״כ"}
            </span>
          )}
          <span className="tag tag-quiet">
            {dateHe(c.starts) ? `מ־${dateHe(c.starts)}` : ""} {dateHe(c.ends) ? `עד ${dateHe(c.ends)}` : "ללא תאריך סיום"}
          </span>
        </div>
      </div>

      {c.ads.length > 0 && (
        <div className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-6 pb-6 sm:px-7">
          {c.ads.map((a) => (
            <figure key={a.id} className="w-40 shrink-0 snap-start">
              <div className="relative overflow-hidden rounded-[14px] bg-surface-2 hairline">
                {a.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.thumbnail} alt="" className="aspect-[4/5] w-full object-cover" />
                ) : (
                  <div className="aspect-[4/5]" />
                )}
                <span className={`glass absolute end-2 top-2 rounded-[14px] px-2.5 py-0.5 text-[12px] font-semibold ${VERDICT[a.verdict].cls}`}>{VERDICT[a.verdict].label}</span>
              </div>
              <figcaption className="mt-2 px-0.5 text-[13px] leading-snug text-ink-2">
                {a.numbers.results > 0 && a.numbers.costPerResult != null
                  ? `${fmt(a.numbers.results)} ${GOAL_LABEL[c.goal].plural} · ${money(a.numbers.costPerResult, currency)}`
                  : `${money(a.numbers.spend, currency)} הושקעו`}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      <details className="group border-t border-line px-6 py-4 text-[15px] sm:px-7">
        <summary className="flex cursor-pointer select-none list-none items-center justify-between text-ink-2 [&::-webkit-details-marker]:hidden">
          כל המספרים
          <ChevronDown className="h-4 w-4 transition-transform duration-300 group-open:rotate-180" />
        </summary>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          {[
            ["חשיפות", fmt(n.impressions)],
            ["אנשים", fmt(n.reach)],
            ["קליקים", fmt(n.clicks)],
            ["אחוז הקלקה", `${n.ctr.toFixed(2)}%`],
            ["תדירות", n.frequency.toFixed(1)],
            [GOAL_LABEL[c.goal].plural, fmt(n.results)],
            ["עלות לתוצאה", n.costPerResult != null ? money(n.costPerResult, currency) : "אין עדיין"],
            ["הכנסות", n.revenue ? money(n.revenue, currency) : "אין עדיין"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[13px] text-ink-3">{k}</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </details>
    </article>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card rise p-6">
      <div className="text-[15px] text-ink-2">{label}</div>
      <div className="mt-2 text-[34px] font-bold leading-[1.08] tabular-nums">{value}</div>
      {sub && <div className="mt-1.5 text-[13px] text-ink-3">{sub}</div>}
    </div>
  );
}

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ p?: Period }> }) {
  const { workspace } = await requireSession();
  const { p } = await searchParams;
  const period = PERIODS.some((x) => x.key === p) ? p! : "last_7d";

  let campaigns: FriendlyCampaign[] = [];
  let currency = "ILS";
  let error: string | null = null;
  try {
    const ctx = await metaContext(workspace.id);
    currency = ctx.currency ?? "ILS";
    campaigns = await readCampaigns(ctx, period);
  } catch (e) {
    error = describeError(e);
  }
  campaigns.sort((a, b) => Number(b.live) - Number(a.live) || b.numbers.spend - a.numbers.spend);
  const total = campaigns.reduce((s, c) => s + c.numbers.spend, 0);
  const results = campaigns.reduce((s, c) => s + (c.goal === "awareness" ? 0 : c.numbers.results), 0);
  const revenue = campaigns.reduce((s, c) => s + c.numbers.revenue, 0);

  return (
    <main className="mx-auto w-full max-w-[1160px] px-5 pb-16 pt-6 sm:pt-10">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <div>
          <span className="kicker">התמונה המלאה</span>
          <h1 className="display mt-2">
            <span className="accent-word">תוצאות</span>
          </h1>
          <p className="lead mt-3">מה רץ, מה עובד ומה פחות.</p>
        </div>
        <div className="glass flex gap-1 rounded-[26px] p-1.5 shadow-[var(--shadow)]">
          {PERIODS.map((x) => (
            <Link
              key={x.key}
              href={`/results?p=${x.key}`}
              className={`flex h-9 items-center rounded-[18px] px-4 text-[15px] font-medium transition-colors ${x.key === period ? "bg-brand-tint text-brand" : "text-ink-2 hover:text-ink"}`}
            >
              {x.label}
            </Link>
          ))}
        </div>
      </header>

      {!error && campaigns.length > 0 && (
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Metric label="הושקעו" value={money(total, currency)} sub={`${campaigns.filter((c) => c.live).length} קמפיינים רצים`} />
          <Metric label="תוצאות" value={fmt(results)} sub="רכישות, פניות וכניסות" />
          <Metric label={revenue ? "הכנסות מהקמפיינים" : "עלות ממוצעת לתוצאה"} value={revenue ? money(revenue, currency) : results ? money(total / results, currency) : "אין עדיין"} />
        </div>
      )}

      {error && (
        <div className="card-float rise flex flex-col items-center px-6 py-14 text-center">
          <span className="orb orb-breathe w-14" />
          <p className="mt-6 text-lg font-medium">עוד אין כאן תוצאות להציג</p>
          <p className="mt-1 max-w-sm text-ink-2">כשחשבון המודעות מחובר, כל הקמפיינים יופיעו כאן בשפה פשוטה.</p>
          <Link href="/settings" className="btn btn-quiet mt-6">
            לחיבור החשבון
          </Link>
        </div>
      )}
      {!error && campaigns.length === 0 && (
        <div className="card-float rise flex flex-col items-center px-6 py-14 text-center">
          <span className="orb orb-breathe w-14" />
          <p className="mt-6 text-lg font-medium">עוד אין קמפיינים פעילים</p>
          <Link href="/mikee" className="btn btn-primary mt-6">
            לבקש ממייקי להתחיל
          </Link>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {campaigns.map((c, i) => (
          <CampaignCard key={c.id} c={c} currency={currency} i={i} />
        ))}
      </div>
    </main>
  );
}
