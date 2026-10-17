import { PageLoading } from "@/components/PageLoading";
import { getT } from "@/lib/i18n/server";

export default async function Loading() {
  const t = await getT();
  return <PageLoading title={t("העסק")} lead={t("התוכנית השיווקית, צעד אחרי צעד, וכל מה שמייקי למד על העסק. אפשר לתקן כל משפט, ומייקי עובד לפי מה שכתוב כאן.")} sections={[t("התוכנית")]} />;
}
