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
    if (err.subcode === 1885183) return "אפליקציית מטא עדיין במצב פיתוח, ולכן אי אפשר ליצור מודעות. צריך להעביר אותה למצב Live בהגדרות המפתחים של מטא.";
    if (err.code === 190 || err.code === 102) return "ההתחברות לפייסבוק פגה או בוטלה. צריך לחבר מחדש בהגדרות.";
    if (err.code === 10 || (err.code != null && err.code >= 200 && err.code < 300)) return "חסרה הרשאה בחשבון המודעות או בדף. צריך לחבר מחדש ולאשר את כל ההרשאות שמייקי מבקש.";
    if (err.code === 4 || err.code === 17 || err.code === 32 || err.code === 613 || err.code === 80004) return "מטא ביקשה להאט לרגע. אפשר לנסות שוב בעוד כמה דקות; שום דבר לא ייווצר פעמיים.";
    if (err.code === 368) return "מטא חסמה את הפעולה בגלל המדיניות שלה. מייקי יכול להציע נוסח או תמונה אחרים.";
    if (err.code === 2635 || err.code === 1487390) return "הגדרה בחשבון המודעות חסרה (למשל אמצעי תשלום). כדאי לבדוק את החשבון במנהל המודעות של מטא.";
    return "מטא לא קיבלה את הבקשה. אפשר לנסות שוב, ואם זה חוזר, מייקי יבדוק מה השתנה.";
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
