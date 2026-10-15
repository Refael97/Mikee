import type { Metadata } from "next";
import Link from "next/link";
import { MikeeAvatar } from "@/components/MikeeAvatar";
import { appPath, sitePath } from "./links";
import "./site.css";

export const metadata: Metadata = {
  title: { default: "מייקי · מנהל צוות השיווק שלך", template: "%s · מייקי" },
  description: "מייקי מנהל עבורך את השיווק הדיגיטלי: קמפיינים במטא, תוכן, וידאו, סושיאל ושיחות עם לקוחות. הכול במקום אחד, בעזרת AI, ושום דבר לא יוצא בלי האישור שלך.",
  openGraph: { title: "מייקי · מנהל צוות השיווק שלך", description: "העסק שלך משווק את עצמו. אתה מתמקד בלצמוח.", locale: "he_IL", type: "website" },
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const home = sitePath("/");
  return (
    <div className="s-root">
      <header className="s-nav">
        <div className="s-nav-in">
          <Link href={home} className="s-brand" aria-label="מייקי, לדף הבית">
            <MikeeAvatar size={30} animate={false} />
            <span>מייקי</span>
          </Link>
          <nav className="s-nav-links" aria-label="ניווט">
            <a href={`${home}#what`}>מה מייקי עושה</a>
            <a href={`${home}#how`}>איך זה עובד</a>
            <a href={`${home}#pricing`}>מחירים</a>
            <a href={`${home}#faq`}>שאלות</a>
          </nav>
          <div className="s-nav-end">
            <a href={appPath("/login")} className="btn btn-ghost">כניסה</a>
            <a href={appPath("/signup")} className="btn btn-primary">להתחיל</a>
          </div>
        </div>
      </header>

      {children}

      <footer className="s-foot">
        <div className="s-wrap s-foot-in">
          <div className="s-brand">
            <MikeeAvatar size={26} animate={false} />
            <span>מייקי</span>
          </div>
          <p className="s-foot-line">מנהל צוות השיווק של העסק שלך, בעזרת AI.</p>
          <nav className="s-foot-links" aria-label="קישורים">
            <a href={`${home}#pricing`}>מחירים</a>
            <Link href={sitePath("/meeting")}>פגישת היכרות</Link>
            <Link href={sitePath("/terms")}>תנאי שימוש</Link>
            <Link href={sitePath("/privacy")}>מדיניות פרטיות</Link>
            <a href={appPath("/login")}>כניסה לחשבון</a>
          </nav>
          <p className="s-foot-small">© {new Date().getFullYear()} מייקי</p>
        </div>
      </footer>
    </div>
  );
}
