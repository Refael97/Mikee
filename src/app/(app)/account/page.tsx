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
import { PasswordForm, ProfileForm } from "@/components/AccountForms";
import { Page, PageHeader } from "@/components/Page";

const size = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)}GB` : `${Math.round(b / 1024 ** 2)}MB`);

function Meter({ label, used, limit, show }: { label: string; used: number; limit: number; show: (n: number) => string }) {
  const pct = Math.min(100, (used / Math.max(1, limit)) * 100);
  return (
    <div className="border-b border-line py-3 last:border-b-0">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[15px] font-medium">{label}</span>
        <span className="num text-[15px] text-ink-2">
          {show(used)} מתוך {show(limit)}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${pct > 90 ? "bg-bad" : "bg-brand"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default async function AccountPage() {
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
  const n = (v: number) => Math.round(v).toLocaleString("he-IL");
  const renews = new Date(`${q.renewsOn}T12:00:00`).toLocaleDateString("he-IL", { day: "numeric", month: "long" });
  const byId = new Map(conns.map((c) => [c.provider, c]));
  const when = (d: Date) => new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: workspace.timezone }).format(d);

  return (
    <Page>
      <PageHeader
        title="הפרופיל שלי"
        lead={`${workspace.name} · מנוי ${plan.name}`}
        action={
          <form action={logout}>
            <button className="btn btn-quiet">יציאה</button>
          </form>
        }
      />

      <Section title="הפרטים שלי">
        <ProfileForm name={user.name} email={user.email} username={user.username} />
      </Section>

      <Section id="usage" title="המנוי והשימוש" hint="המכסה החודשית לכל מה שמייקי והצוות שלו עושים. תקציב הפרסום משולם ישירות למטא ולא נספר כאן.">
        <div className="max-w-xl space-y-5">
          <div>
            <p className="font-medium">{plan.name}</p>
            {guidance && (
              <div className="mt-2 text-[15px] text-ink-2">
                <p>
                  בתוספת {guidance.name}: {guidance.callsPerMonth === 1 ? "שיחה אחת בחודש" : `${guidance.callsPerMonth} שיחות בחודש`}, {guidance.callMinutes} דקות כל אחת.
                </p>
                <ul className="mt-1 list-disc space-y-0.5 ps-5 text-[14px] text-ink-3">
                  {GUIDANCE_INCLUDES.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-[15px] font-medium">ניצול המכסה החודשית</span>
              <span className="num text-[15px]">{q.percent}%</span>
            </div>
            <div className="mt-2">
              <UsageBar percent={q.percent} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[14px] text-ink-2">
              <span>
                נשארו <span className="num">{n(q.includedLeft)}</span> מתוך <span className="num">{n(q.included)}</span> קרדיטים
              </span>
              <span>מתחדשת ב־{renews}</span>
              {q.purchasedLeft > 0 && (
                <span>
                  קרדיטים נוספים שרכשת: <span className="num">{n(q.purchasedLeft)}</span>
                </span>
              )}
            </div>
          </div>
          <dl className="divide-y divide-line border-y border-line text-[15px]">
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-ink-2">שיחות ועבודה של הצוות</dt>
              <dd className="num">{n(q.byKind.conversations)} קרדיטים</dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-ink-2">תמונות וסרטונים שנוצרו</dt>
              <dd className="num">{n(q.byKind.media)} קרדיטים</dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-ink-2">עריכת סרטונים</dt>
              <dd className="text-ink-3">כלולה</dd>
            </div>
          </dl>
          <Meter label="אחסון בספרייה" used={storage.used} limit={storage.limit} show={size} />
          <UsageRequests />
        </div>
      </Section>

      <Section title="נכסים מחוברים" hint="כל חיבור אפשר לנתק או לחבר מחדש בהגדרות.">
        <ul className="max-w-xl divide-y divide-line">
          {CONNECTORS.filter((c) => c.status === "live").map((c) => {
            const conn = byId.get(c.id === "google_drive" ? "google_drive" : c.id);
            const state = !conn ? "לא מחובר" : conn.status === "broken" ? "נותק" : "מחובר";
            return (
              <li key={c.id} className="flex items-center justify-between gap-4 py-2.5">
                <span>
                  <span className="block font-medium">{c.name}</span>
                  <span className="text-[14px] text-ink-3">{c.does}</span>
                </span>
                <span className={`tag shrink-0 ${!conn ? "tag-quiet" : conn.status === "broken" ? "tag-bad" : "tag-good"}`}>{state}</span>
              </li>
            );
          })}
        </ul>
        <Link href="/settings#connectors" className="link mt-4 inline-block text-[15px]">
          לניהול החיבורים
        </Link>
      </Section>

      <Section title="אבטחה" hint="סיסמה, כניסות אחרונות, ויציאה מכל המכשירים.">
        <PasswordForm username={user.email} />
        <div className="mt-10 max-w-xl">
          <h3 className="font-semibold">פעילות אחרונה בחשבון</h3>
          <ul className="mt-3 border-t border-line">
            {security.map((a) => (
              <li key={a.id} className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 text-[15px]">
                <span className={a.ok ? "" : "text-bad"}>{a.summary}</span>
                <span className="num shrink-0 text-[13.5px] text-ink-3">{when(a.createdAt)}</span>
              </li>
            ))}
            {security.length === 0 && <li className="py-3 text-ink-3">אין עדיין פעילות להציג.</li>}
          </ul>
          <form action={signOutEverywhere} className="mt-6">
            <button className="btn btn-quiet">יציאה מכל המכשירים</button>
          </form>
        </div>
      </Section>
    </Page>
  );
}
