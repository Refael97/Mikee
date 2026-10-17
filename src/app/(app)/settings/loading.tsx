import { PageLoading } from "@/components/PageLoading";
import { getT } from "@/lib/i18n/server";

export default async function Loading() {
  const t = await getT();
  return <PageLoading narrow title={t("הגדרות")} lead={t("התקציב, המגבלות, וכל מה שמחובר למייקי.")} sections={[t("תקציב השיווק החודשי"), t("מגבלות"), t("חיבורים")]} />;
}
