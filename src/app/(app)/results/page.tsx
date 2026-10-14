import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { ArrowLeft, ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { dashboardData, type KpiValue } from "@/lib/dashboard";
import { journeyStatus } from "@/lib/journey";
import { metaContext, money } from "@/lib/meta/context";
import { Block, Page, PageHeader } from "@/components/Page";
import { LineChart } from "@/components/LineChart";
import { dashboardSpec, KPIS } from "@/lib/dashboard";
import { plainTitle } from "@/lib/text";
import { MikeeAvatar } from "@/components/MikeeAvatar";
import { remember } from "@/lib/ttl";

const fmt = (n: number) => new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 }).format(n);

function show(k: KpiValue, currency: string) {
  if (k.value == null) return "—";
  if (k.format === "money") return money(k.value, currency);
  if (k.format === "ratio") return `${k.value.toFixed(1)} ₪`;
  return fmt(k.value);
}

function Change({ k }: { k: KpiValue }) {
  if (k.change == null) return <span className="text-[13px] text-ink-3">{k.previous == null ? k.hint : "ללא שינוי"}</span>;
  const pct = Math.round(Math.abs(k.change) * 100);
  const Icon = Math.abs(k.change) < 0.03 ? Minus : k.change > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`tag ${k.good == null ? "" : k.good ? "tag-good" : "tag-bad"}`}>
      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
      <span className="num">{pct}%</span>
    </span>
  );
}

export default async function ResultsPage() {
  const { workspace } = await requireSession();
  const ctx = await metaContext(workspace.id).catch(() => null);
  const [data, journey, pending] = await Promise.all([
    remember(`dashboard:${workspace.id}`, 60_000, () => dashboardData(workspace.id, workspace.timezone, ctx)).catch(() => null),
    journeyStatus(workspace.id).catch(() => null),
    db().then((d) =>
      d
        .select({ id: schema.proposals.id, conv: schema.proposals.conversationId, card: schema.proposals.card, kind: schema.proposals.kind })
        .from(schema.proposals)
        .where(and(eq(schema.proposals.workspaceId, workspace.id), eq(schema.proposals.status, "pending"))),
    ),
  ]);
  const spec = data?.spec;
  const updated = spec?.updatedAt ? new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long" }).format(new Date(spec.updatedAt)) : null;
  const next = journey?.nextUp[0];

  return (
    <Page>
      <PageHeader title="תוצאות" lead="החודש עד היום, בהשוואה לאותם ימים בחודש שעבר" action={<Link href="/campaigns" className="btn btn-quiet btn-sm">כל הקמפיינים</Link>} />

      {spec?.headline && (
        <div className="card mb-6 flex items-start gap-3 p-4">
          <MikeeAvatar size={28} className="mt-0.5" />
          <div className="min-w-0">
            <p className="font-semibold">{spec.headline}</p>
            {spec.note && <p className="mt-0.5 text-[15px] text-ink-2">{spec.note}</p>}
            {updated && <p className="mt-1 text-[13px] text-ink-3">מייקי, {updated}</p>}
          </div>
        </div>
      )}

      {!ctx ? (
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-2 px-4 py-3">
            <p className="text-[15px] text-ink-2">כשחשבון המודעות מחובר, המספרים שמייקי בחר לעסק יתמלאו כאן לבד.</p>
            <Link href="/settings#connectors" className="btn btn-primary btn-sm">
              לחיבור החשבון
            </Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4">
            {(await dashboardSpec(workspace.id)).kpis.map((id, i) => (
              <div key={id} className={`p-5 ${i % 2 ? "border-s border-line" : ""} ${i >= 2 ? "border-t border-line lg:border-t-0" : ""} ${i === 2 ? "lg:border-s" : ""}`}>
                <div className="label">{KPIS[id].label}</div>
                <div className="num mt-1.5 text-[26px] font-semibold leading-tight text-ink-3">—</div>
                <div className="mt-2 text-[13px] text-ink-3">{KPIS[id].hint}</div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        data && (
          <>
            <section className="card grid grid-cols-2 lg:grid-cols-4" aria-label="המספרים העיקריים">
              {data.kpis.map((k, i) => (
                <div key={k.id} className={`p-5 ${i % 2 ? "border-s border-line" : ""} ${i >= 2 ? "border-t border-line lg:border-t-0" : ""} ${i === 2 ? "lg:border-s" : ""}`}>
                  <div className="label">{k.label}</div>
                  <div className="num mt-1.5 text-[26px] font-semibold leading-tight">{show(k, data.currency)}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <Change k={k} />
                    {k.change != null && <span className="text-[13px] text-ink-3">מהחודש שעבר</span>}
                  </div>
                </div>
              ))}
            </section>

            <Block title="תוצאות בכל יום החודש" className="mt-8">
              <div className="card p-5">
                <LineChart points={data.daily.map((d) => ({ date: d.date, value: d.results }))} unit="תוצאות" />
              </div>
            </Block>
          </>
        )
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Block
          title={
            <span className="flex items-center gap-2">
              מחכה לאישור שלך
              {pending.length > 0 && <span className="tag tag-brand num">{pending.length}</span>}
            </span>
          }
        >
          {pending.length ? (
            <ul className="group-list">
              {pending.slice(0, 6).map((p) => (
                <li key={p.id}>
                  <Link href={p.conv ? `/mikee/${p.conv}` : "/mikee"} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-surface-2">
                    <span className="min-w-0 truncate font-medium">{plainTitle(String((p.card as { title?: string }).title ?? ""))}</span>
                    <ArrowLeft className="h-4 w-4 shrink-0 text-ink-3" strokeWidth={1.75} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="card px-4 py-3 text-[15px] text-ink-2">אין הצעות שמחכות לאישור.</p>
          )}
        </Block>

        <Block title="הצעד הבא בתוכנית">
          <div className="card p-4">
            {next ? (
              <>
                <p className="font-semibold">{next.title}</p>
                <p className="mt-1 text-[15px] text-ink-2">{next.why}</p>
                <Link href={`/mikee?q=${encodeURIComponent(`בוא נדבר על הצעד הבא: ${next.title}`)}`} className="link mt-3 inline-flex items-center gap-1 text-[15px]">
                  לדבר על זה עם מייקי <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
                </Link>
              </>
            ) : (
              <p className="text-[15px] text-ink-2">התוכנית מעודכנת. מייקי יציע את הצעד הבא בזמן הנכון.</p>
            )}
          </div>
        </Block>
      </div>
    </Page>
  );
}
