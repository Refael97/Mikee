import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { dashboardData, type KpiValue } from "@/lib/dashboard";
import { journeyStatus } from "@/lib/journey";
import { metaContext, money } from "@/lib/meta/context";
import { Empty, Page, PageHeader } from "@/components/Page";

const fmt = (n: number) => new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 }).format(n);

function show(k: KpiValue, currency: string) {
  if (k.value == null) return "אין עדיין";
  if (k.format === "money") return money(k.value, currency);
  if (k.format === "ratio") return `${k.value.toFixed(1)} ₪`;
  return fmt(k.value);
}

function Change({ k }: { k: KpiValue }) {
  if (k.change == null) return <span className="text-ink-3">{k.previous == null ? k.hint : "כמו בחודש שעבר"}</span>;
  const up = k.change > 0;
  const pct = Math.round(Math.abs(k.change) * 100);
  return (
    <span className={k.good == null ? "text-ink-2" : k.good ? "text-good" : "text-bad"}>
      {up ? "▲" : "▼"} {pct}% לעומת אותם ימים בחודש שעבר
    </span>
  );
}

/** Daily results this month as thin bars: enough to see the rhythm, nothing to decode. */
function Rhythm({ daily, days }: { daily: { date: string; results: number; spend: number }[]; days: number }) {
  if (!daily.length) return null;
  const max = Math.max(1, ...daily.map((d) => d.results));
  const w = 100 / Math.max(days, daily.length);
  return (
    <figure className="rise mt-12 [animation-delay:120ms]">
      <figcaption className="kicker">תוצאות בכל יום החודש</figcaption>
      <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="mt-4 h-28 w-full" role="img" aria-label="תוצאות יומיות">
        <line x1="0" x2="100" y1="31.8" y2="31.8" stroke="var(--line-strong)" strokeWidth="0.2" />
        {daily.map((d, i) => {
          const h = (d.results / max) * 28;
          const last = i === daily.length - 1;
          return <rect key={d.date} x={100 - (i + 1) * w + w * 0.2} width={w * 0.6} y={31.8 - h} height={h} fill={last ? "var(--brand)" : "var(--ink)"} opacity={last ? 1 : 0.85} />;
        })}
      </svg>
      <div className="mt-2 flex justify-between text-[13px] text-ink-3">
        <span>1 בחודש</span>
        <span>היום</span>
      </div>
    </figure>
  );
}

export default async function ResultsPage() {
  const { workspace } = await requireSession();
  const ctx = await metaContext(workspace.id).catch(() => null);
  const [data, journey, pending] = await Promise.all([
    dashboardData(workspace.id, workspace.timezone, ctx).catch(() => null),
    journeyStatus(workspace.id).catch(() => null),
    db().then((d) => d.select({ id: schema.proposals.id, conv: schema.proposals.conversationId, card: schema.proposals.card }).from(schema.proposals).where(and(eq(schema.proposals.workspaceId, workspace.id), eq(schema.proposals.status, "pending")))),
  ]);
  const spec = data?.spec;
  const updated = spec?.updatedAt ? new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long" }).format(new Date(spec.updatedAt)) : null;

  return (
    <Page>
      <PageHeader
        kicker="החודש עד היום"
        title={spec?.headline ? spec.headline : <><span className="marked">תוצאות</span> במבט אחד</>}
        lead={spec?.note ?? "המספרים שמייקי בחר כחשובים לעסק שלך, בהשוואה הוגנת לאותם ימים בחודש שעבר."}
        action={updated ? <span className="text-[14px] text-ink-3">מייקי עדכן ב־{updated}</span> : undefined}
      />

      {!ctx && (
        <Empty
          title="עוד אין כאן מספרים"
          text="כשחשבון המודעות מחובר, המספרים החשובים לעסק יופיעו כאן לבד."
          action={
            <Link href="/settings" className="btn btn-primary">
              לחיבור החשבון
            </Link>
          }
        />
      )}

      {ctx && data && (
        <>
          <section className="rise grid grid-cols-2 border-y border-line lg:grid-cols-4">
            {data.kpis.map((k, i) => (
              <div key={k.id} className={`border-line py-6 ${i % 2 ? "border-s ps-5" : "pe-5"} ${i >= 2 ? "border-t lg:border-t-0" : ""} ${i > 0 ? "lg:border-s lg:ps-6" : "lg:ps-0"} lg:pe-6`}>
                <div className="text-[15px] font-semibold text-ink-2">{k.label}</div>
                <div className="serif num mt-2 text-[38px] leading-none sm:text-[46px]">{show(k, data.currency)}</div>
                <div className="mt-3 text-[13.5px] leading-snug">
                  <Change k={k} />
                </div>
              </div>
            ))}
          </section>
          <Rhythm daily={data.daily} days={new Date(data.ranges.current.until).getUTCDate()} />
        </>
      )}

      <section className="mt-14 grid gap-x-10 gap-y-8 lg:grid-cols-2">
        <div>
          <span className="kicker">מחכה לך</span>
          {pending.length ? (
            <ul className="mt-3 border-t border-line">
              {pending.slice(0, 5).map((p) => (
                <li key={p.id} className="border-b border-line">
                  <Link href={p.conv ? `/mikee/${p.conv}` : "/mikee"} className="group flex items-center justify-between gap-4 py-3.5">
                    <span className="font-semibold group-hover:underline group-hover:underline-offset-4">{String((p.card as { title?: string }).title ?? "")}</span>
                    <ArrowLeft className="h-4 w-4 shrink-0 text-ink-3" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-ink-2">אין הצעות שמחכות לאישור.</p>
          )}
        </div>
        <div>
          <span className="kicker">הצעד הבא בתוכנית</span>
          {journey?.nextUp[0] ? (
            <div className="mt-3 border-t border-line pt-4">
              <p className="text-[19px] font-semibold">{journey.nextUp[0].title}</p>
              <p className="mt-1 text-ink-2">{journey.nextUp[0].why}</p>
              <Link href={`/mikee?q=${encodeURIComponent(`בוא נדבר על הצעד הבא: ${journey.nextUp[0].title}`)}`} className="link mt-3 inline-block">
                לדבר על זה עם מייקי
              </Link>
            </div>
          ) : (
            <p className="mt-3 text-ink-2">התוכנית מעודכנת. מייקי יציע את הצעד הבא בזמן הנכון.</p>
          )}
        </div>
      </section>

      <div className="mt-14 border-t border-line pt-5">
        <Link href="/campaigns" className="group inline-flex items-center gap-2 text-[17px] font-semibold">
          כל הקמפיינים והמודעות
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
        </Link>
      </div>
    </Page>
  );
}
