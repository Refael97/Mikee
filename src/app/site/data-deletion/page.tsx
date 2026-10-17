import type { Metadata } from "next";
import { Contact } from "../Contact";

export const metadata: Metadata = { title: "מחיקת מידע" };

/** Data deletion instructions (linked from the Meta app settings), and the status page Meta links a request to. */
export default async function DataDeletion({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  const valid = !!code && /^[A-Za-z0-9_-]{8,32}$/.test(code);
  return (
    <main className="s-wrap s-section s-narrow s-legal">
      <h1 className="s-h1 s-h1-sm">מחיקת מידע</h1>
      {valid && (
        <>
          <h2>קוד בקשת מחיקה</h2>
          <p>
            קוד הבקשה שהועבר לעמוד מוצג כאן לצורך פנייה ובירור. הצגת קוד בעמוד אינה בודקת את סטטוס הבקשה ואינה מאשרת שכל עותקי המידע נמחקו. קוד הבקשה: <span dir="ltr" className="num">{code}</span>
          </p>
        </>
      )}
      <h2>איך מוחקים את המידע</h2>
      <p>יש שתי דרכים, ואפשר לבחור כל אחת מהן:</p>
      <p>מתוך מייקי: בהגדרות, תחת "פייסבוק ואינסטגרם", מנתקים את החיבור. הניתוק מפסיק את הגישה דרך החיבור. הוא אינו מוחק אוטומטית את כל המידע שכבר התקבל, שיחות, קבצים או תוכן שכבר פורסם.</p>
      <p>מתוך פייסבוק: בהגדרות פייסבוק, תחת "אפליקציות ואתרים", מסירים את MIKEE ובוחרים לבקש מחיקה של המידע. מטא יכולה להעביר לנו בקשת מחיקה. בקשה תקינה מפעילה מחיקה של החיבור והודעות האינסטגרם שנשמרו דרכו. לבירור או למחיקת מידע נוסף שהועתק לשיחות, לקבצים או לרישומים אחרים, פנו אלינו עם קוד הבקשה. ניתוק הרשאה ובקשת מחיקה הם תהליכים שונים.</p>
      <p>למחיקה של כל החשבון במייקי, כולל השיחות והקבצים, כתבו לנו מתוך העזרה בשירות או במייל, ונמחק תוך 30 יום.</p>
      <Contact />
      <h2 lang="en" dir="ltr">Data deletion (English)</h2>
      <p lang="en" dir="ltr">
        Disconnecting Meta in Mikee stops access through that connection; it does not automatically erase previously imported data. You can also remove MIKEE in your Meta settings and request deletion. A valid callback deletes the stored Meta connection and Instagram inbox records associated with it. Contact us using the details above to request deletion of other Meta-derived data or the whole Mikee account. A code displayed on this page is a reference only: this page does not verify completion of a deletion request. We aim to complete account deletion within 30 days, subject to applicable legal requirements.
      </p>
    </main>
  );
}
