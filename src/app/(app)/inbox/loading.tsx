import { PageLoading } from "@/components/PageLoading";
import { getT } from "@/lib/i18n/server";

export default async function Loading() {
  const t = await getT();
  return <PageLoading title={t("הודעות באינסטגרם")} sections={[t("מענה אוטומטי"), t("המידע המאושר")]} />;
}
