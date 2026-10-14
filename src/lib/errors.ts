import { BudgetExceeded } from "./budget";
import { MetaDisconnected } from "./meta/context";
import { MetaError } from "./meta/graph";
import { BlockedAddress } from "./net";
import { MediaRejected } from "./media";
import { VideoProblem } from "./video/render";

/**
 * What the client reads when something fails: one plain Hebrew sentence with the way forward. The technical
 * detail (codes, Meta's own message) is kept separately for Mikee and the admin, never shown to her and
 * never containing a secret.
 */
export function friendlyError(err: unknown): string {
  if (err instanceof BudgetExceeded) {
    return /not set a monthly budget/.test(err.message)
      ? "עוד לא הוגדר תקציב חודשי. אפשר להגדיר אותו בהגדרות, ואז לנסות שוב."
      : "זה היה עובר את התקציב החודשי שהגדרת. אפשר להקטין את ההצעה או לבקש ממייקי תוספת תקציב.";
  }
  if (err instanceof MetaDisconnected) return "החיבור לפייסבוק ולאינסטגרם לא פעיל. צריך לחבר מחדש בהגדרות, ואז לנסות שוב.";
  if (err instanceof BlockedAddress) return "הקובץ או הקישור לא זמינים לנו. כדאי לבחור קובץ מהספרייה.";
  if (err instanceof MetaError) {
    // Codes and subcodes from Meta's error references (graph-api/guides/error-handling, marketing-api/error-reference).
    const sub = err.subcode;
    if (err.code === 1885183 || sub === 1885183) return "אפליקציית מטא עדיין במצב פיתוח, ולכן אי אפשר ליצור מודעות. צריך להעביר אותה למצב Live בהגדרות המפתחים של מטא.";
    if (err.code === 190 && (sub === 459 || sub === 464)) return "פייסבוק מבקש מבעל החשבון להיכנס לפייסבוק ולאשר משהו. אחרי שנכנסים לפייסבוק ומאשרים, אפשר לנסות שוב.";
    if (err.code === 190 || err.code === 102) return "ההתחברות לפייסבוק פגה או בוטלה. צריך לחבר מחדש בהגדרות.";
    if (sub === 1870034 || sub === 1870090 || sub === 1870092) return "צריך לאשר פעם אחת את תנאי הקהלים המותאמים של מטא בחשבון המודעות. אחרי האישור אפשר לנסות שוב.";
    if (sub === 1870047) return "הקהל קטן מדי כדי שמטא תשתמש בו. כדאי להרחיב אותו או לבחור קהל אחר.";
    if (sub === 1885172) return "אפשר לשנות את תקרת ההוצאה של חשבון המודעות עד 10 פעמים ביום, והמכסה להיום נוצלה. מחר זה יתעדכן לבד.";
    if (sub === 1487632) return "מטא מאפשרת לשנות תקציב של קבוצת מודעות עד 4 פעמים בשעה. אפשר לנסות שוב בעוד שעה.";
    if (sub === 1885272 || sub === 1885650) return "התקציב היומי נמוך מהמינימום שמטא דורשת לקמפיין הזה. כדאי להעלות אותו מעט.";
    if (sub === 1885621) return "בקמפיין הזה התקציב מוגדר ברמת הקמפיין, אז משנים אותו שם ולא בקבוצת המודעות.";
    if (sub === 1815199) return "לחשבון המודעות אין הרשאה לחשבון האינסטגרם. צריך לחבר את האינסטגרם לחשבון המודעות בהגדרות העסק של מטא.";
    if (sub === 1373054) return "הכפתור של המודעה לא מתאים לסוג המודעה. מייקי יכין גרסה עם כפתור אחר.";
    if (sub === 3858634) return "מטא דורשת לציין מי המפרסם ומי המשלם בקבוצת המודעות הזאת. בוחרים אותם פעם אחת כאן למטה, ואז מנסים שוב. הקמפיין שכבר נבנה נשמר ומושהה.";
    if (err.isThrottled) return "מטא ביקשה להאט לרגע. אפשר לנסות שוב בעוד כמה דקות; שום דבר לא ייווצר פעמיים.";
    if (err.code === 2635) return "החיבור למטא משתמש בגרסה ישנה של הממשק שלה. צריך לעדכן את המערכת; פנו לתמיכה.";
    if (err.code === 368) return "מטא חסמה זמנית את הפעולה הזאת בחשבון בגלל המדיניות שלה. אפשר לנסות שוב מאוחר יותר.";
    if (err.code === 10 || (err.code != null && err.code >= 200 && err.code < 300)) return "חסרה הרשאה לחשבון המודעות, לדף או לאינסטגרם. צריך לחבר מחדש ולאשר את כל ההרשאות שמייקי מבקש.";
    if (err.transient) return "מטא החזירה תקלה זמנית. אפשר לנסות שוב בעוד כמה דקות; שום דבר לא ייווצר פעמיים.";
    if (err.userMessage) return `מטא לא קיבלה את הבקשה: "${err.userMessage.slice(0, 200)}"`;
    return "מטא לא קיבלה את הבקשה. הפרטים המדויקים מופיעים למטה בפרטים הטכניים.";
  }
  if (err instanceof MediaRejected) return err.message;
  if (err instanceof VideoProblem) {
    return /not connected/.test(err.message)
      ? "יצירת הסרטונים עוד לא מחוברת בשרת. אפשר לפנות לתמיכה."
      : "אחת התמונות של הסרטון לא זמינה בספרייה. מייקי יכול להכין גרסה עם תמונות אחרות.";
  }
  const m = err instanceof Error ? err.message : String(err);
  if (/renderer is busy/i.test(m)) return "שרת הסרטונים עמוס כרגע. אפשר לנסות שוב בעוד כמה דקות.";
  if (/Video render/i.test(m)) return "הרינדור של הסרטון לא הצליח. אפשר לנסות שוב; אם זה חוזר, מייקי יפשט את הסרטון.";
  if (/Higgsfield|generation/i.test(m)) return "יצירת התמונה או הסרטון לא הושלמה. אפשר לנסות שוב; קרדיטים לא ינוכו פעמיים.";
  if (/download|HTTP/i.test(m)) return "לא הצלחתי להוריד את אחד הקבצים. כדאי לבחור קובץ מהספרייה ולנסות שוב.";
  return "משהו לא הצליח. אפשר לנסות שוב; מה שכבר נבנה נשמר ולא ייווצר פעמיים.";
}
