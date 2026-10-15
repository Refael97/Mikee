import { requireSession } from "@/lib/auth";
import { getConnection, type MetaConfig } from "@/lib/connections";
import { InstagramInbox } from "@/components/InstagramInbox";
import { CommentsInbox } from "@/components/CommentsInbox";
import { Page, PageHeader } from "@/components/Page";

export default async function InboxPage() {
  const { workspace } = await requireSession();
  const meta = await getConnection<MetaConfig>(workspace.id, "meta");
  const ig = meta?.config.igUsername;
  const connected = !!meta?.secret && meta.status !== "broken";
  return (
    <Page>
      <PageHeader title="הודעות ותגובות" lead={ig ? `@${ig}. מייקי עונה מיד רק כשיש תשובה ברורה במידע שאישרת. כל השאר מחכה לך כאן.` : "קודם מחברים את פייסבוק ואינסטגרם בהגדרות."} />
      <InstagramInbox connected={!!meta?.secret && !!meta.config.igUserId} />
      <section className="mt-[40px]">
        <h2 className="section-head">תגובות על הפוסטים</h2>
        <p className="mb-4 text-[15px] text-ink-2">התגובות האחרונות בפייסבוק ובאינסטגרם. אפשר לענות, לעשות לייק, להסתיר או למחוק, וכל פעולה יוצאת רק כשאת לוחצת.</p>
        <CommentsInbox connected={connected && !!(meta?.config.pageId || meta?.config.igUserId)} />
      </section>
    </Page>
  );
}
