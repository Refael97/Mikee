import { requireSession } from "@/lib/auth";
import { budgetStatus } from "@/lib/budget";
import { getConnection, type MetaConfig } from "@/lib/connections";
import { metaContext, money } from "@/lib/meta/context";
import { disconnectMeta } from "@/lib/actions";
import { logout } from "@/app/login/actions";
import { BudgetForm, MetaAssets, MetaConnect, Section, WebsiteStore } from "@/components/ConnectionForms";

async function BudgetMeter({ workspaceId, tz }: { workspaceId: string; tz: string }) {
  try {
    const s = await budgetStatus(workspaceId, tz, await metaContext(workspaceId));
    if (!s.configured) return null;
    const pct = (v: number) => `${Math.min(100, (v / Math.max(1, s.limit)) * 100)}%`;
    return (
      <div className="mt-6">
        <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">
          <div className="bg-accent" style={{ width: pct(s.spent) }} />
          <div className="bg-accent/35" style={{ width: pct(s.committed) }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-2">
          <span>הושקעו {money(s.spent, s.currency)}</span>
          <span>צפוי עד סוף החודש {money(s.committed, s.currency)}</span>
          <span>פנוי {money(Math.max(0, s.headroom), s.currency)}</span>
          {s.extensions > 0 && <span>כולל תוספת שאושרה {money(s.extensions, s.currency)}</span>}
        </div>
      </div>
    );
  } catch {
    return null;
  }
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

      <Section title="פייסבוק ואינסטגרם">
        <div className="space-y-6">
          <MetaConnect workspaceId={workspace.id} />
          {meta?.secret && (
            <>
              <MetaAssets workspaceId={workspace.id} />
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
