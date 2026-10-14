import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { signOutEverywhere } from "@/lib/actions";
import { logout } from "@/app/login/actions";
import { CONNECTORS } from "@/lib/connectors";
import { storageUsage } from "@/lib/media";
import { planOf } from "@/lib/plans";
import { getSettings } from "@/lib/settings";
import { monthUsage } from "@/lib/usage";
import { Section } from "@/components/ConnectionForms";
import { PasswordForm, ProfileForm, RecoveryCodeForm } from "@/components/AccountForms";
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
  const [settings, storage, ai, credits, conns, security] = await Promise.all([
    getSettings(workspace.id),
    storageUsage(workspace.id),
    monthUsage(workspace.id, workspace.timezone, "claude"),
    monthUsage(workspace.id, workspace.timezone, "higgsfield"),
    d.select().from(schema.connections).where(eq(schema.connections.workspaceId, workspace.id)),
    d
      .select()
      .from(schema.activity)
      .where(and(eq(schema.activity.workspaceId, workspace.id), eq(schema.activity.kind, "security")))
      .orderBy(desc(schema.activity.createdAt))
      .limit(8),
  ]);
  const plan = planOf(settings);
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

      <Section title="המנוי והשימוש" hint="מה כלול במנוי ומה כבר נוצל החודש. תקציב הפרסום עצמו משולם ישירות למטא ולא נספר כאן.">
        <div className="max-w-xl">
          <Meter label="אחסון בספרייה" used={storage.used} limit={storage.limit} show={size} />
          <Meter label="שימוש של מייקי החודש (בדולרים)" used={ai} limit={Math.min(settings.aiMonthlyLimitUsd, plan.aiUsd)} show={(n) => `$${n.toFixed(n < 10 ? 2 : 0)}`} />
          <Meter label="קרדיטים ליצירת תמונות וסרטונים" used={credits} limit={Math.min(settings.mediaMonthlyCredits || plan.mediaCredits, plan.mediaCredits)} show={(n) => String(Math.round(n))} />
        </div>
        <p className="mt-4 text-[15px] text-ink-2">
          צריך יותר? <Link href="/settings#limits" className="link">המגבלות בהגדרות</Link> או פנייה דרך העזרה לשדרוג.
        </p>
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
        <PasswordForm />
        <div className="mt-10">
          <h3 className="mb-3 font-semibold">קוד שחזור</h3>
          <RecoveryCodeForm has={!!user.recoveryHash} />
        </div>
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
