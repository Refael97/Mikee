import { Suspense } from "react";
import { META_NOTICES } from "@/lib/meta/notices";
import { requireSession } from "@/lib/auth";
import { budgetStatus } from "@/lib/budget";
import { getConnection, type MetaConfig } from "@/lib/connections";
import { metaContext, money } from "@/lib/meta/context";
import { disconnectDrive, disconnectMeta, saveLimits } from "@/lib/actions";
import { CONNECTORS } from "@/lib/connectors";
import { driveConfigured } from "@/lib/google";
import { Page, PageHeader } from "@/components/Page";
import { getSettings } from "@/lib/settings";
import { SectionNav } from "@/components/SectionNav";
import { BudgetForm, MetaAssets, MetaConnect, Section, WebsiteStore } from "@/components/ConnectionForms";
import { AdvertiserIdentitySettings } from "@/components/AdvertiserIdentity";
import { remember } from "@/lib/ttl";
import { SubmitButton } from "@/components/SubmitButton";
import { SkillsEditor } from "@/components/SkillsEditor";
import { listSkills } from "@/lib/skills";

async function BudgetMeter({ workspaceId, tz }: { workspaceId: string; tz: string }) {
  try {
    // Display only, remembered for a minute; every decision re-checks the budget live.
    const s = await remember(`budget-meter:${workspaceId}`, 60_000, async () => budgetStatus(workspaceId, tz, await metaContext(workspaceId)));
    if (!s.configured) return null;
    const pct = (v: number) => `${Math.min(100, (Math.max(0, v) / Math.max(1, s.limit)) * 100)}%`;
    const c = s.currency;
    return (
      <div className="mt-6">
        <div className="flex h-2 overflow-hidden rounded-full bg-surface-2">
          <div className="bg-brand" style={{ width: pct(s.spent) }} />
          <div className="bg-brand/45" style={{ width: pct(s.committed + s.buffer) }} />
          <div className="bg-brand/20" style={{ width: pct(s.reserved) }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[15px] text-ink-2">
          <span>הושקעו {money(s.spent, c)}</span>
          <span>צפוי עד סוף החודש {money(s.committed + s.buffer, c)}</span>
          {s.reserved > 0 && <span>שמור להצעות שמחכות לך {money(s.reserved, c)}</span>}
          <span className="font-semibold text-ink">פנוי {money(Math.max(0, s.headroom), c)}</span>
          {s.extensions > 0 && <span>כולל תוספת שאישרת {money(s.extensions, c)}</span>}
        </div>
        {s.paused.length > 0 && (
          <p className="mt-2 text-[13px] text-ink-3">
            קמפיינים בהפסקה לא נספרים. אם מייקי ירצה להפעיל אחד מהם, הוא יבקש אישור והתקציב ייבדק שוב.
          </p>
        )}
      </div>
    );
  } catch {
    return null;
  }
}

async function Limits({ workspaceId }: { workspaceId: string }) {
  const settings = await getSettings(workspaceId);
  const cap = settings.metaSpendCapStatus;
  return (
    <form action={saveLimits} className="space-y-5">
      <label className="flex items-center justify-between gap-4">
        <span className="min-w-0 flex-1">
          <span className="block">תקרה קשיחה גם בחשבון המודעות</span>
          <span className="text-[15px] text-ink-3">מטא עצמה תעצור חיובים מעבר לתקציב, גם אם משהו משתנה מחוץ למייקי.</span>
          {cap && <span className={`mt-2 ${cap.ok ? "tag tag-good" : "tag tag-warn"}`}>{cap.ok ? "פעיל" : "לא הוגדר"}: {cap.detail}</span>}
        </span>
        <input type="checkbox" name="metaSpendCap" defaultChecked={settings.metaSpendCap} className="switch" />
      </label>
      <SubmitButton>שמירה</SubmitButton>
    </form>
  );
}

async function Skills({ workspaceId }: { workspaceId: string }) {
  const list = await listSkills(workspaceId);
  return <SkillsEditor initial={list.map((s) => ({ id: s.id, name: s.name, whenToUse: s.whenToUse, body: s.body, agents: s.agents, enabled: s.enabled, source: s.source }))} />;
}

const ERRORS: Record<string, string> = {
  meta_cancelled: "החיבור לפייסבוק בוטל או פג. נסי שוב.",
  meta_not_configured: "ההתחברות לפייסבוק עוד לא מוגדרת בשרת (חסרים META_APP_ID או APP_URL). אפשר לפנות לתמיכה.",
  meta_failed: "החיבור לפייסבוק נכשל. נסי שוב, ואם זה חוזר כתבי לנו בעזרה.",
  meta_token: "מפתח הגישה לא עבד. בדקי שהעתקת אותו במלואו.",
  meta_wrong_app: "המפתח שייך לאפליקציית מטא אחרת (למשל אפליקציה ישנה), או שהוא כבר לא תקף. צריך מפתח שהונפק דרך אפליקציית MIKEE.",
  bad_website: "כתובת האתר לא תקינה.",
  bad_store: "כתובת החנות לא תקינה. ב־Shopify זו הכתובת שנגמרת ב־myshopify.com.",
  drive_unavailable: "החיבור לגוגל דרייב עוד לא זמין בחשבון הזה.",
  drive_cancelled: "החיבור לגוגל דרייב בוטל.",
  drive_failed: "החיבור לגוגל דרייב נכשל. נסי שוב.",
};

async function Connectors({ workspaceId, businessName }: { workspaceId: string; businessName: string }) {
  const [meta, drive] = await Promise.all([getConnection<MetaConfig>(workspaceId, "meta"), getConnection(workspaceId, "google_drive")]);
  const live = CONNECTORS.filter((c) => c.status === "live");
  const soon = CONNECTORS.filter((c) => c.status === "soon");
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold">פייסבוק ואינסטגרם</h3>
        <p className="mb-4 text-[14px] text-ink-2">{live[0].does}</p>
        <div className="space-y-6">
          <MetaConnect workspaceId={workspaceId} />
          {meta?.secret && (
            <>
              <Suspense fallback={<span aria-label="טוען את הנכסים" className="skeleton block h-24 w-full" />}>
                <MetaAssets workspaceId={workspaceId} businessName={businessName} />
              </Suspense>
              <AdvertiserIdentitySettings />
              <form action={disconnectMeta}>
                <SubmitButton className="btn btn-danger btn-sm" pendingText="מנתק…" doneText={null}>ניתוק</SubmitButton>
              </form>
            </>
          )}
        </div>
      </div>

      <div className="border-t border-line pt-6">
        <h3 className="font-semibold">האתר והחנות</h3>
        <p className="mb-4 text-[14px] text-ink-2">מייקי קורא את האתר, המוצרים, ההזמנות והמלאי</p>
        <WebsiteStore workspaceId={workspaceId} />
      </div>

      <div className="border-t border-line pt-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold">גוגל דרייב</h3>
            <p className="text-[15px] text-ink-2">ייבוא תמונות וסרטונים לספרייה. מייקי רואה רק את הקבצים שבוחרים.</p>
          </div>
          {!driveConfigured() ? (
            <span className="tag tag-quiet">בקרוב</span>
          ) : drive?.secret && drive.status !== "broken" ? (
            <div className="flex items-center gap-4">
              <span className="tag tag-good">מחובר{(drive.config as { email?: string }).email ? ` · ${(drive.config as { email?: string }).email}` : ""}</span>
              <form action={disconnectDrive}>
                <SubmitButton className="btn btn-danger btn-sm" pendingText="מנתק…" doneText={null}>ניתוק</SubmitButton>
              </form>
            </div>
          ) : (
            <a href="/api/google/connect" className="btn btn-quiet btn-sm">
              {drive?.status === "broken" ? "לחבר מחדש" : "לחבר"}
            </a>
          )}
        </div>
      </div>

      <div className="border-t border-line pt-6">
        <h3 className="font-semibold">בקרוב</h3>
        <p className="text-[15px] text-ink-2">חיבורים שאנחנו בונים עכשיו. רוצה אחד מהם קודם? ספרי לנו דרך העזרה.</p>
        <ul className="mt-4 grid gap-x-8 sm:grid-cols-2">
          {soon.map((c) => (
            <li key={c.id} className="flex items-baseline justify-between gap-4 border-b border-line py-3">
              <span>
                <span className="block font-semibold">{c.name}</span>
                <span className="text-[14px] text-ink-3">{c.does}</span>
              </span>
              <span className="tag tag-quiet shrink-0">בקרוב</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const SECTIONS = [
  { id: "budget", label: "תקציב חודשי" },
  { id: "limits", label: "מגבלה במטא" },
  { id: "skills", label: "סקילים" },
  { id: "connectors", label: "חיבורים" },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { workspace } = await requireSession();
  const { error, notice } = await searchParams;
  return (
    <Page>
      <div className="lg:grid lg:grid-cols-[170px_minmax(0,820px)] lg:justify-between lg:gap-10">
      <div className="min-w-0">
      <PageHeader title="הגדרות" lead="התקציב, המגבלות, וכל מה שמחובר למייקי." />
      {error && ERRORS[error] && <p className="note note-warn mb-6">{ERRORS[error]}</p>}
      {notice && META_NOTICES[notice] && <p className="note note-warn mb-6">{META_NOTICES[notice]}</p>}

      <Section id="budget" title="תקציב השיווק החודשי" hint="התקרה החודשית. מייקי לא יעבור אותה בלי לבקש ולקבל אישור ממך.">
        <BudgetForm workspaceId={workspace.id} />
        <Suspense fallback={<span aria-hidden className="skeleton mt-6 block h-12 w-full" />}>
          <BudgetMeter workspaceId={workspace.id} tz={workspace.timezone} />
        </Suspense>
      </Section>

      <Section id="limits" title="מגבלה במטא" hint="שכבת הגנה נוספת על תקציב הפרסום, ישירות בחשבון המודעות.">
        <Limits workspaceId={workspace.id} />
      </Section>

      <Section id="skills" title="סקילים" hint="דרכי עבודה שלך שמייקי והצוות פועלים לפיהן כשהמשימה מתאימה. כותבים כאן או מעלים קובץ SKILL.md.">
        <Skills workspaceId={workspace.id} />
      </Section>

      <Section id="connectors" title="חיבורים" hint="כל מה שמייקי יכול לעבוד איתו. הגישה נשמרת מוצפנת ולא מגיעה למודל.">
        <Connectors workspaceId={workspace.id} businessName={workspace.name} />
      </Section>
      </div>
      <aside className="order-first lg:pt-24">
        <SectionNav items={SECTIONS} />
      </aside>
      </div>
    </Page>
  );
}
