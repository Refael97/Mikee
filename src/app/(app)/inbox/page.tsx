import { requireSession } from "@/lib/auth";
import { getConnection, type MetaConfig } from "@/lib/connections";
import { InstagramInbox } from "@/components/InstagramInbox";
import { Page, PageHeader } from "@/components/Page";

export default async function InboxPage() {
  const { workspace } = await requireSession();
  const meta = await getConnection<MetaConfig>(workspace.id, "meta");
  const ig = meta?.config.igUsername;
  return (
    <Page>
      <PageHeader title="הודעות באינסטגרם" lead={ig ? `@${ig}. מייקי עונה מיד רק כשיש תשובה ברורה במידע שאישרת. כל השאר מחכה לך כאן.` : "קודם מחברים את חשבון האינסטגרם בהגדרות."} />
      <InstagramInbox connected={!!meta?.secret && !!meta.config.igUserId} />
    </Page>
  );
}
