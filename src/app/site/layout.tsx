import type { Metadata } from "next";
import Link from "next/link";
import "@fontsource-variable/rubik/wght.css";
import { MikeeAvatar } from "@/components/MikeeAvatar";
import { appPath, sitePath } from "./links";
import { Reveal } from "./parts";
import "./site.css";

export const metadata: Metadata = {
  title: { default: "מייקי · מנהל השיווק של העסק שלך", template: "%s · מייקי" },
  description: "מייקי מנהל עבורך את השיווק הדיגיטלי: קמפיינים במטא, תוכן, וידאו, סושיאל ושיחות עם לקוחות. הכול בצ׳אט אחד, בעזרת AI, ושום דבר לא יוצא בלי האישור שלך.",
  openGraph: { title: "מייקי · מנהל השיווק של העסק שלך", description: "העסק שלך משווק את עצמו. אתה רק מאשר.", locale: "he_IL", type: "website" },
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const home = sitePath("/");
  const email = process.env.SUPPORT_EMAIL;
  const year = new Date().getFullYear();
  return (
    <div className="s-root" id="top">
      <header className="s-nav">
        <Link href={home} className="s-brand" aria-label="מייקי, לדף הבית">
          <MikeeAvatar size={28} animate={false} />
          <span>מייקי</span>
        </Link>
        <nav className="s-nav-links" aria-label="ניווט">
          <a href={`${home}#try`}>לנסות</a>
          <a href={`${home}#what`}>הצוות</a>
          <a href={`${home}#how`}>איך זה עובד</a>
          <a href={`${home}#pricing`}>מחירים</a>
          <a href={`${home}#faq`}>שאלות</a>
        </nav>
        <div className="s-nav-end">
          <a href={appPath("/login")} className="s-link">כניסה</a>
          <a href={appPath("/signup")} className="s-btn s-btn-accent s-btn-sm">להתחיל</a>
        </div>
      </header>

      {children}

      <footer className="s-foot">
        <div className="s-foot-top">
          <div className="s-foot-notes">
            <span className="s-brand">
              <MikeeAvatar size={24} animate={false} />
              <span>מייקי</span>
            </span>
            <p>מנהל השיווק של העסק שלך, בצ׳אט אחד.</p>
            <p>שום דבר לא עולה לאוויר ושום שקל לא יוצא בלי האישור שלך.</p>
          </div>
          <a href="#top" className="s-link">חזרה למעלה</a>
        </div>
        {email ? (
          <a href={`mailto:${email}`} className="s-foot-contact" dir="ltr">
            {email}
          </a>
        ) : (
          <Link href={sitePath("/meeting")} className="s-foot-contact">
            לקבוע פגישת היכרות
          </Link>
        )}
        <div className="s-foot-meta">
          <nav aria-label="קישורים">
            <Link href={sitePath("/meeting")}>פגישת היכרות</Link>
            <Link href={sitePath("/terms")}>תנאי שימוש</Link>
            <Link href={sitePath("/privacy")}>מדיניות פרטיות</Link>
            <a href={appPath("/login")}>כניסה לחשבון</a>
          </nav>
          <span>התמונות באתר הן דוגמאות להמחשה.</span>
          <span>ישראל · {year}</span>
        </div>
      </footer>
      <Reveal />
    </div>
  );
}
