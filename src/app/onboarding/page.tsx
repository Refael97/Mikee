import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getConnection, type MetaConfig, type WebsiteConfig } from "@/lib/connections";
import { db, schema } from "@/lib/db";
import { startMikee } from "@/lib/actions";
import { BudgetForm, MetaAssets, MetaConnect, Section, WebsiteStore } from "@/components/ConnectionForms";
import { MikeeAvatar } from "@/components/MikeeAvatar";
import { META_ERRORS, META_NOTICES } from "@/lib/meta/notices";
import { Intake } from "@/components/Intake";
import { getSettings } from "@/lib/settings";
import { budgetRange } from "@/lib/intake";

export const dynamic = "force-dynamic";

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { user, workspace } = await requireSession();
  if (workspace.stage !== "connect") redirect("/mikee");
  const { error, notice } = await searchParams;

  const settings = await getSettings(workspace.id);
  // First the questions about the business, then the connections.
  if (!settings.intake)
    return (
      <main className="mx-auto max-w-[760px] px-4 py-10 sm:px-8 sm:py-14">
        <header className="mb-8">
          <MikeeAvatar size={96} />
          <h1 className="display mt-5">נעים מאוד, {user.name.split(" ")[0]}.</h1>
          <p className="lead mt-2 max-w-xl">לפני שמתחברים, שש שאלות קצרות כדי שאכיר את העסק ואדע איך לעזור הכי טוב.</p>
        </header>
        <Intake />
      </main>
    );

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
    <main className="mx-auto max-w-[1000px] px-4 py-10 sm:px-8 sm:py-14">
      <header className="mb-8">
        <MikeeAvatar size={96} />
        <h1 className="display mt-5">נעים מאוד, {user.name.split(" ")[0]}.</h1>
        <p className="lead mt-2 max-w-xl">
          אני מייקי. חברי אותי לעסק, ואני אלמד אותו לעומק לפני שנדבר: את האתר, המוצרים, הקמפיינים והפוסטים.
        </p>
      </header>

      {error && <p className="note note-warn mb-6">{META_ERRORS[error] ?? "משהו השתבש. נסי שוב."}</p>}
      {notice && META_NOTICES[notice] && <p className="note note-warn mb-6">{META_NOTICES[notice]}</p>}

      <div>
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
          <BudgetForm workspaceId={workspace.id} suggested={budgetRange(settings.intake).max || undefined} />
        </Section>
      </div>

      <form action={startMikee} className="mt-2 flex flex-wrap items-center gap-4 border-t border-line pt-6">
        <button className="btn btn-primary btn-lg" disabled={!ready}>
          בוא נתחיל, מייקי
        </button>
        {!ready && <p className="text-[15px] text-ink-3">צריך להוסיף אתר, לחבר את פייסבוק ולאשר את העסק.</p>}
      </form>
    </main>
  );
}
