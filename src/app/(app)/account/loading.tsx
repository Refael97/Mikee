import { PageLoading } from "@/components/PageLoading";
import { getT } from "@/lib/i18n/server";

export default async function Loading() {
  const t = await getT();
  return <PageLoading narrow title={t("הפרופיל שלי")} sections={[t("הפרטים שלי"), t("המנוי והשימוש")]} />;
}
