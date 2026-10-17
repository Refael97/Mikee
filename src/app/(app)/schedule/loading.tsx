import { PageLoading } from "@/components/PageLoading";
import { getT } from "@/lib/i18n/server";

export default async function Loading() {
  const t = await getT();
  return <PageLoading title={t("תזמון")} lead={t("הפרסומים שמייקי יעלה במועד שאישרת. אפשר לבטל כל עוד הפרסום לא התחיל.")} narrow />;
}
