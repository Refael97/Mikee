import { PageLoading } from "@/components/PageLoading";
import { getT } from "@/lib/i18n/server";

export default async function Loading() {
  const t = await getT();
  return <PageLoading title={t("ספרייה")} lead={t("התמונות, הסרטונים והמוזיקה של העסק. מייקי מחפש כאן לפני שהוא יוצר משהו חדש, ובונה מכאן את הסרטונים.")} grid />;
}
