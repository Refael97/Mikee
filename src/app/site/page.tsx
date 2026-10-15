import Link from "next/link";
import { MikeeAvatar } from "@/components/MikeeAvatar";
import { GUIDANCE, PLANS } from "@/lib/plans";
import { appPath, sitePath } from "./links";
import { AskMikee, HeroSentence, NameSentence, PriceSentence, QuoteCycle, Stages } from "./parts";

/*
 * mikee.co.il. The idea: Mikee is a speech bubble, so on this page he sits inside the sentence in place of a
 * word, and his approval card (the one thing every client sees) is the answer the visitor gets when they
 * write to him. Each section is a short statement with its evidence beside it.
 */

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

const FAQ = [
  { q: "צריך לדעת שיווק כדי לעבוד עם מייקי?", a: "לא. מספרים לו מה רוצים בשפה פשוטה, והוא מציע תוכנית, כותב, מעצב ומעלה. אתם רק מאשרים." },
  { q: "מי מחליט על ההוצאות?", a: "אתם. כל קמפיין, כל שינוי תקציב וכל פרסום מגיעים ככרטיס לאישור, ותקציב החודש שקבעתם הוא תקרה שמייקי לא חוצה." },
  { q: "תקציב המודעות כלול במחיר?", a: "לא. המנוי הוא על מייקי. הכסף שמוציאים על מודעות משולם ישירות למטא, מחשבון המודעות שלכם." },
  { q: "מה צריך כדי להתחיל?", a: "עמוד עסקי בפייסבוק, חשבון אינסטגרם עסקי וחשבון מודעות במטא. החיבור לוקח כמה דקות, ואם צריך עזרה, קובעים פגישת היכרות." },
  { q: "מה ההבדל בין המסלולים?", a: "בשניהם יש את כל היכולות. במסלול פלוס יש יותר אחסון ופי 2.5 יותר שימוש ב-AI, למי שנותן למייקי הרבה עבודה." },
  {
    q: "מה כולל הליווי האישי?",
    a: `פגישת הקמה שבה מחברים את הכול ומגדירים יעדים, ואחריה שיחות קבועות על התוצאות, האסטרטגיה והצעדים הבאים. בליווי החודשי שיחה של ${GUIDANCE.monthly.callMinutes} דקות בחודש (₪${GUIDANCE.monthly.priceIls}), בליווי השבועי ${GUIDANCE.weekly.callsPerMonth} שיחות של ${GUIDANCE.weekly.callMinutes} דקות בחודש (₪${GUIDANCE.weekly.priceIls}). בין השיחות עונים לשאלות בכתב.`,
  },
];

/** The team behind Mikee, each with a piece of its own work at the margin. */
function Team() {
  return (
    <div className="s-team">
      <article className="s-row" data-reveal>
        <div className="s-row-copy">
          <h3>קופירייטר</h3>
          <p>כותב מודעות, פוסטים וסטוריז בקול של העסק שלך. לומד ממה שאישרת וממה שתיקנת, ומתחשב בזה בפעם הבאה.</p>
        </div>
        <div className="s-row-art s-w-a" data-ui>
          <p className="s-copyline">שולחן פנוי בשישי בבוקר? שקשוקה, לחם מהתנור וקפה שמחכה לך.</p>
          <p className="s-copyline s-copyline-alt">שישי בבוקר אצלנו: לחם חם, שקשוקה ושולחן ליד החלון.</p>
          <span className="s-copytag">שתי גרסאות לבדיקה</span>
        </div>
      </article>

      <article className="s-row" data-reveal>
        <div className="s-row-copy">
          <h3>קניין מדיה</h3>
          <p>בונה קמפיינים בפייסבוק ובאינסטגרם, מגדיר קהלים ומזיז את התקציב למה שמביא תוצאות. אף פעם לא מעבר לתקרה שקבעת.</p>
        </div>
        <div className="s-row-art s-w-b" data-ui>
          <p className="s-frag-title">חלוקת התקציב השבוע</p>
          <ul className="s-split">
            <li style={{ ["--w" as string]: "62%" }}><span>סרטון בסטורי</span><b className="s-num">₪310</b></li>
            <li style={{ ["--w" as string]: "26%" }}><span>תמונה בפיד</span><b className="s-num">₪130</b></li>
            <li style={{ ["--w" as string]: "12%" }}><span>ריטרגטינג</span><b className="s-num">₪60</b></li>
          </ul>
        </div>
      </article>

      <article className="s-row" data-reveal>
        <div className="s-row-copy">
          <h3>קריאייטיב</h3>
          <p>יוצר תמונות למודעות ולפוסטים, בצבעים ובסגנון של העסק, או משדרג את התמונות שכבר יש לך.</p>
        </div>
        <figure className="s-row-art s-w-c s-photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/site/cafe.jpg" alt="בית קפה שכונתי, תמונה לדוגמה למודעה" width={480} height={600} loading="lazy" />
        </figure>
      </article>

      <article className="s-row" data-reveal>
        <div className="s-row-copy">
          <h3>עורך וידאו</h3>
          <p>חותך, מוסיף כתוביות בעברית ומתאים כל סרטון לרשת שבה הוא עולה: סטורי, ריל או פיד.</p>
        </div>
        <figure className="s-row-art s-w-d s-photo s-photo-tall">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/site/warehouse.jpg" alt="מחסן של עסק קטן, תמונה לדוגמה לסרטון" width={360} height={640} loading="lazy" />
          <figcaption className="s-story-cap">ככה נראה משלוח שיוצא אצלנו לפני 9</figcaption>
        </figure>
      </article>

      <article className="s-row" data-reveal>
        <div className="s-row-copy">
          <h3>מנהל סושיאל</h3>
          <p>מתזמן פוסטים וסטוריז לשעות שבהן העוקבים שלך ערים, ועונה מיד להודעות באינסטגרם על שעות, כתובת וטלפון.</p>
        </div>
        <div className="s-row-art s-w-b" data-ui>
          <p className="s-frag-title">השבוע בתזמון</p>
          <ul className="s-plan">
            <li><b>ראשון 10:00</b> פוסט: מה חדש</li>
            <li><b>שלישי 20:00</b> סטורי עם סקר</li>
            <li><b>חמישי 19:00</b> פוסט לסוף השבוע</li>
          </ul>
        </div>
      </article>

      <article className="s-row" data-reveal>
        <div className="s-row-copy">
          <h3>אנליסט</h3>
          <p>קורא את התוצאות כל יום ואומר בשורה אחת מה עבד, מה לא, ומה כדאי לשנות עכשיו.</p>
        </div>
        <div className="s-row-art s-w-a" data-ui>
          <div className="s-bubble-row">
            <MikeeAvatar size={34} animate={false} />
            <p className="s-bubble">בספטמבר הסרטונים הביאו פניות ב־₪18 לעומת ₪35 בתמונות. כדאי להעביר אליהם עוד תקציב.</p>
          </div>
        </div>
      </article>
    </div>
  );
}

export default function SiteHome() {
  const meeting = sitePath("/meeting");
  const plans = PLANS();
  const planList = [
    { id: "ai_299", ...plans.ai_299, more: "שימוש ב-AI לעבודה שוטפת" },
    { id: "ai_499", ...plans.ai_499, more: "פי 2.5 יותר שימוש ב-AI" },
  ];
  return (
    <main>
      {/* 1. The sentence, with Mikee in it */}
      <section className="s-hero">
        <HeroSentence />
        <div className="s-hero-foot">
          <p className="s-hero-lead">מייקי הוא מנהל השיווק של העסק, בצ׳אט. מספרים לו מה צריך, צוות שלם עושה את העבודה, ושום דבר לא יוצא בלי האישור שלך.</p>
          <div className="s-hero-act">
            <a href={appPath("/signup")} className="s-btn s-btn-accent">להתחיל עם מייקי</a>
            <Link href={meeting} className="s-link s-link-light">או לקבוע פגישת היכרות</Link>
          </div>
        </div>
      </section>

      {/* 2. The live thing: write to Mikee, get his card */}
      <section id="try" className="s-sec s-sky">
        <AskMikee />
      </section>

      {/* 3. The team behind him */}
      <section id="what" className="s-sec s-white">
        <h2 className="s-head s-team-head" data-reveal>מאחורי מייקי עובד צוות שלם.</h2>
        <p className="s-statement s-team-lead" data-reveal>אתם מדברים רק איתו. הוא מחלק את העבודה בין שישה מומחים, כל אחד עם ספר הדרכה שנכתב על העסק שלכם ומשתפר מכל תיקון שלכם.</p>
        <Team />
      </section>

      {/* 4. How it works, one slider */}
      <section id="how" className="s-sec-flush">
        <Stages />
      </section>

      {/* 5. Where he works */}
      <section className="s-sec s-sky">
        <NameSentence
          lead="מייקי עובד בשבילכם בתוך"
          names={["פייסבוק", "אינסטגרם", "סטוריז", "ריילס", "מנהל המודעות של מטא", "ההודעות באינסטגרם", "האתר שלכם", "החנות בשופיפיי", "גוגל דרייב", "ספריית התמונות והסרטונים שלכם"]}
        />
      </section>

      {/* 6. The approval rule, the reason to trust him */}
      <section className="s-sec s-navy s-rule">
        <div className="s-rule-copy" data-reveal>
          <h2 className="s-head">שום שקל לא יוצא בלי ״כן״ שלכם.</h2>
          <p className="s-statement">כל קמפיין, כל פרסום וכל שינוי תקציב מגיעים אליכם ככרטיס. התקציב החודשי שקבעתם הוא תקרה, ומייקי מסנכרן אותה גם לחשבון המודעות במטא.</p>
        </div>
        <div className="s-rule-cards" data-reveal aria-hidden>
          <div className="s-card s-card-float s-card-1" data-ui>
            <header className="s-card-head">
              <span className="s-card-kind">שינוי תקציב</span>
              <span className="s-status"><i />ממתין לאישור שלך</span>
            </header>
            <p className="s-card-title">להעלות את הסרטון ל־₪80 ליום</p>
            <span className="s-approve s-approve-static">אשר</span>
          </div>
          <div className="s-card s-card-float s-card-2" data-ui>
            <header className="s-card-head">
              <span className="s-card-kind">תקרה חודשית</span>
              <span className="s-status s-status-live"><i />מוגן</span>
            </header>
            <p className="s-card-title s-num">₪2,140 מתוך ₪3,000</p>
            <span className="s-meter"><i style={{ width: "71%" }} /></span>
          </div>
        </div>
      </section>

      {/* 7. Why now */}
      <section className="s-sec s-white">
        <h2 className="s-head" data-reveal>השיווק עובר ל-AI.</h2>
        <QuoteCycle quotes={QUOTES} />
      </section>

      {/* 8. Pricing */}
      <section id="pricing" className="s-sec s-sky">
        <PriceSentence
          plans={planList}
          signup={{ ai_299: appPath("/signup?plan=ai_299"), ai_499: appPath("/signup?plan=ai_499") }}
          guidance={{ href: meeting, from: GUIDANCE.monthly.priceIls, weekly: GUIDANCE.weekly.priceIls }}
        />
      </section>

      {/* 9. Questions */}
      <section id="faq" className="s-sec s-white s-faq">
        <h2 className="s-head" data-reveal>שאלות לפני שמתחילים</h2>
        <div className="s-faq-list">
          {FAQ.map((f) => (
            <details key={f.q} data-reveal>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* 10. The close: the sentence again, inverted */}
      <section className="s-close">
        <h2 className="s-close-h" data-reveal>
          השיווק שלכם
          <br />
          מחכה לאישור.
        </h2>
        <div className="s-close-foot" data-reveal>
          <p>פותחים חשבון בשתי דקות, מחברים את העמודים, ומייקי מתחיל ללמוד את העסק עוד באותו ערב.</p>
          <a href={appPath("/signup")} className="s-btn s-btn-accent">להתחיל עם מייקי</a>
        </div>
      </section>
    </main>
  );
}
