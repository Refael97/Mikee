"use client";

import { useEffect, useRef, useState } from "react";
import { cueMikee, MikeeAvatar, type MikeeState } from "@/components/MikeeAvatar";
import { MIKEE_LOOKS, type MikeeLook } from "@/lib/mikee-look";

const SWATCH: Record<MikeeLook, string> = {
  ice_blue: "#9fcbe0",
  silver_titanium: "#cfd2d6",
  black_titanium: "#2b2c2f",
  deep_burgundy: "#6b2c3a",
};

/* ---------------------------------------------------------------------------------------------------------
 * Section entrances. Content is visible without script; with it, the parts of each section rise in order
 * as the section enters. Anything already on screen when the page opens is left as it is.
 * ------------------------------------------------------------------------------------------------------- */
export function Reveal() {
  useEffect(() => {
    const root = document.querySelector(".s-root");
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const items = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const below = items.filter((el) => el.getBoundingClientRect().top > window.innerHeight * 0.92);
    below.forEach((el) => el.classList.add("is-waiting"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.remove("is-waiting");
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    below.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}

/* ---------------------------------------------------------------------------------------------------------
 * The hero: the sentence with Mikee inside it, and three working controls from the product floating on it.
 * ------------------------------------------------------------------------------------------------------- */
export function HeroSentence() {
  const [look, setLook] = useState<MikeeLook>("ice_blue");
  const [cap, setCap] = useState(3000);
  const [approval, setApproval] = useState(true);
  const [bounce, setBounce] = useState(false);
  const name = MIKEE_LOOKS.find((l) => l.id === look)?.name;

  // The approval switch cannot stay off: it springs back, which is the point.
  const flip = () => {
    setApproval(false);
    setBounce(true);
    setTimeout(() => setApproval(true), 900);
    setTimeout(() => setBounce(false), 2600);
  };

  return (
    <div className="s-hero-stage">
      <h1 className="s-hero-h1" aria-label="העסק שלך משווק את עצמו.">
        <span className="s-mask" aria-hidden>
          <span className="s-line">
            העסק שלך
            <span className="s-slot">
              <MikeeAvatar size={160} look={look} greet className="s-slot-mikee" />
              <span className="s-dots">
                <i />
                <i />
                <i />
              </span>
            </span>
          </span>
        </span>
        <span className="s-mask" aria-hidden>
          <span className="s-line s-line-2">משווק את עצמו.</span>
        </span>
      </h1>

      <div className="s-ctl s-ctl-look" data-ui>
        <span className="s-ctl-label">המראה של מייקי</span>
        <span className="s-ctl-row" role="radiogroup" aria-label="המראה של מייקי">
          {MIKEE_LOOKS.map((l) => (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={l.id === look}
              aria-label={l.name}
              className="s-swatch"
              style={{ ["--sw" as string]: SWATCH[l.id] }}
              onClick={() => setLook(l.id)}
            />
          ))}
        </span>
        <span className="s-ctl-read">{name}</span>
      </div>

      <div className="s-ctl s-ctl-cap" data-ui>
        <label className="s-ctl-label" htmlFor="hero-cap">
          תקרת תקציב לחודש
        </label>
        <span className="s-ctl-read s-num">₪{cap.toLocaleString("he-IL")}</span>
        <input id="hero-cap" type="range" min={500} max={20000} step={500} value={cap} onChange={(e) => setCap(Number(e.target.value))} className="s-range" />
        <span className="s-ctl-note">מייקי לא יעבור אותה</span>
      </div>

      <div className={`s-ctl s-ctl-switch ${bounce ? "is-bounce" : ""}`} data-ui>
        <span className="s-ctl-label">אישור שלך לפני כל פרסום</span>
        <button type="button" role="switch" aria-checked={approval} className="s-switch" onClick={flip} aria-label="אישור לפני כל פרסום">
          <i />
        </button>
        <span className="s-ctl-note" aria-live="polite">
          {bounce ? "את זה אי אפשר לכבות" : "תמיד דלוק"}
        </span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------------------
 * The live thing: the visitor writes to Mikee and gets back the card he would prepare, ready to approve.
 * Everything is sample content, labelled as such; nothing is sent anywhere.
 * ------------------------------------------------------------------------------------------------------- */
type Kind = "leads" | "post" | "video" | "report" | "plan";

const EXAMPLES = ["צריך יותר פניות החודש", "פוסט לחג על הקולקציה החדשה", "סרטון קצר לסטורי", "מה עבד בחודש שעבר?"];

function kindOf(text: string): Kind {
  if (/(פני|ליד|לקוחות חדש|טלפונ|הרשמ)/.test(text)) return "leads";
  if (/(סרטון|וידאו|סטורי|ריל|רילס)/.test(text)) return "video";
  if (/(עבד|תוצאות|דוח|חודש שעבר|כמה הבאנו|ביצועים)/.test(text)) return "report";
  if (/(פוסט|חג|קולקציה|השקה|מבצע|הנחה)/.test(text)) return "post";
  return "plan";
}

const REPLY: Record<Kind, string> = {
  leads: "הכנתי קמפיין לידים עם שתי גרסאות למודעה וטופס קצר. התקציב נשאר מתחת לתקרה.",
  post: "כתבתי פוסט והכנתי תמונה בסגנון של העסק. מתוזמן לחמישי בערב, כשהעוקבים שלך הכי פעילים.",
  video: "ערכתי סטורי של 15 שניות עם כתוביות בעברית, בגודל של אינסטגרם.",
  report: "עברתי על החודש: הסרטונים הביאו פניות בחצי מחיר מהתמונות. כדאי להעביר אליהם יותר מהתקציב.",
  plan: "בניתי תוכנית לשבוע: שני פוסטים, סטורי אחד וקמפיין קטן. הכול מחכה לאישור שלך.",
};

function ProposalCard({ kind, approved, onApprove }: { kind: Kind; approved: boolean; onApprove: () => void }) {
  const head: Record<Kind, [string, string]> = {
    leads: ["קמפיין · פייסבוק ואינסטגרם", "פניות מתושבי האזור"],
    post: ["פוסט · אינסטגרם ופייסבוק", "הקולקציה החדשה לחג"],
    video: ["סטורי · אינסטגרם", "15 שניות מאחורי הקלעים"],
    report: ["סיכום חודש · דוגמה", "מה הביא פניות בספטמבר"],
    plan: ["תוכנית לשבוע", "שלושה פרסומים וקמפיין אחד"],
  };
  const action: Record<Kind, [string, string]> = {
    leads: ["אשר והעלה לאוויר · ₪60 ליום", "הקמפיין באוויר"],
    post: ["אשר ותזמן לחמישי 19:00", "מתוזמן לחמישי 19:00"],
    video: ["אשר ופרסם בסטורי", "הסטורי עלה"],
    report: ["להעביר תקציב לסרטונים", "התקציב עבר לסרטונים"],
    plan: ["אשר את התוכנית", "התוכנית אושרה"],
  };
  const [kicker, title] = head[kind];
  return (
    <article className={`s-card ${approved ? "is-live" : ""}`} data-ui>
      <header className="s-card-head">
        <span className="s-card-kind">{kicker}</span>
        <span className={`s-status ${approved ? "s-status-live" : ""}`}>
          <i />
          {approved ? "באוויר" : "ממתין לאישור שלך"}
        </span>
      </header>
      <p className="s-card-title">{title}</p>

      {kind === "leads" && (
        <>
          <div className="s-ads">
            {[
              ["/site/cafe.jpg", "גרסה א", "שולחן פנוי בשישי בבוקר?"],
              ["/site/warehouse.jpg", "גרסה ב", "הזמנה עד הדלת תוך יום"],
            ].map(([src, v, t]) => (
              <figure key={v} className="s-ad">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" width={240} height={300} loading="lazy" />
                <figcaption>
                  <b>{v}</b>
                  {t}
                </figcaption>
              </figure>
            ))}
          </div>
          <dl className="s-facts">
            <div><dt>קהל</dt><dd>גרים עד 15 ק״מ מהעסק</dd></div>
            <div><dt>טופס</dt><dd>שם וטלפון, בלי לצאת מאינסטגרם</dd></div>
            <div><dt>תקציב</dt><dd className="s-num">₪60 ליום, עד ₪1,800 בחודש</dd></div>
          </dl>
        </>
      )}

      {kind === "post" && (
        <div className="s-post">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/site/cafe.jpg" alt="" width={320} height={320} loading="lazy" />
          <p>הקולקציה לחג כבר כאן. שמלות ערב בבדים שנעים ללבוש כל הערב, במידות 36 עד 48. מחכות לך בחנות ובאתר.</p>
        </div>
      )}

      {kind === "video" && (
        <div className="s-story">
          <div className="s-story-frame">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/site/warehouse.jpg" alt="" width={180} height={320} loading="lazy" />
            <span className="s-story-cap">ככה נראה משלוח שיוצא אצלנו לפני 9 בבוקר</span>
          </div>
          <dl className="s-facts">
            <div><dt>אורך</dt><dd className="s-num">0:15</dd></div>
            <div><dt>כתוביות</dt><dd>עברית, מתוזמנות לדיבור</dd></div>
            <div><dt>מוזיקה</dt><dd>רקע בלי זכויות יוצרים</dd></div>
          </dl>
        </div>
      )}

      {kind === "report" && (
        <dl className="s-figs">
          <div><dt>פניות בחודש</dt><dd className="s-num">37</dd></div>
          <div><dt>עלות לפנייה מסרטון</dt><dd className="s-num">₪18.40</dd></div>
          <div><dt>עלות לפנייה מתמונה</dt><dd className="s-num">₪35.10</dd></div>
        </dl>
      )}

      {kind === "plan" && (
        <ul className="s-plan">
          <li><b>ראשון 10:00</b> פוסט: מה חדש השבוע</li>
          <li><b>שלישי 20:00</b> סטורי עם סקר קצר</li>
          <li><b>חמישי 19:00</b> פוסט לסוף השבוע</li>
          <li><b className="s-num">₪40 ליום</b> קמפיין קטן לאותו פוסט</li>
        </ul>
      )}

      <button type="button" className={`s-approve ${approved ? "is-done" : ""}`} onClick={onApprove} disabled={approved}>
        {approved ? action[kind][1] : action[kind][0]}
      </button>
    </article>
  );
}

export function AskMikee() {
  const [text, setText] = useState(EXAMPLES[0]);
  const [shown, setShown] = useState<{ text: string; kind: Kind }>({ text: EXAMPLES[0], kind: "leads" });
  const [state, setState] = useState<MikeeState>("idle");
  const [approved, setApproved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mikee reads as the visitor types, thinks for a moment once they pause, then answers.
  useEffect(() => {
    const t = text.trim();
    if (!t || t === shown.text) return;
    setState("listening");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setState("thinking");
      timer.current = setTimeout(() => {
        setShown({ text: t, kind: kindOf(t) });
        setApproved(false);
        setState("talking");
        timer.current = setTimeout(() => setState("idle"), 1400);
      }, 650);
    }, 550);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [text, shown.text]);

  const approve = () => {
    setApproved(true);
    cueMikee("celebrate");
  };

  return (
    <div className="s-ask">
      <label htmlFor="ask" className="s-ask-label">
        כתבו למייקי מה העסק צריך
      </label>
      <div className="s-ask-line" data-ui>
        <input id="ask" className="s-ask-input" value={text} maxLength={60} onChange={(e) => setText(e.target.value)} autoComplete="off" spellCheck={false} />
      </div>

      <div className="s-answer" aria-live="polite">
        <div className="s-answer-side">
        <div className="s-answer-who">
          <MikeeAvatar size={56} state={state} cues />
          <p className={`s-reply ${state === "thinking" || state === "listening" ? "is-thinking" : ""}`}>
            {state === "thinking" || state === "listening" ? (
              <span className="s-typing" aria-label="מייקי חושב">
                <i />
                <i />
                <i />
              </span>
            ) : (
              REPLY[shown.kind]
            )}
          </p>
        </div>
        <p className="s-try-more">או לנסות משהו אחר:</p>
        <div className="s-ask-examples">
          {EXAMPLES.map((e) => (
            <button key={e} type="button" className="s-example" onClick={() => setText(e)}>
              {e}
            </button>
          ))}
        </div>
        <p className="s-sample">דוגמה. במייקי האמיתי הכרטיס נבנה מהעסק, מהתוצאות ומהתקציב שלך.</p>
        </div>
        <ProposalCard key={shown.text} kind={shown.kind} approved={approved} onApprove={approve} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------------------
 * How it works: one slider drives the stage on both sides of the split.
 * ------------------------------------------------------------------------------------------------------- */
const STAGES = [
  { name: "מחברים", clause: "קודם מחברים את העסק" },
  { name: "מבקשים", clause: "אחר כך מספרים מה צריך" },
  { name: "מאשרים", clause: "ואז מאשרים בכרטיס אחד" },
  { name: "מודדים", clause: "ומשם מייקי מבצע ומדווח" },
];

function StageFragment({ i }: { i: number }) {
  if (i === 0)
    return (
      <div className="s-frag" data-ui>
        <p className="s-frag-title">החיבורים של העסק</p>
        <ul className="s-conn">
          {["עמוד פייסבוק", "אינסטגרם עסקי", "חשבון מודעות במטא", "האתר של העסק"].map((c) => (
            <li key={c}>
              <span>{c}</span>
              <b>מחובר</b>
            </li>
          ))}
        </ul>
        <p className="s-frag-note">החיבור לוקח כמה דקות. הגישה נשמרת מוצפנת.</p>
      </div>
    );
  if (i === 1)
    return (
      <div className="s-frag s-frag-chat" data-ui>
        <p className="s-bubble s-bubble-you">אפשר משהו לסוף השבוע? יש לנו מבצע על ארוחות בוקר</p>
        <div className="s-bubble-row">
          <MikeeAvatar size={34} animate={false} />
          <p className="s-bubble">בטח. אכין פוסט עם תמונה וקמפיין קטן לשכונה, ואשלח לך לאישור.</p>
        </div>
      </div>
    );
  if (i === 2)
    return (
      <div className="s-frag" data-ui>
        <div className="s-frag-row">
          <p className="s-frag-title">קמפיין · ארוחות בוקר בסוף השבוע</p>
          <span className="s-status">
            <i />
            ממתין לאישור שלך
          </span>
        </div>
        <dl className="s-facts">
          <div><dt>קהל</dt><dd>עד 5 ק״מ מבית הקפה</dd></div>
          <div><dt>מתי</dt><dd>חמישי עד שבת</dd></div>
          <div><dt>תקציב</dt><dd className="s-num">₪45 ליום, ₪135 בסך הכול</dd></div>
        </dl>
        <span className="s-approve s-approve-static">אשר והעלה לאוויר</span>
      </div>
    );
  return (
    <div className="s-frag" data-ui>
      <div className="s-frag-row">
        <p className="s-frag-title">סוף השבוע, בקצרה</p>
        <span className="s-status s-status-live">
          <i />
          הסתיים
        </span>
      </div>
      <dl className="s-figs s-figs-sm">
        <div><dt>אנשים שראו</dt><dd className="s-num">6,240</dd></div>
        <div><dt>הזמנות שולחן</dt><dd className="s-num">23</dd></div>
        <div><dt>עלות להזמנה</dt><dd className="s-num">₪5.90</dd></div>
      </dl>
      <p className="s-frag-note">ההצעה של מייקי: לחזור על זה בשבוע הבא, עם הסרטון במקום התמונה.</p>
    </div>
  );
}

export function Stages() {
  const [i, setI] = useState(0);
  return (
    <div className="s-stages">
      <div className="s-stages-copy">
        <h2 key={i} className="s-head s-swap">
          {STAGES[i].clause}
        </h2>
      </div>
      <div className="s-stages-ui">
        <div key={i} className="s-swap">
          <StageFragment i={i} />
        </div>
      </div>
      <div className="s-stages-bar">
        <div className="s-stage-track" style={{ ["--p" as string]: `${(i / 3) * 100}%` }}>
        <input
          type="range"
          min={0}
          max={3}
          step={1}
          value={i}
          onChange={(e) => setI(Number(e.target.value))}
          className="s-stage-range"
          aria-label="השלב"
          aria-valuetext={STAGES[i].name}
        />
        </div>
        <ol className="s-stage-names">
          {STAGES.map((s, n) => (
            <li key={s.name}>
              <button type="button" className={n <= i ? "is-on" : ""} onClick={() => setI(n)}>
                {s.name}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------------------
 * Where Mikee works, as one sentence; one name at a time is lit.
 * ------------------------------------------------------------------------------------------------------- */
export function NameSentence({ lead, names }: { lead: string; names: string[] }) {
  const [lit, setLit] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setLit((n) => (n + 1) % names.length), 2000);
    return () => clearInterval(t);
  }, [names.length]);
  return (
    <p className="s-names" data-reveal>
      <span className="s-names-lead">{lead} </span>
      {names.map((n, k) => (
        <span key={n} className={k === lit ? "is-lit" : ""}>
          {n}
          {k < names.length - 1 ? ", " : "."}{" "}
        </span>
      ))}
    </p>
  );
}

/* ---------------------------------------------------------------------------------------------------------
 * Pricing: the offer as one sentence; the price is an object in the line and changes with the plan.
 * ------------------------------------------------------------------------------------------------------- */
type Plan = { id: string; name: string; priceIls: number; storageGb: number; more: string };

export function PriceSentence({ plans, signup, guidance }: { plans: Plan[]; signup: Record<string, string>; guidance: { href: string; from: number; weekly: number } }) {
  const [id, setId] = useState(plans[0].id);
  const p = plans.find((x) => x.id === id) ?? plans[0];
  return (
    <div className="s-price">
      <div className="s-price-pick" role="radiogroup" aria-label="מסלול">
        {plans.map((x) => (
          <button key={x.id} type="button" role="radio" aria-checked={x.id === id} className="s-pick" onClick={() => setId(x.id)}>
            {x.name}
          </button>
        ))}
      </div>
      <h2 className="s-price-line">
        <span className="s-mask">
          <span className="s-line">מייקי על כל השיווק</span>
        </span>
        <span className="s-mask">
          <span className="s-line">
            ב<span key={p.id} className="s-price-tag s-num">₪{p.priceIls}</span> לחודש.
          </span>
        </span>
      </h2>
      <div className="s-price-foot">
        <p className="s-price-what">
          כל היכולות: קמפיינים במטא, תמונות וסרטונים, עריכת וידאו, סושיאל ותזמון, הודעות אינסטגרם וחיבור לאתר. {p.storageGb}GB אחסון ו{p.more}. תקציב המודעות עצמו משולם ישירות למטא.
        </p>
        <div className="s-price-act">
          <a href={signup[p.id]} className="s-btn s-btn-accent">
            להתחיל עם {p.name}
          </a>
          <a href={guidance.href} className="s-link">
            ליווי אישי, מ־₪{guidance.from} לחודש (או ₪{guidance.weekly} בשבועי)
          </a>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------------------
 * What the people who build these platforms say; one quote at a time, with its source.
 * ------------------------------------------------------------------------------------------------------- */
export function QuoteCycle({ quotes }: { quotes: { text: string; who: string; role: string; href: string }[] }) {
  const [k, setK] = useState(0);
  const q = quotes[k];
  return (
    <div className="s-quote">
      <figure key={k} className="s-swap">
        <blockquote>״{q.text}״</blockquote>
        <figcaption>
          <b>{q.who}</b>, {q.role}.{" "}
          <a href={q.href} target="_blank" rel="noopener noreferrer" className="s-link">
            למקור
          </a>
        </figcaption>
      </figure>
      <div className="s-quote-pick" role="tablist" aria-label="ציטוטים">
        {quotes.map((x, n) => (
          <button key={x.who} type="button" role="tab" aria-selected={n === k} className="s-pick" onClick={() => setK(n)}>
            {x.who}
          </button>
        ))}
      </div>
    </div>
  );
}
