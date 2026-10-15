import Link from "next/link";
import { ArrowLeft, BellRing, CalendarClock, Check, ImagePlus, MessageCircle, MessagesSquare, Megaphone, ShieldCheck, Sparkles, Store, Wand2, X } from "lucide-react";
import { MikeeAvatar } from "@/components/MikeeAvatar";
import { GUIDANCE, PLANS } from "@/lib/plans";
import { appPath, sitePath } from "./links";
import { PhoneChat, Reveal, Scene, TypingLine } from "./home";
import "./home.css";

const ICON = { size: 20, strokeWidth: 1.6 };

/** Where Mikee works: shown as a moving row of pills. */
const CHANNELS = [
  { name: "פייסבוק", tile: "#1877f2", glyph: "f" },
  { name: "אינסטגרם", tile: "#e1306c", glyph: "◎" },
  { name: "סטוריז", tile: "#f77737", glyph: "●" },
  { name: "ריילס", tile: "#833ab4", glyph: "▶" },
  { name: "מנהל המודעות של מטא", tile: "#0866ff", glyph: "∞" },
  { name: "הודעות באינסטגרם", tile: "#c13584", glyph: "✉" },
  { name: "האתר שלך", tile: "#111111", glyph: "⌂" },
  { name: "שופיפיי", tile: "#5e8e3e", glyph: "S" },
  { name: "גוגל דרייב", tile: "#1fa463", glyph: "▲" },
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

const FEATURES = ["ניהול קמפיינים מלא במטא", "תמונות וסרטונים למודעות ולפוסטים", "עריכת וידאו עם כתוביות", "סושיאל, תזמון ואוטומציות", "מענה להודעות באינסטגרם", "חיבור לאתר ולחנות"];

const FAQ = [
  { q: "צריך לדעת שיווק כדי לעבוד עם מייקי?", a: "לא. מספרים לו מה רוצים בשפה פשוטה, והוא מציע תוכנית, כותב, מעצב ומעלה. אתה רק מאשר." },
  { q: "מי מחליט על ההוצאות?", a: "אתה. כל קמפיין, כל שינוי תקציב וכל פרסום מגיעים ככרטיס לאישור, ותקציב החודש שקבעת הוא תקרה שמייקי לא חוצה." },
  { q: "תקציב המודעות כלול במחיר?", a: "לא. המנוי הוא על מייקי. הכסף שמוציאים על מודעות משולם ישירות למטא, מחשבון המודעות שלך." },
  { q: "מה צריך כדי להתחיל?", a: "עמוד עסקי בפייסבוק, חשבון אינסטגרם עסקי וחשבון מודעות במטא. החיבור לוקח כמה דקות, ואם צריך עזרה קובעים פגישת היכרות." },
  { q: "מה ההבדל בין המסלולים?", a: "בשניהם יש את כל היכולות. במסלול פלוס יש יותר אחסון ופי 2.5 יותר שימוש ב-AI, למי שנותן למייקי הרבה עבודה." },
  {
    q: "מה כולל הליווי האישי?",
    a: `פגישת הקמה שבה מחברים את הכול ומגדירים יעדים, ואחריה שיחות קבועות על התוצאות, האסטרטגיה והצעדים הבאים. בליווי החודשי שיחה של ${GUIDANCE.monthly.callMinutes} דקות בחודש (₪${GUIDANCE.monthly.priceIls}), בליווי השבועי ${GUIDANCE.weekly.callsPerMonth} שיחות של ${GUIDANCE.weekly.callMinutes} דקות בחודש (₪${GUIDANCE.weekly.priceIls}). בין השיחות עונים לשאלות בכתב.`,
  },
];

function Title({ top, blue }: { top: string; blue: string }) {
  return (
    <h2 className="h-title">
      {top}
      <span>{blue}</span>
    </h2>
  );
}

export default function SiteHome() {
  const meeting = sitePath("/meeting");
  const plans = PLANS();
  const PRICES = [
    { id: "ai_299", ...plans.ai_299, extra: "שימוש ב-AI לעבודה שוטפת", note: "לעסק שמתחיל לשווק באופן קבוע", featured: false },
    { id: "ai_499", ...plans.ai_499, extra: "פי 2.5 יותר שימוש ב-AI", note: "למי שנותן למייקי הרבה עבודה", featured: true },
  ];

  return (
    <main className="h-root">
      {/* Hero */}
      <section className="h-wrap h-hero">
        <div className="h-hero-copy">
          <p className="h-kicker">מנהל השיווק שלך, ב-AI</p>
          <h1 className="h-h1">
            העסק שלך משווק
            <span>את עצמו</span>
          </h1>
          <p className="h-lead">מייקי מנהל את השיווק הדיגיטלי של העסק בצ׳אט אחד: קמפיינים במטא, תוכן, וידאו, סושיאל ושיחות עם לקוחות. אתה מספר מה צריך, הוא עושה, ושום דבר לא יוצא בלי האישור שלך.</p>
          <div className="h-ctas">
            <a href={appPath("/signup")} className="h-btn h-btn-dark">
              להתחיל עם מייקי
              <ArrowLeft size={18} strokeWidth={1.8} />
            </a>
            <Link href={meeting} className="h-btn h-btn-light">
              לקבוע פגישת היכרות
            </Link>
          </div>
          <p className="h-trust">
            <ShieldCheck size={18} strokeWidth={1.6} />
            כל הוצאה וכל פרסום מגיעים אליך לאישור. התקציב שקבעת הוא תקרה.
          </p>
        </div>
        <div className="h-hero-art">
          <div className="h-hero-glow" />
          <PhoneChat />
          <div className="h-hero-mikee">
            <Scene size={170} greet />
          </div>
        </div>
      </section>

      {/* Where Mikee works */}
      <section className="h-logos" aria-label="איפה מייקי עובד">
        <p className="h-logos-title">מייקי עובד בשבילך בתוך</p>
        <div className="h-marquee">
          <div className="h-marquee-track">
            {[...CHANNELS, ...CHANNELS].map((c, i) => (
              <span key={i} className="h-logo" aria-hidden={i >= CHANNELS.length}>
                <i style={{ background: c.tile }}>{c.glyph}</i>
                {c.name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Facts */}
      <section className="h-wrap">
        <div className="h-stats" data-reveal>
          <div>
            <b className="h-num">6</b>
            <span>מומחים בצוות של מייקי</span>
          </div>
          <div>
            <b className="h-num">2 דק׳</b>
            <span>לפתיחת חשבון</span>
          </div>
          <div>
            <b className="h-num">100%</b>
            <span>מהפרסומים באישור שלך</span>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="h-wrap h-sec">
        <header className="h-head" data-reveal>
          <p className="h-kicker">איך זה עובד</p>
          <Title top="שלושה צעדים" blue="לשיווק שעובד לבד" />
        </header>
        <div className="h-steps">
          <article className="h-step" data-reveal>
            <div className="h-stage h-tint-blue">
              <div className="h-ring" />
              <Scene size={150} look="ice_blue" />
              <span className="h-chip h-c1"><Check size={15} strokeWidth={2} />עמוד פייסבוק</span>
              <span className="h-chip h-c2"><Check size={15} strokeWidth={2} />אינסטגרם עסקי</span>
              <span className="h-chip h-c3"><Check size={15} strokeWidth={2} />חשבון מודעות</span>
              <span className="h-chip h-c4"><Check size={15} strokeWidth={2} />האתר שלך</span>
            </div>
            <span className="h-step-n">1</span>
            <h3>מחברים את העסק</h3>
            <p>פותחים חשבון ומחברים את העמודים וחשבון המודעות. מייקי לומד את העסק מהאתר, מהפוסטים ומהקמפיינים.</p>
          </article>
          <article className="h-step" data-reveal>
            <div className="h-stage h-tint-green">
              <div className="h-ring" />
              <span className="h-note h-n-top">
                <MikeeAvatar size={26} animate={false} />
                <span>
                  <small>מייקי</small>
                  הכנתי לך קמפיין לסוף השבוע
                </span>
              </span>
              <Scene size={150} look="silver_titanium" state="talking" />
              <span className="h-note h-n-bottom">
                <b>פניות מהשכונה</b>
                <em>₪60 ליום · 5 ק״מ</em>
              </span>
            </div>
            <span className="h-step-n">2</span>
            <h3>מספרים מה צריך</h3>
            <p>בעברית פשוטה, כמו לאיש שיווק: יותר פניות, פוסט לחג, סרטון לסטורי. מייקי והצוות שלו מכינים הכול.</p>
          </article>
          <article className="h-step" data-reveal>
            <div className="h-stage h-tint-violet">
              <div className="h-ring" />
              <span className="h-chip h-c5"><Sparkles size={15} strokeWidth={1.8} />הקמפיין באוויר</span>
              <Scene size={160} look="black_titanium" />
              <span className="h-chip h-c6"><BellRing size={15} strokeWidth={1.8} />12 פניות ראשונות</span>
            </div>
            <span className="h-step-n">3</span>
            <h3>מאשרים, ומייקי מבצע</h3>
            <p>כל הוצאה וכל פרסום מגיעים אליך ככרטיס. מאשרים בלחיצה, ומייקי מעלה, עוקב ומדווח מה עבד.</p>
          </article>
        </div>
      </section>

      {/* Inside Mikee */}
      <section id="what" className="h-wrap h-sec">
        <header className="h-head" data-reveal>
          <p className="h-kicker">בתוך מייקי</p>
          <Title top="צ׳אט אחד." blue="צוות שיווק שלם." />
        </header>
        <div className="h-inside">
          <div className="h-chat" data-reveal>
            <div className="h-chat-head">
              <MikeeAvatar size={30} animate={false} />
              <b>מייקי</b>
            </div>
            <p className="h-msg h-msg-you">פוסט לסוף השבוע על ארוחות הבוקר</p>
            <p className="h-msg">הכנתי שתי גרסאות. איזו מדברת אליך יותר?</p>
            <div className="h-chat-cards">
              {[
                ["/site/cafe.jpg", "גרסה א", "שישי בבוקר, שולחן ליד החלון"],
                ["/site/warehouse.jpg", "גרסה ב", "לחם מהתנור, קפה שמחכה לך"],
              ].map(([src, v, t]) => (
                <figure key={v} className="h-chat-card">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" width={220} height={150} loading="lazy" />
                  <figcaption>
                    <b>{v}</b>
                    <span>{t}</span>
                    <em><Wand2 size={13} strokeWidth={1.8} />לתזמן לחמישי 19:00</em>
                  </figcaption>
                </figure>
              ))}
            </div>
            <div className="h-composer">
              <span className="h-composer-btn">+</span>
              <TypingLine text="ומה עבד בחודש שעבר?" />
              <span className="h-composer-send"><ArrowLeft size={18} strokeWidth={2} /></span>
            </div>
            <div className="h-chat-mikee">
              <Scene size={120} look="deep_burgundy" />
            </div>
          </div>
          <ul className="h-points">
            <li data-reveal>
              <span className="h-ico"><MessageCircle {...ICON} /></span>
              <div>
                <h3>מדברים כמו עם איש שיווק</h3>
                <p>״צריך יותר פניות לפני החגים״. מייקי מבין, שואל רק מה שחסר, ומציע תוכנית.</p>
              </div>
            </li>
            <li data-reveal>
              <span className="h-ico"><Store {...ICON} /></span>
              <div>
                <h3>מכיר את העסק שלך</h3>
                <p>לומד מהאתר, מהמוצרים, מהפוסטים ומהתוצאות, ומשתפר מכל תיקון שלך.</p>
              </div>
            </li>
            <li data-reveal>
              <span className="h-ico"><ShieldCheck {...ICON} /></span>
              <div>
                <h3>לחיצה אחת לאישור</h3>
                <p>כל דבר שעולה לאוויר או עולה כסף מגיע ככרטיס. מאשרים, משנים או מוותרים.</p>
              </div>
            </li>
          </ul>
        </div>
      </section>

      {/* Everything included */}
      <section className="h-white h-sec-pad">
        <div className="h-wrap">
          <header className="h-head" data-reveal>
            <p className="h-kicker">הכול כלול</p>
            <Title top="מייקי אחד." blue="כל השיווק של העסק." />
          </header>
          <div className="h-bento">
            <article className="h-box h-box-wide" data-reveal>
              <div className="h-box-copy">
                <h3>קמפיינים במטא</h3>
                <p>בונה, מעלה ומנהל קמפיינים בפייסבוק ובאינסטגרם, ומזיז את התקציב למה שמביא תוצאות.</p>
              </div>
              <div className="h-box-ui">
                <p className="h-box-ui-title"><Megaphone size={16} strokeWidth={1.8} />חלוקת התקציב השבוע</p>
                {[
                  ["סרטון בסטורי", "₪310", "62%"],
                  ["תמונה בפיד", "₪130", "26%"],
                  ["ריטרגטינג", "₪60", "12%"],
                ].map(([n, v, w]) => (
                  <div key={n} className="h-bar">
                    <i style={{ width: w }} />
                    <span>{n}</span>
                    <b>{v}</b>
                  </div>
                ))}
              </div>
              <div className="h-box-mikee">
                <Scene size={130} look="ice_blue" />
              </div>
            </article>
            <article className="h-box" data-reveal>
              <div className="h-box-copy">
                <h3>תמונות וסרטונים</h3>
                <p>יוצר תמונות למודעות ולפוסטים, בסגנון ובצבעים של העסק.</p>
              </div>
              <figure className="h-box-photo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/site/cafe.jpg" alt="בית קפה, דוגמה לתמונה למודעה" width={400} height={260} loading="lazy" />
                <span className="h-chip h-chip-on"><ImagePlus size={15} strokeWidth={1.8} />מוכן למודעה</span>
              </figure>
            </article>
            <article className="h-box" data-reveal>
              <div className="h-box-copy">
                <h3>עריכת וידאו</h3>
                <p>חותך, מוסיף כתוביות בעברית ומתאים כל סרטון לסטורי, לריל או לפיד.</p>
              </div>
              <figure className="h-box-story">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/site/warehouse.jpg" alt="מחסן, דוגמה לסרטון" width={180} height={320} loading="lazy" />
                <span>ככה יוצא אצלנו משלוח לפני 9</span>
              </figure>
            </article>
            <article className="h-box" data-reveal>
              <div className="h-box-copy">
                <h3>סושיאל ותזמון</h3>
                <p>פוסטים וסטוריז בשעות שבהן העוקבים שלך ערים, בלי לזכור כלום.</p>
              </div>
              <ul className="h-sched">
                <li><CalendarClock size={15} strokeWidth={1.8} /><b>ראשון 10:00</b>פוסט: מה חדש</li>
                <li><CalendarClock size={15} strokeWidth={1.8} /><b>שלישי 20:00</b>סטורי עם סקר</li>
                <li><CalendarClock size={15} strokeWidth={1.8} /><b>חמישי 19:00</b>פוסט לסוף השבוע</li>
              </ul>
            </article>
            <article className="h-box" data-reveal>
              <div className="h-box-copy">
                <h3>הודעות באינסטגרם</h3>
                <p>עונה מיד על שעות, כתובת וטלפון, רק ממידע שאישרת. כל השאר מחכה לך.</p>
              </div>
              <div className="h-dm">
                <p className="h-msg h-msg-you">עד מתי אתם פתוחים היום?</p>
                <p className="h-msg">היום עד 19:00, ובשישי עד 14:00. מחכים לך.</p>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* Always on */}
      <section className="h-gray h-sec-pad">
        <div className="h-wrap h-split">
          <div className="h-split-art" data-reveal>
            <div className="h-cloud" />
            <span className="h-note h-n-float">
              <MikeeAvatar size={26} animate={false} />
              <span>
                <small>מייקי</small>
                הסרטון מביא פניות בחצי מחיר. להעביר אליו תקציב?
              </span>
            </span>
            <Scene size={260} look="ice_blue" state="thinking" />
          </div>
          <div className="h-split-copy" data-reveal>
            <p className="h-kicker">תמיד עובד</p>
            <h2 className="h-title h-title-start">
              מייקי עובד
              <span>גם כשאתה ישן</span>
            </h2>
            <p className="h-lead">כל יום הוא עובר על התוצאות, שומר על קצב התקציב ובודק מה מוכר. כשיש סיבה אמיתית, הוא מגיע עם המלצה אחת ברורה וכרטיס מוכן לאישור.</p>
          </div>
        </div>
      </section>

      {/* The old way */}
      <section className="h-white h-sec-pad">
        <div className="h-wrap">
          <header className="h-head" data-reveal>
            <Title top="הדרך הישנה" blue="מול הדרך של מייקי" />
          </header>
          <div className="h-vs">
            <div className="h-vs-old" data-reveal>
              <h3>בלי מייקי</h3>
              <ul>
                {["ריטיינר חודשי לסוכנות או לפרילנסר", "לחכות ימים לכל שינוי קטן", "לא ברור על מה הלך הכסף", "פוסטים רק כשנזכרים", "הודעות שמחכות עד הערב"].map((t) => (
                  <li key={t}><X size={17} strokeWidth={2} />{t}</li>
                ))}
              </ul>
            </div>
            <div className="h-vs-new" data-reveal>
              <h3>
                <MikeeAvatar size={28} animate={false} />
                עם מייקי
              </h3>
              <ul>
                {["צוות שלם במנוי חודשי קבוע", "שינוי בהודעה אחת, תוך דקות", "כל שקל עובר דרך האישור שלך", "תוכן מתוזמן כל שבוע", "מענה מיד על השאלות הנפוצות"].map((t) => (
                  <li key={t}><Check size={17} strokeWidth={2} />{t}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Why now */}
      <section className="h-wrap h-sec">
        <header className="h-head" data-reveal>
          <p className="h-kicker">למה עכשיו</p>
          <Title top="השיווק עובר" blue="ל-AI" />
        </header>
        <div className="h-quotes">
          {QUOTES.map((q) => (
            <figure key={q.who} className="h-quote" data-reveal>
              <blockquote>״{q.text}״</blockquote>
              <figcaption>
                <b>{q.who}</b>
                <span>{q.role}</span>
                <a href={q.href} target="_blank" rel="noopener noreferrer">למקור</a>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="h-wrap h-sec">
        <header className="h-head" data-reveal>
          <p className="h-kicker">מחירים</p>
          <Title top="כל היכולות בכל מסלול." blue="בלי הפתעות." />
        </header>
        <div className="h-prices">
          {PRICES.map((p) => (
            <article key={p.id} className={`h-price ${p.featured ? "is-featured" : ""}`} data-reveal>
              {p.featured && <span className="h-price-badge">הכי משתלם</span>}
              <h3>{p.name}</h3>
              <p className="h-price-note">{p.note}</p>
              <p className="h-price-num">
                <b className="h-num">₪{p.priceIls}</b>
                <span>לחודש</span>
              </p>
              <ul>
                {[...FEATURES, `${p.storageGb}GB אחסון`, p.extra].map((f) => (
                  <li key={f}><Check size={17} strokeWidth={2} />{f}</li>
                ))}
              </ul>
              <a href={appPath(`/signup?plan=${p.id}`)} className={`h-btn ${p.featured ? "h-btn-blue" : "h-btn-dark"} h-btn-full`}>
                להתחיל עם {p.name}
              </a>
            </article>
          ))}
        </div>
        <div className="h-addon" data-reveal>
          <span className="h-ico"><MessagesSquare {...ICON} /></span>
          <div>
            <h3>רוצה גם ליווי אישי?</h3>
            <p>
              תוספת לכל מסלול: ליווי חודשי ב־₪{GUIDANCE.monthly.priceIls} (שיחה של {GUIDANCE.monthly.callMinutes} דקות) או ליווי שבועי ב־₪{GUIDANCE.weekly.priceIls} ({GUIDANCE.weekly.callsPerMonth} שיחות של {GUIDANCE.weekly.callMinutes} דקות בחודש), עם מענה בכתב בין השיחות.
            </p>
          </div>
          <Link href={meeting} className="h-btn h-btn-light">לקבוע פגישת היכרות</Link>
        </div>
        <p className="h-fine">תקציב המודעות עצמו משולם ישירות למטא, מחשבון המודעות שלך, ואינו כלול במחיר המנוי.</p>
      </section>

      {/* FAQ */}
      <section id="faq" className="h-wrap h-sec h-faq-wrap">
        <header className="h-head" data-reveal>
          <p className="h-kicker">שאלות נפוצות</p>
          <Title top="יש שאלות?" blue="יש תשובות." />
        </header>
        <div className="h-faq">
          {FAQ.map((f) => (
            <details key={f.q} data-reveal>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final */}
      <section className="h-final">
        <div className="h-final-mikee" data-reveal>
          <div className="h-final-check">
            <Check size={120} strokeWidth={3} />
          </div>
          <Scene size={150} look="silver_titanium" />
        </div>
        <h2 data-reveal>
          השיווק של העסק
          <br />
          קרוב יותר ממה שנדמה
        </h2>
        <p data-reveal>פותחים חשבון בשתי דקות, ומייקי מתחיל ללמוד את העסק עוד באותו יום.</p>
        <div className="h-ctas h-ctas-center" data-reveal>
          <a href={appPath("/signup")} className="h-btn h-btn-white">
            להתחיל עם מייקי
            <ArrowLeft size={18} strokeWidth={1.8} />
          </a>
          <Link href={meeting} className="h-btn h-btn-ghost">לקבוע פגישת היכרות</Link>
        </div>
      </section>
      <Reveal />
    </main>
  );
}
