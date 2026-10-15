import Link from "next/link";
import { CalendarClock, Check, Clapperboard, Globe, ImagePlus, Megaphone, MessagesSquare } from "lucide-react";
import { MikeeAvatar } from "@/components/MikeeAvatar";
import { appPath, sitePath } from "./links";
import { SiteMikee } from "./SiteMikee";
import { GUIDANCE, PLANS as PLAN_DATA } from "@/lib/plans";

const ICON = { size: 18, strokeWidth: 1.5 };

const WHAT = [
  { icon: Megaphone, tone: "mint", title: "קמפיינים במטא", text: "בונה, מעלה ומנהל קמפיינים בפייסבוק ובאינסטגרם, ומעביר את התקציב למה שמביא תוצאות." },
  { icon: ImagePlus, tone: "violet", title: "תמונות וסרטונים", text: "יוצר תמונות וסרטונים למודעות ולפוסטים, בסגנון של העסק שלך." },
  { icon: Clapperboard, tone: "coral", title: "עריכת וידאו", text: "חותך, מוסיף כתוביות ומתאים כל סרטון לפורמט של הרשת שבה הוא עולה." },
  { icon: CalendarClock, tone: "sun", title: "סושיאל, תזמון ואוטומציות", text: "מתזמן פוסטים וסטוריז ומריץ משימות קבועות, כדי שלא תצטרך לזכור." },
  { icon: MessagesSquare, tone: "mint", title: "שיחות עם לקוחות", text: "עוזר לענות להודעות באינסטגרם, ומסמן לך את מה שצריך מגע אישי." },
  { icon: Globe, tone: "violet", title: "חיבור לאתר", text: "מתחבר לאתר שלך, לומד ממנו את העסק ומשתמש בזה בתוכן ובקמפיינים." },
] as const;

const STEPS = [
  { title: "מחברים את העסק", text: "פותחים חשבון ומחברים את עמוד הפייסבוק, האינסטגרם וחשבון המודעות. מייקי לומד את העסק מהאתר ומהעמודים." },
  { title: "מספרים למייקי מה צריך", text: "בעברית פשוטה, כמו לאיש שיווק: יותר פניות, פוסטים לשבוע הבא, סרטון לסטורי." },
  { title: "מאשרים, ומייקי מבצע", text: "כל הוצאה וכל פרסום מגיעים אליך ככרטיס לאישור. תקציב החודש שקבעת הוא תקרה שמייקי לא חוצה." },
];

const QUOTES = [
  {
    text: "95% ממה שמשווקים נעזרים בו היום בסוכנויות, באסטרטגים ובאנשי קריאייטיב, יטופל על ידי ה-AI בקלות, כמעט מיד וכמעט בלי עלות.",
    who: "סם אלטמן",
    role: "מנכ״ל OpenAI, בספר Our AI Journey (2024)",
    href: "https://www.marketingaiinstitute.com/blog/sam-altman-ai-agi-marketing",
  },
  {
    text: "נגיע לנקודה שבה אתה עסק, אתה בא אלינו, אומר לנו מה המטרה שלך, מחבר את חשבון הבנק, ואתה לא צריך קריאייטיב, לא צריך להגדיר קהל יעד ולא צריך מדידה.",
    who: "מארק צוקרברג",
    role: "מנכ״ל Meta, בראיון ל-Stratechery (2025)",
    href: "https://stratechery.com/2025/an-interview-with-meta-ceo-mark-zuckerberg-about-ai-and-the-evolution-of-social-media/",
  },
  {
    text: "לא תאבד את העבודה שלך ל-AI. תאבד אותה למישהו שמשתמש ב-AI.",
    who: "ג׳נסן הואנג",
    role: "מנכ״ל Nvidia, בכנס מכון מילקן (2025)",
    href: "https://www.nbclosangeles.com/news/business/money-report/nvidia-ceo-you-wont-lose-your-job-to-ai-youll-lose-your-job-to-somebody-who-uses-ai/3710590/",
  },
];

const FEATURES = ["ניהול קמפיינים מלא במטא (פייסבוק ואינסטגרם)", "חיבור לאתר", "יצירת תמונות וסרטונים", "עריכת וידאו", "תזמון ואוטומציות"];

// Prices and storage come from src/lib/plans.ts, so the site always says what the app enforces.
// The AI quota is not shown in numbers: the plus plan simply includes more work.
const PLANS = [
  { id: "ai_299", extra: "שימוש ב-AI לעבודה שוטפת", note: "לעסק שמתחיל לשווק באופן קבוע", featured: false },
  { id: "ai_499", extra: "פי 2.5 יותר שימוש ב-AI", note: "למי שעובד עם מייקי הרבה", featured: true },
] as const;

const FAQ = [
  { q: "צריך לדעת שיווק כדי לעבוד עם מייקי?", a: "לא. מספרים לו מה רוצים בשפה פשוטה, והוא מציע תוכנית, כותב, מעצב ומעלה. אתה מאשר." },
  { q: "מי מחליט על ההוצאות?", a: "אתה. כל קמפיין, כל שינוי תקציב וכל פרסום מגיעים ככרטיס לאישור, ותקציב החודש שקבעת הוא תקרה." },
  { q: "תקציב המודעות כלול במחיר?", a: "לא. המנוי הוא על מייקי. הכסף שמוציאים על מודעות משולם ישירות למטא, מחשבון המודעות שלך." },
  { q: "מה צריך כדי להתחיל?", a: "עמוד עסקי בפייסבוק, חשבון אינסטגרם עסקי וחשבון מודעות במטא. החיבור לוקח כמה דקות." },
  { q: "מה ההבדל בין המסלולים?", a: "בשניהם יש את כל היכולות. במסלול פלוס יש יותר אחסון ויותר שימוש ב-AI, למי שנותן למייקי הרבה עבודה." },
  { q: "מה כולל הליווי האישי?", a: `פגישת הקמה שבה מחברים את הכול ומגדירים יעדים, ואחריה שיחות קבועות על התוצאות, האסטרטגיה והצעדים הבאים: בליווי החודשי שיחה של ${GUIDANCE.monthly.callMinutes} דקות בחודש (₪${GUIDANCE.monthly.priceIls}), בליווי השבועי ${GUIDANCE.weekly.callsPerMonth} שיחות של ${GUIDANCE.weekly.callMinutes} דקות בחודש (₪${GUIDANCE.weekly.priceIls}). בין השיחות עונים לשאלות בכתב.` },
];

export default function SiteHome() {
  const meeting = sitePath("/meeting");
  return (
    <main>
      {/* Hero: the thesis and Mikee himself */}
      <section className="s-wrap s-hero">
        <div className="s-hero-copy">
          <p className="s-kicker">MIKEE · מנהל צוות השיווק שלך</p>
          <h1 className="s-h1">
            העסק שלך משווק את עצמו.
            <span className="s-h1-dim">אתה מתמקד בלצמוח.</span>
          </h1>
          <p className="s-lead">מייקי מנהל עבורך את השיווק הדיגיטלי: קמפיינים ברשתות החברתיות, יצירת תוכן וניהול השיחות עם הלקוחות. הכול במקום אחד, בעזרת AI.</p>
          <div className="s-ctas">
            <a href={appPath("/signup")} className="btn btn-primary s-btn-lg">להתחיל עם מייקי</a>
            <Link href={meeting} className="btn btn-quiet s-btn-lg">לקבוע פגישת היכרות</Link>
          </div>
          <p className="s-trust">שום דבר לא עולה לאוויר ושום שקל לא יוצא בלי האישור שלך.</p>
        </div>

        <div className="s-hero-art">
          <SiteMikee />
          <div className="s-chat" aria-hidden>
            <div className="s-bubble-you">צריך יותר פניות החודש</div>
            <div className="s-bubble-mikee">
              <MikeeAvatar size={26} animate={false} />
              <div>
                <p>הכנתי קמפיין לידים בפייסבוק ובאינסטגרם: שתי גרסאות למודעה, טופס קצר ו-₪60 ליום.</p>
                <span className="s-badge s-badge-sun"><i />ממתין לאישור שלך</span>
              </div>
            </div>
            <div className="s-fake-btn">אשר והעלה לאוויר · ₪60 ליום</div>
          </div>
        </div>
      </section>

      {/* What Mikee does */}
      <section id="what" className="s-wrap s-section">
        <header className="s-head">
          <h2 className="s-h2">צוות שיווק שלם, בשיחה אחת</h2>
          <p className="s-sub">אתה מדבר רק עם מייקי. מאחוריו עובד צוות של סוכנים מומחים: קופירייטר, קניין מדיה, קריאייטיב, עורך וידאו, מנהל סושיאל ואנליסט.</p>
        </header>
        <div className="s-grid3">
          {WHAT.map(({ icon: Icon, tone, title, text }) => (
            <article key={title} className="s-tile">
              <span className={`s-ico s-${tone}`}>
                <Icon {...ICON} />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* How it works: a real sequence, so it is numbered */}
      <section id="how" className="s-wrap s-section">
        <header className="s-head">
          <h2 className="s-h2">איך זה עובד</h2>
        </header>
        <ol className="s-steps">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="s-step-n">{i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* An example of the work */}
      <section className="s-wrap s-section">
        <header className="s-head">
          <h2 className="s-h2">ככה נראה קמפיין שמייקי מכין</h2>
          <p className="s-sub">שתי גרסאות למודעה, קהל, תקציב ומטרה, בכרטיס אחד שמחכה לאישור שלך. דוגמה להמחשה.</p>
        </header>
        <div className="s-proof">
          <div className="s-proof-top">
            <div>
              <p className="s-proof-kicker">קמפיין חדש</p>
              <h3 className="s-proof-title">פניות ממעסיקים שמגייסים עכשיו</h3>
            </div>
            <span className="s-badge s-badge-sun"><i />ממתין לאישור שלך</span>
          </div>
          <div className="s-ads">
            {[
              { img: "/site/cafe.jpg", alt: "בעלת בית קפה מסתכלת בטלפון מאחורי הדלפק", tag: "גרסה A", head: "משרה פתוחה? מועמדים תוך 48 שעות", cta: "השארת פרטים" },
              { img: "/site/warehouse.jpg", alt: "מנהל מחסן עם טאבלט בין המדפים", tag: "גרסה B", head: "חסרים ידיים במחסן לפני החגים?", cta: "למידע נוסף" },
            ].map((a) => (
              <figure key={a.tag} className="s-ad">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.img} alt={a.alt} loading="lazy" width={900} height={1200} />
                <span className="s-ad-tag">{a.tag}</span>
                <figcaption>
                  <b>{a.head}</b>
                  <em>{a.cta}</em>
                </figcaption>
              </figure>
            ))}
          </div>
          <dl className="s-plan">
            <div><dt>תקציב</dt><dd className="s-num">₪60 ליום · 14 ימים</dd></div>
            <div><dt>קהל</dt><dd>בעלי עסקים, 28 עד 60</dd></div>
            <div><dt>איפה</dt><dd>פייסבוק ואינסטגרם</dd></div>
            <div><dt>מטרה</dt><dd>פנייה בטופס</dd></div>
          </dl>
        </div>
      </section>

      {/* Quotes, verified, with their sources */}
      <section className="s-wrap s-section">
        <header className="s-head">
          <h2 className="s-h2">השיווק עובר ל-AI</h2>
          <p className="s-sub">כך אומרים מי שבונים את הכלים. תורגם מאנגלית, עם קישור למקור.</p>
        </header>
        <div className="s-grid3">
          {QUOTES.map((q) => (
            <figure key={q.who} className="s-quote">
              <blockquote>״{q.text}״</blockquote>
              <figcaption>
                <b>{q.who}</b>
                <span>{q.role}</span>
                <a href={q.href} target="_blank" rel="noopener noreferrer" className="link">למקור</a>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="s-wrap s-section">
        <header className="s-head">
          <h2 className="s-h2">מחירים</h2>
          <p className="s-sub">שני מסלולים עם כל היכולות. ההבדל הוא בכמה עבודה נותנים למייקי.</p>
        </header>
        <div className="s-prices">
          {PLANS.map((p) => ({ ...p, ...PLAN_DATA()[p.id] })).map((p) => (
            <article key={p.id} className={`s-price ${p.featured ? "is-featured" : ""}`}>
              <div className="s-price-head">
                <h3>{p.name}</h3>
                {p.featured && <span className="s-badge s-badge-mint"><i />הכי משתלם</span>}
              </div>
              <p className="s-price-note">{p.note}</p>
              <p className="s-price-num"><span className="s-num">₪{p.priceIls}</span><small>לחודש</small></p>
              <ul className="s-checks">
                {[...FEATURES, `${p.storageGb}GB אחסון`, p.extra].map((f) => (
                  <li key={f}><Check size={17} strokeWidth={1.5} />{f}</li>
                ))}
              </ul>
              <a href={appPath(`/signup?plan=${p.id}`)} className={`btn ${p.featured ? "btn-primary" : "btn-quiet"} s-btn-lg s-btn-full`}>להתחיל עם {p.name}</a>
            </article>
          ))}
          <article className="s-price s-addon">
            <div className="s-price-head">
              <h3>ליווי אישי</h3>
              <span className="s-badge s-badge-violet"><i />תוספת לכל מסלול</span>
            </div>
            <p className="s-price-note">מייקי עושה את העבודה, ואנחנו לצידך</p>
            <p className="s-price-num"><small>החל מ־</small><span className="s-num">+₪{GUIDANCE.monthly.priceIls}</span><small>לחודש</small></p>
            <ul className="s-checks">
              {[
                `${GUIDANCE.monthly.name}: שיחה של ${GUIDANCE.monthly.callMinutes} דקות בחודש, ₪${GUIDANCE.monthly.priceIls}`,
                `${GUIDANCE.weekly.name}: ${GUIDANCE.weekly.callsPerMonth} שיחות של ${GUIDANCE.weekly.callMinutes} דקות בחודש, ₪${GUIDANCE.weekly.priceIls}`,
                "פגישת הקמה: מחברים את הכול ומגדירים יעדים",
                "מענה לשאלות בכתב בין השיחות",
              ].map((f) => (
                <li key={f}><Check size={17} strokeWidth={1.5} />{f}</li>
              ))}
            </ul>
            <Link href={meeting} className="btn btn-quiet s-btn-lg s-btn-full">לקבוע פגישת היכרות</Link>
          </article>
        </div>
        <p className="s-fine">תקציב המודעות עצמו משולם ישירות למטא ואינו כלול במחיר המנוי.</p>
      </section>

      {/* FAQ */}
      <section id="faq" className="s-wrap s-section s-narrow">
        <header className="s-head">
          <h2 className="s-h2">שאלות נפוצות</h2>
        </header>
        <div className="s-faq">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final call */}
      <section className="s-wrap s-section">
        <div className="s-final">
          <MikeeAvatar size={64} />
          <h2 className="s-h2">מוכן שמייקי ייקח את השיווק?</h2>
          <p className="s-sub">פותחים חשבון בשתי דקות, או קובעים פגישת היכרות ומקימים יחד.</p>
          <div className="s-ctas">
            <a href={appPath("/signup")} className="btn btn-primary s-btn-lg">להתחיל עם מייקי</a>
            <Link href={meeting} className="btn btn-quiet s-btn-lg">לקבוע פגישת היכרות</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
