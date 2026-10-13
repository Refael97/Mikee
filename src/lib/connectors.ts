/** Everything the business can connect, in one list. "soon" ones are shown so the client knows they are coming. */
export type ConnectorId = "meta" | "website" | "store" | "google_drive" | "gmail" | "google_ads" | "tiktok" | "whatsapp" | "canva" | "dropbox";

export const CONNECTORS: { id: ConnectorId; name: string; does: string; status: "live" | "soon" }[] = [
  { id: "meta", name: "פייסבוק ואינסטגרם", does: "קמפיינים, פוסטים, תוצאות וקהלים", status: "live" },
  { id: "website", name: "האתר", does: "מייקי קורא את האתר, המוצרים והמחירים", status: "live" },
  { id: "store", name: "החנות (Shopify / WooCommerce)", does: "הזמנות, מלאי ולקוחות חוזרים", status: "live" },
  { id: "google_drive", name: "גוגל דרייב", does: "ייבוא תמונות וסרטונים לספריית התוכן", status: "live" },
  { id: "gmail", name: "מייל (Gmail / Outlook)", does: "ניוזלטרים ומיילים ללקוחות", status: "soon" },
  { id: "google_ads", name: "Google Ads", does: "קמפיינים בחיפוש וביוטיוב", status: "soon" },
  { id: "tiktok", name: "TikTok", does: "קמפיינים וסרטונים בטיקטוק", status: "soon" },
  { id: "whatsapp", name: "WhatsApp Business", does: "מענה לפניות ודיוור", status: "soon" },
  { id: "canva", name: "Canva", does: "עיצובים מהמותג שלך", status: "soon" },
  { id: "dropbox", name: "Dropbox", does: "ייבוא תוכן לספרייה", status: "soon" },
];
