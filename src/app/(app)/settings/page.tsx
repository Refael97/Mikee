import { requireSession } from "@/lib/auth";
import { budgetStatus } from "@/lib/budget";
import { getConnection, type MetaConfig } from "@/lib/connections";
import { metaContext, money } from "@/lib/meta/context";
import { disconnectMeta, saveLimits } from "@/lib/actions";
import { getSettings } from "@/lib/settings";
import { monthUsage } from "@/lib/usage";
import { logout } from "@/app/login/actions";
import { BudgetForm, MetaAssets, MetaConnect, Section, WebsiteStore } from "@/components/ConnectionForms";

async function BudgetMeter({ workspaceId, tz }: { workspaceId: string; tz: string }) {
  try {
    const s = await budgetStatus(workspaceId, tz, await metaContext(workspaceId));
    if (!s.configured) return null;
    const pct = (v: number) => `${Math.min(100, (Math.max(0, v) / Math.max(1, s.limit)) * 100)}%`;
    const c = s.currency;
    return (
      <div className="mt-6">
        <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">
          <div className="bg-accent" style={{ width: pct(s.spent) }} />
          <div className="bg-accent/40" style={{ width: pct(s.committed + s.buffer) }} />
          <div className="bg-accent/15" style={{ width: pct(s.reserved) }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-2">
          <span>הושקעו {money(s.spent, c)}</span>
          <span>צפוי עד סוף החודש {money(s.committed + s.buffer, c)}</span>
          {s.reserved > 0 && <span>שמור להצעות שמחכות לך {money(s.reserved, c)}</span>}
          <span className="font-medium text-ink">פנוי {money(Math.max(0, s.headroom), c)}</span>
          {s.extensions > 0 && <span>כולל תוספת שאישרת {money(s.extensions, c)}</span>}
        </div>
        {s.paused.length > 0 && (
          <p className="mt-2 text-xs text-ink-3">
            קמפיינים בהפסקה לא נספרים. אם מייקי ירצה להפעיל אחד מהם, הוא יבקש אישור והתקציב ייבדק שוב.
          </p>
        )}
      </div>
    );
  } catch {
    return null;
  }
}

async function Limits({ workspaceId, tz }: { workspaceId: string; tz: string }) {
  const [settings, ai, credits] = await Promise.all([getSettings(workspaceId), monthUsage(workspaceId, tz, "claude"), monthUsage(workspaceId, tz, "higgsfield")]);
  const cap = settings.metaSpendCapStatus;
  return (
    <form action={saveLimits} className="space-y-5">
      <label className="flex flex-wrap items-center justify-between gap-3">
        <span>
          <span className="block">תקרה קשיחה גם בחשבון המודעות</span>
          <span className="text-sm text-ink-3">מטא עצמה תעצור חיובים מעבר לתקציב, גם אם משהו משתנה מחוץ למייקי.</span>
          {cap && <span className={`block text-xs ${cap.ok ? "text-good" : "text-warn"}`}>{cap.ok ? "פעיל" : "לא הוגדר"} · {cap.detail}</span>}
        </span>
        <input type="checkbox" name="metaSpendCap" defaultChecked={settings.metaSpendCap} className="h-5 w-5 accent-[var(--accent)]" />
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="space-y-1.5">
          <span className="text-sm text-ink-2">שימוש של מייקי בחודש ($)</span>
          <input name="aiMonthlyLimitUsd" inputMode="decimal" defaultValue={settings.aiMonthlyLimitUsd} className="field" />
          <span className="text-xs text-ink-3">החודש: ${ai.toFixed(2)}</span>
        </label>
        <label className="space-y-1.5">
          <span className="text-sm text-ink-2">קרדיטים ליצירת מדיה בחודש</span>
          <input name="mediaMonthlyCredits" inputMode="numeric" defaultValue={settings.mediaMonthlyCredits} className="field" />
          <span className="text-xs text-ink-3">נוצלו: {credits}</span>
        </label>
        <label className="space-y-1.5">
          <span className="text-sm text-ink-2">מתוכם בלי לשאול אותי</span>
          <input name="mediaAutoCredits" inputMode="numeric" defaultValue={settings.mediaAutoCredits} className="field" />
          <span className="text-xs text-ink-3">0 = כל תמונה וסרטון באישור</span>
        </label>
      </div>
      <button className="btn btn-primary">שמירה</button>
    </form>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { user, workspace } = await requireSession();
  const { error } = await searchParams;
  const meta = await getConnection<MetaConfig>(workspace.id, "meta");
  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-10">
      <header className="mb-3">
        <h1 className="text-4xl font-semibold tracking-tight">הגדרות</h1>
      </header>
      {error && <p className="card p-4 text-warn">{error}</p>}

      <Section title="תקציב השיווק החודשי" hint="התקרה החודשית. מייקי לא יעבור אותה בלי לבקש ולקבל אישור ממך.">
        <BudgetForm workspaceId={workspace.id} />
        <BudgetMeter workspaceId={workspace.id} tz={workspace.timezone} />
      </Section>

      <Section title="מגבלות" hint="כל עלות מחוץ לתקציב הפרסום, בנפרד.">
        <Limits workspaceId={workspace.id} tz={workspace.timezone} />
      </Section>

      <Section title="פייסבוק ואינסטגרם">
        <div className="space-y-6">
          <MetaConnect workspaceId={workspace.id} />
          {meta?.secret && (
            <>
              <MetaAssets workspaceId={workspace.id} businessName={workspace.name} />
              <form action={disconnectMeta}>
                <button className="text-sm text-warn">ניתוק</button>
              </form>
            </>
          )}
        </div>
      </Section>

      <Section title="האתר והחנות">
        <WebsiteStore workspaceId={workspace.id} />
      </Section>

      <Section title="החשבון">
        <div className="flex items-center justify-between">
          <span className="text-ink-2">
            {user.name} · <span dir="ltr">{user.email}</span>
          </span>
          <form action={logout}>
            <button className="btn btn-quiet">יציאה</button>
          </form>
        </div>
      </Section>
    </main>
  );
}
