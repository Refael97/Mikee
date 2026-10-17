import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { signOutEverywhere } from "@/lib/actions";
import { logout } from "@/app/login/actions";
import { CONNECTORS } from "@/lib/connectors";
import { storageUsage } from "@/lib/media";
import { GUIDANCE, GUIDANCE_INCLUDES, planOf } from "@/lib/plans";
import { getSettings } from "@/lib/settings";
import { quota } from "@/lib/credits";
import { UsageBar, UsageRequests } from "@/components/Usage";
import { Section } from "@/components/ConnectionForms";
import { MikeeLookPicker } from "@/components/MikeeLookPicker";
import { PasswordForm, ProfileForm } from "@/components/AccountForms";
import { Page, PageHeader } from "@/components/Page";
import { getLocale, getT } from "@/lib/i18n/server";

const size = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)}GB` : `${Math.round(b / 1024 ** 2)}MB`);

async function Meter({ label, used, limit, show }: { label: string; used: number; limit: number; show: (n: number) => string }) {
  const t = await getT();
  const pct = Math.min(100, (used / Math.max(1, limit)) * 100);
  return (
    <div className="border-b border-line py-3 last:border-b-0">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[15px] font-medium">{label}</span>
        <span className="num text-[15px] text-ink-2">
          {t("{used} מתוך {limit}", { used: show(used), limit: show(limit) })}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${pct > 90 ? "bg-bad" : "bg-brand"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default async function AccountPage() {
  const t = await getT();
  const { user, workspace } = await requireSession();
  const d = await db();
  const [settings, storage, q, conns, security] = await Promise.all([
    getSettings(workspace.id),
    storageUsage(workspace.id),
    quota(workspace.id, workspace.timezone),
    d.select().from(schema.connections).where(eq(schema.connections.workspaceId, workspace.id)),
    d
      .select()
      .from(schema.activity)
      .where(and(eq(schema.activity.workspaceId, workspace.id), eq(schema.activity.kind, "security")))
      .orderBy(desc(schema.activity.createdAt))
      .limit(8),
  ]);
  const plan = planOf(settings);
  const guidance = settings.guidance ? GUIDANCE[settings.guidance] : null;
  const locale = await getLocale();
  const n = (v: number) => Math.round(v).toLocaleString(locale);
  const renews = new Date(`${q.renewsOn}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "long" });
  const byId = new Map(conns.map((c) => [c.provider, c]));
  const when = (d: Date) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: workspace.timezone }).format(d);

  return (
    <Page>
      <PageHeader
        title={t("הפרופיל שלי")}
        lead={`${workspace.name} · ${t("מנוי {plan}", { plan: t(plan.name) })}`}
        action={
          <form action={logout}>
            <button className="btn btn-quiet">{t("יציאה")}</button>
          </form>
        }
      />

      <Section title={t("הפרטים שלי")}>
        <ProfileForm name={user.name} email={user.email} username={user.username} />
      </Section>

      <Section id="mikee" title={t("הצבע של מייקי")} hint={t("איך מייקי נראה בכל המסכים שלך. אפשר להחליף בכל רגע.")}>
        <MikeeLookPicker />
      </Section>

      <Section id="usage" title={t("המנוי והשימוש")} hint={t("המכסה החודשית לכל מה שמייקי והצוות שלו עושים. תקציב הפרסום משולם ישירות למטא ולא נספר כאן.")}>
        <div className="max-w-xl space-y-5">
          <div>
            <p className="font-medium">{t(plan.name)}</p>
            {guidance && (
              <div className="mt-2 text-[15px] text-ink-2">
                <p>
                  {t("בתוספת {name}:", { name: t(guidance.name) })} {guidance.callsPerMonth === 1 ? t("שיחה אחת בחודש") : t("{n} שיחות בחודש", { n: guidance.callsPerMonth })}, {t("{n} דקות כל אחת.", { n: guidance.callMinutes })}
                </p>
                <ul className="mt-1 list-disc space-y-0.5 ps-5 text-[14px] text-ink-3">
                  {GUIDANCE_INCLUDES.map((x) => (
                    <li key={x}>{t(x)}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-[15px] font-medium">{t("ניצול המכסה החודשית")}</span>
              <span className="num text-[15px]">{q.percent}%</span>
            </div>
            <div className="mt-2">
              <UsageBar percent={q.percent} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[14px] text-ink-2">
              <span>
                {t("נשארו")} <span className="num">{n(q.includedLeft)}</span> {t("מתוך")} <span className="num">{n(q.included)}</span> {t("קרדיטים")}
              </span>
              <span>{t("מתחדשת ב־{date}", { date: renews })}</span>
              {q.purchasedLeft > 0 && (
                <span>
                  {t("קרדיטים נוספים שרכשת:")} <span className="num">{n(q.purchasedLeft)}</span>
                </span>
              )}
            </div>
          </div>
          <Meter label={t("אחסון בספרייה")} used={storage.used} limit={storage.limit} show={size} />
          <UsageRequests />
        </div>
      </Section>

      <Section title={t("נכסים מחוברים")} hint={t("כל חיבור אפשר לנתק או לחבר מחדש בהגדרות.")}>
        <ul className="max-w-xl divide-y divide-line">
          {CONNECTORS.filter((c) => c.status === "live").map((c) => {
            const conn = byId.get(c.id === "google_drive" ? "google_drive" : c.id);
            const state = !conn ? t("לא מחובר") : conn.status === "broken" ? t("נותק") : t("מחובר");
            return (
              <li key={c.id} className="flex items-center justify-between gap-4 py-2.5">
                <span>
                  <span className="block font-medium">{t(c.name)}</span>
                  <span className="text-[14px] text-ink-3">{t(c.does)}</span>
                </span>
                <span className={`tag shrink-0 ${!conn ? "tag-quiet" : conn.status === "broken" ? "tag-bad" : "tag-good"}`}>{state}</span>
              </li>
            );
          })}
        </ul>
        <Link href="/settings#connectors" className="link mt-4 inline-block text-[15px]">
          {t("לניהול החיבורים")}
        </Link>
      </Section>

      <Section title={t("אבטחה")} hint={t("סיסמה, כניסות אחרונות, ויציאה מכל המכשירים.")}>
        <PasswordForm username={user.email} />
        <div className="mt-10 max-w-xl">
          <h3 className="font-semibold">{t("פעילות אחרונה בחשבון")}</h3>
          <ul className="mt-3 border-t border-line">
            {security.map((a) => (
              <li key={a.id} className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 text-[15px]">
                <span className={a.ok ? "" : "text-bad"}>{t(a.summary)}</span>
                <span className="num shrink-0 text-[13.5px] text-ink-3">{when(a.createdAt)}</span>
              </li>
            ))}
            {security.length === 0 && <li className="py-3 text-ink-3">{t("אין עדיין פעילות להציג.")}</li>}
          </ul>
          <form action={signOutEverywhere} className="mt-6">
            <button className="btn btn-quiet">{t("יציאה מכל המכשירים")}</button>
          </form>
        </div>
      </Section>
    </Page>
  );
}
