import Link from "next/link";
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
  star: { label: "מוביל ⭐", cls: "bg-good/10 text-good" },
  ok: { label: "בסדר", cls: "bg-surface-2 text-ink-2" },
  weak: { label: "חלש", cls: "bg-warn/10 text-warn" },
  new: { label: "עוד לומד", cls: "bg-surface-2 text-ink-3" },
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

function CampaignCard({ c, currency }: { c: FriendlyCampaign; currency: string }) {
  const n = c.numbers;
  return (
    <article className="card overflow-hidden fade-in">
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-ink-2">
              <span className={`h-2 w-2 rounded-full ${c.live ? "bg-good" : "bg-ink-3"}`} />
              {c.live ? "רץ עכשיו" : "בהפסקה"} · {GOAL_LABEL[c.goal].he}
            </div>
            <h2 className="mt-1.5 text-xl font-semibold tracking-tight">{c.name.replace(/^Mikee · /, "").replace(/ · \d{4}-\d{2}-\d{2}$/, "")}</h2>
          </div>
          <div className="text-start">
            <div className="text-2xl font-semibold tabular-nums">{money(n.spend, currency)}</div>
            <div className="text-xs text-ink-3">הושקעו</div>
          </div>
        </div>
        <p className="mt-4 text-lg">{headline(c, currency)}</p>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-2xl bg-surface-2 p-3.5">
            <dt className="text-ink-3">למי</dt>
            <dd className="mt-1 leading-snug">{c.audience}</dd>
          </div>
          <div className="rounded-2xl bg-surface-2 p-3.5">
            <dt className="text-ink-3">תקציב</dt>
            <dd className="mt-1">{c.budget ? `${money(c.budget.amount, currency)} ${c.budget.per === "day" ? "ביום" : "סה״כ"}` : "—"}</dd>
          </div>
          <div className="rounded-2xl bg-surface-2 p-3.5">
            <dt className="text-ink-3">מתי</dt>
            <dd className="mt-1">
              {dateHe(c.starts) ? `מ־${dateHe(c.starts)}` : ""} {dateHe(c.ends) ? `עד ${dateHe(c.ends)}` : "ללא תאריך סיום"}
            </dd>
          </div>
        </dl>
      </div>

      {c.ads.length > 0 && (
        <div className="border-t border-line p-6 pt-5">
          <h3 className="mb-3 text-sm font-medium text-ink-2">המודעות</h3>
          <div className="flex snap-x gap-3 overflow-x-auto pb-1">
            {c.ads.map((a) => (
              <figure key={a.id} className="w-44 shrink-0 snap-start">
                <div className="relative overflow-hidden rounded-2xl bg-surface-2">
                  {a.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.thumbnail} alt="" className="aspect-square w-full object-cover" />
                  ) : (
                    <div className="aspect-square" />
                  )}
                  <span className={`absolute end-2 top-2 rounded-full px-2 py-0.5 text-xs font-medium backdrop-blur ${VERDICT[a.verdict].cls}`}>
                    {VERDICT[a.verdict].label}
                  </span>
                </div>
                <figcaption className="mt-2 text-xs text-ink-2">
                  {a.numbers.results > 0 && a.numbers.costPerResult != null
                    ? `${fmt(a.numbers.results)} ${GOAL_LABEL[c.goal].plural} · ${money(a.numbers.costPerResult, currency)}`
                    : `${money(a.numbers.spend, currency)} הושקעו`}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}

      <details className="border-t border-line px-6 py-4 text-sm">
        <summary className="cursor-pointer select-none text-ink-2">כל המספרים</summary>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          {[
            ["חשיפות", fmt(n.impressions)],
            ["אנשים", fmt(n.reach)],
            ["קליקים", fmt(n.clicks)],
            ["אחוז הקלקה", `${n.ctr.toFixed(2)}%`],
            ["תדירות", n.frequency.toFixed(1)],
            [GOAL_LABEL[c.goal].plural, fmt(n.results)],
            ["עלות לתוצאה", n.costPerResult != null ? money(n.costPerResult, currency) : "—"],
            ["הכנסות", n.revenue ? money(n.revenue, currency) : "—"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-ink-3">{k}</dt>
              <dd className="tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </details>
    </article>
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

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">תוצאות</h1>
          <p className="mt-2 text-ink-2">
            {campaigns.length ? `${campaigns.filter((c) => c.live).length} קמפיינים רצים · ${money(total, currency)} הושקעו` : "מה רץ ומה עובד"}
          </p>
        </div>
        <div className="flex gap-1 rounded-full bg-surface-2 p-1 text-sm">
          {PERIODS.map((x) => (
            <Link key={x.key} href={`/results?p=${x.key}`} className={`rounded-full px-3.5 py-1.5 ${x.key === period ? "bg-surface shadow-sm" : "text-ink-2"}`}>
              {x.label}
            </Link>
          ))}
        </div>
      </header>

      {error && <p className="card p-6 text-ink-2">{error}</p>}
      {!error && campaigns.length === 0 && (
        <div className="card p-10 text-center">
          <p className="text-lg">עוד אין קמפיינים פעילים.</p>
          <Link href="/mikee" className="btn btn-primary mt-5">
            לבקש ממייקי להתחיל
          </Link>
        </div>
      )}
      <div className="space-y-5">
        {campaigns.map((c) => (
          <CampaignCard key={c.id} c={c} currency={currency} />
        ))}
      </div>
    </main>
  );
}
