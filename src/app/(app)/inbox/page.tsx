import { requireSession } from "@/lib/auth";
import { getConnection, type MetaConfig } from "@/lib/connections";
import { InstagramInbox } from "@/components/InstagramInbox";
import { CommentsInbox } from "@/components/CommentsInbox";
import { Page, PageHeader } from "@/components/Page";
import { getT } from "@/lib/i18n/server";

export default async function InboxPage() {
  const t = await getT();
  const { workspace } = await requireSession();
  const meta = await getConnection<MetaConfig>(workspace.id, "meta");
  const ig = meta?.config.igUsername;
  const connected = !!meta?.secret && meta.status !== "broken";
  return (
    <Page>
      <PageHeader title={t("הודעות ותגובות")} lead={ig ? `@${ig}. ${t("מייקי עונה מיד רק כשיש תשובה ברורה במידע שאישרת. כל השאר מחכה לך כאן.")}` : t("קודם מחברים את פייסבוק ואינסטגרם בהגדרות.")} />
      <InstagramInbox connected={!!meta?.secret && !!meta.config.igUserId} />
      <section className="mt-[40px]">
        <h2 className="section-head">{t("הפוסטים והתגובות")}</h2>
        <p className="mb-4 text-[15px] text-ink-2">{t("הפוסטים האחרונים בפייסבוק ובאינסטגרם והתגובות עליהם. אפשר לענות, לעשות לייק, להסתיר, לערוך או למחוק, וכל פעולה יוצאת רק כשאת לוחצת.")}</p>
        <CommentsInbox connected={connected && !!(meta?.config.pageId || meta?.config.igUserId)} />
      </section>
    </Page>
  );
}
