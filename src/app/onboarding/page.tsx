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
    <main className="mx-auto max-w-[760px] px-5 py-12 sm:py-20">
      <header className="mb-14 text-center">
        <div className="orb orb-glow orb-breathe mx-auto w-20" />
        <span className="kicker rise mt-10">בואי נתחיל</span>
        <h1 className="display rise mt-3 [animation-delay:40ms]">
          נעים מאוד, <span className="accent-word">{user.name.split(" ")[0]}</span>.
        </h1>
        <p className="lead rise mx-auto mt-4 max-w-md [animation-delay:80ms]">
          אני מייקי. חברי אותי לעסק, ואני אלמד אותו לעומק לפני שנדבר: את האתר, המוצרים, הקמפיינים והפוסטים.
        </p>
      </header>

      {error && <p className="card mb-6 rounded-2xl p-4 text-warn">{error}</p>}

      <div className="space-y-10">
        <Section step={1} title="האתר" hint="אקרא אותו כמו לקוחה חדשה, ואם זו חנות גם את המוצרים וההזמנות." done={!!site?.config.url}>
          <WebsiteStore workspaceId={workspace.id} />
        </Section>

        <Section step={2} title="פייסבוק ואינסטגרם" hint="כדי שאוכל לקרוא את התוצאות, להכין קמפיינים ולפרסם." done={connected}>
          <MetaConnect workspaceId={workspace.id} />
        </Section>

        <Section step={3} title="זה העסק שלך?" hint="אמצא לבד את הדף, האינסטגרם וחשבון המודעות." done={assets}>
          <MetaAssets workspaceId={workspace.id} businessName={workspace.name} />
        </Section>

        <Section step={4} title="תקציב השיווק החודשי" hint="זו התקרה. לעולם לא אעבור אותה בלי לבקש ולקבל אישור." done={!!budget}>
          <BudgetForm workspaceId={workspace.id} />
        </Section>
      </div>

      <form action={startMikee} className="mt-10 text-center">
        <button className="btn btn-primary px-10" disabled={!ready}>
          בוא נתחיל, מייקי
        </button>
        {!ready && <p className="mt-3 text-[15px] text-ink-3">צריך להוסיף אתר, לחבר את פייסבוק ולאשר את העסק.</p>}
      </form>
    </main>
  );
}
