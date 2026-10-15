import type { Metadata } from "next";

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
          <h2>הבקשה שלך התקבלה</h2>
          <p>
            המידע שקיבלנו מפייסבוק ומאינסטגרם עבורך נמחק: ההרשאה לחשבונות, בחירת הנכסים וההודעות שהתקבלו באינסטגרם. קוד האישור: <span dir="ltr" className="num">{code}</span>
          </p>
        </>
      )}
      <h2>איך מוחקים את המידע</h2>
      <p>יש שתי דרכים, ואפשר לבחור כל אחת מהן:</p>
      <p>מתוך מייקי: בהגדרות, תחת "פייסבוק ואינסטגרם", מנתקים את החיבור. ההרשאה והנכסים שבחרתם נמחקים מיד.</p>
      <p>מתוך פייסבוק: בהגדרות פייסבוק, תחת "אפליקציות ואתרים", מסירים את MIKEE ובוחרים לבקש מחיקה של המידע. אנחנו מוחקים אותו אוטומטית ומציגים כאן אישור.</p>
      <p>למחיקה של כל החשבון במייקי, כולל השיחות והקבצים, כתבו לנו מתוך העזרה בשירות או במייל, ונמחק תוך 30 יום.</p>
      <h2 lang="en" dir="ltr">Data deletion (English)</h2>
      <p lang="en" dir="ltr">
        To delete the data Mikee received from Facebook and Instagram, disconnect Facebook in Mikee's Settings, or remove MIKEE in your Facebook settings under Apps and Websites and request deletion. Mikee then deletes the stored access, the selected assets and the Instagram messages it received, and shows a confirmation code on this page. To delete the whole Mikee account, contact us from the help panel in the app and we delete it within 30 days.
      </p>
    </main>
  );
}
