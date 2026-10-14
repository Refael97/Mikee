import "server-only";
import { getConnection, type MetaConfig } from "./connections";
import { getSettings } from "./settings";

export type Suggestion = { title: string; sub: string };

/**
 * Where to start, on the new conversation screen: only what fits this business. Nothing about products or
 * collections without a store, nothing about results without an ad account, nothing about direct messages
 * without Instagram.
 */
export async function startSuggestions(workspaceId: string): Promise<Suggestion[]> {
  const [settings, meta, store, site] = await Promise.all([
    getSettings(workspaceId),
    getConnection<MetaConfig>(workspaceId, "meta"),
    getConnection<{ domain?: string }>(workspaceId, "store"),
    getConnection<{ url?: string; platform?: string }>(workspaceId, "website"),
  ]);
  const hasStore = !!store?.config.domain || site?.config.platform === "shopify" || site?.config.platform === "woocommerce";
  const type = settings.businessType ?? (hasStore ? "ecommerce" : undefined);
  const metaOk = !!meta?.secret && meta.status !== "broken";
  const ads = metaOk && !!meta?.config.adAccountId;
  const ig = metaOk && !!meta?.config.igUserId;

  const out: Suggestion[] = [];
  if (!metaOk) out.push({ title: "לחבר את פייסבוק ואינסטגרם", sub: "כדי שאוכל לקרוא תוצאות ולהכין קמפיינים" });
  if (ads) out.push({ title: "איך הולך החודש?", sub: "תמונת מצב מהקמפיינים, במספרים אמיתיים" });
  if (hasStore) {
    out.push({ title: "מוצר שרוצים לקדם", sub: "קמפיין ממוקד עם התמונות מהחנות" });
    out.push({ title: "מה כדאי לקדם השבוע?", sub: "לפי המכירות, המלאי והתוצאות" });
  } else if (type === "local") {
    out.push({ title: "להביא לקוחות מהאזור", sub: "קמפיין לאנשים שגרים או עובדים קרוב" });
  } else if (type === "content") {
    out.push({ title: "להגדיל את הקהל", sub: "יותר עוקבים שבאמת מתעניינים" });
  }
  if (type !== "content" && !hasStore) out.push({ title: "צריך יותר פניות", sub: "מייקי בונה תוכנית ומכין קמפיין לידים" });
  if (ig) out.push({ title: "פוסטים לשבוע הקרוב", sub: "תוכן ברוח העמוד שלך, מוכן לאישור" });
  if (ig) out.push({ title: "מה כותבים לי בהודעות?", sub: "מייקי עובר על ההודעות באינסטגרם" });
  if (!site?.config.url) out.push({ title: "להכיר את העסק שלי", sub: "ספרי למייקי מה את מוכרת ולמי" });
  out.push({ title: "רעיון לסרטון קצר", sub: "מהתמונות והסרטונים שכבר יש לך" });
  return out.slice(0, 4);
}
