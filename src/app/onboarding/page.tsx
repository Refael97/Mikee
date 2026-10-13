import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getConnection, type MetaConfig, type WebsiteConfig } from "@/lib/connections";
import { db, schema } from "@/lib/db";
import { startMikee } from "@/lib/actions";
import { BudgetForm, MetaAssets, MetaConnect, Section, WebsiteStore } from "@/components/ConnectionForms";

export const dynamic = "force-dynamic";

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { user, workspace } = await requireSession();
  if (workspace.stage !== "connect") redirect("/mikee");
  const { error } = await searchParams;

  const d = await db();
  const [meta, site, budget] = await Promise.all([
    getConnection<MetaConfig>(workspace.id, "meta"),
    getConnection<WebsiteConfig>(workspace.id, "website"),
    d.query.budgets.findFirst({ where: eq(schema.budgets.workspaceId, workspace.id) }),
  ]);
  const connected = !!meta?.secret;
  const assets = !!meta?.config.adAccountId;
  const ready = connected && assets && !!site?.config.url;

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:py-20">
      <header className="mb-12 text-center fade-in">
        <div className="orb mx-auto h-14 w-14" />
        <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">נעים מאוד, {user.name.split(" ")[0]}.</h1>
        <p className="mx-auto mt-4 max-w-md text-lg text-ink-2">
          אני מייקי. חברי אותי לעסק, ואני אלמד אותו לעומק לפני שנדבר: את האתר, המוצרים, הקמפיינים והפוסטים.
        </p>
      </header>

      {error && <p className="card mb-6 p-4 text-warn">{error}</p>}

      <div className="space-y-5">
        <Section step={1} title="פייסבוק ואינסטגרם" hint="כדי שאוכל לקרוא את התוצאות, להכין קמפיינים ולפרסם." done={connected}>
          <MetaConnect workspaceId={workspace.id} />
        </Section>

        <Section step={2} title="מה שייך לעסק" hint="בחרי את החשבון, הדף והקטלוג שאני עובד איתם." done={assets}>
          <MetaAssets workspaceId={workspace.id} />
        </Section>

        <Section step={3} title="האתר" hint="אקרא אותו כמו לקוחה חדשה, ואם זו חנות גם את המוצרים וההזמנות." done={!!site?.config.url}>
          <WebsiteStore workspaceId={workspace.id} />
        </Section>

        <Section step={4} title="תקציב השיווק החודשי" hint="זו התקרה. לעולם לא אעבור אותה בלי לבקש ולקבל אישור." done={!!budget}>
          <BudgetForm workspaceId={workspace.id} />
        </Section>
      </div>

      <form action={startMikee} className="mt-10 text-center">
        <button className="btn btn-primary px-8 py-3.5 text-lg" disabled={!ready}>
          בוא נתחיל, מייקי
        </button>
        {!ready && <p className="mt-3 text-sm text-ink-3">צריך לחבר את פייסבוק, לבחור חשבון ולהוסיף אתר.</p>}
      </form>
    </main>
  );
}
