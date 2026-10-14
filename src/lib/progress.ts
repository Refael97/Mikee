/**
 * What the client sees while Mikee and his team work: one plain sentence per step, saying who does what
 * ("סוכן הקמפיינים בודק כמה תקציב פנוי"). No jargon, no tool names. Shared by the server and the chat screen.
 */

/** The specialists, as the client meets them. */
export const AGENT_NAMES: Record<string, string> = {
  media_buyer: "סוכן הקמפיינים",
  copywriter: "סוכן הקופי",
  creative: "סוכן הקריאייטיב",
  video_editor: "סוכן עריכת הווידאו",
  social: "סוכן הסושיאל",
  analyst: "סוכן הנתונים",
};

/** Mikee handing work to a specialist. */
const DELEGATIONS: Record<string, string> = {
  ask_media_buyer: "מייקי מפעיל את סוכן הקמפיינים",
  ask_copywriter: "מייקי מפעיל את סוכן הקופי",
  ask_creative: "מייקי מפעיל את סוכן הקריאייטיב",
  ask_video_editor: "מייקי מפעיל את סוכן עריכת הווידאו",
  ask_social: "מייקי מפעיל את סוכן הסושיאל",
  ask_analyst: "מייקי מפעיל את סוכן הנתונים",
};

/** What a step does, without its subject (Mikee or a specialist is put in front). */
const ACTIONS: Record<string, string> = {
  remember: "רושם לעצמו פרט חשוב",
  forget: "מעדכן את מה שהוא יודע",
  update_playbook: "רושם מה את אוהבת, כדי שבפעם הבאה זה יהיה מדויק יותר",
  journey_status: "בודק איפה אנחנו בתוכנית",
  update_journey: "מעדכן את התוכנית",
  set_dashboard: "מסדר את עמוד התוצאות",
  scan_website: "קורא את האתר",
  read_store: "בודק את החנות",
  read_stories: "מייקי בודק את הסטוריז באינסטגרם",
  read_organic_insights: "מייקי בודק את החשיפה האורגנית באינסטגרם",
  read_social: "עובר על הפוסטים באינסטגרם ובפייסבוק",
  read_results: "מקבל נתונים ממטא",
  read_insights: "מעמיק בנתונים",
  budget_status: "בודק כמה תקציב פנוי החודש",
  get_campaign_context: "אוסף את מה שצריך לקמפיין: תקציב, טפסים ומדיה",
  meta_media: "עובר על התמונות והסרטונים בחשבון המודעות",
  search_library: "מחפש בספרייה שלך",
  search_targeting: "מחפש קהלים מתאימים",
  list_audiences: "בודק את הקהלים השמורים",
  advertiser_identity: "בודק מי המפרסם והמשלם במטא",
  meta_read: "בודק פרט בחשבון המודעות",
  meta_write: "מסדר הגדרה בחשבון המודעות",
  list_instagram_conversations: "קורא את ההודעות באינסטגרם",
  read_instagram_conversation: "קורא שיחה באינסטגרם",
  use_skill: "עובד לפי הסקיל שהוספת",
  request_budget_increase: "מכין בקשה להגדלת התקציב",
  propose_campaign: "מכין לך את הקמפיין לאישור",
  propose_change: "מכין לך שינוי לאישור",
  propose_story: "מכין לך את הסטורי לאישור",
  propose_adset: "מכין לך סדרה חדשה בקמפיין הקיים",
  propose_adset_copy: "מכין לך שכפול של הסדרה",
  withdraw_card: "מבטל הצעה שלא הייתה נכונה",
  propose_post: "מכין לך את הפוסט לאישור",
  propose_media: "מכין לך את התמונה לאישור",
  propose_video: "מכין לך את הסרטון לאישור",
  web_search: "מחפש ברשת",
  web_fetch: "קורא עמוד ברשת",
};

/** Bookkeeping that says nothing to the client. */
export const SILENT_STEPS = new Set(["file_conversation", "set_stage", "team_playbook"]);

/** One step as the client reads it, e.g. "סוכן הקמפיינים בודק כמה תקציב פנוי החודש". */
export function stepLabel(tool: string, agent?: string): string {
  if (!agent || agent === "mikee") {
    if (DELEGATIONS[tool]) return DELEGATIONS[tool];
    return `מייקי ${ACTIONS[tool] ?? "בודק עוד פרט"}`;
  }
  return `${AGENT_NAMES[agent] ?? "הצוות"} ${ACTIONS[tool] ?? "עובד על החלק שלו"}`;
}
