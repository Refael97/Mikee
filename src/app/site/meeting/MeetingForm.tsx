"use client";

import { useState } from "react";
import { MikeeAvatar } from "@/components/MikeeAvatar";

type Day = { date: string; label: string; slots: string[] };

/** Pick a day, then an hour, then leave details. The server checks the hour again before saving. */
export function MeetingForm({ days }: { days: Day[] }) {
  const [day, setDay] = useState(days[0]?.date ?? "");
  const [slot, setSlot] = useState("");
  const [plan, setPlan] = useState<"ai_299" | "ai_499">("ai_499");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const current = days.find((d) => d.date === day);

  if (!days.length) {
    return <p className="s-sub">אין כרגע שעות פנויות בשבועיים הקרובים. בכל יום נפתחות שעות חדשות, אז שווה לבדוק שוב מחר.</p>;
  }

  if (done) {
    return (
      <div className="s-done card">
        <MikeeAvatar size={72} greet />
        <h2 className="s-h2">הפגישה נרשמה</h2>
        <p className="s-sub">שמרנו לכם את {done}. נחזור אליכם בטלפון או בוואטסאפ לאישור, ונשלח קישור לזום.</p>
      </div>
    );
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!slot) return setError("בחרו שעה לפגישה.");
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/site/meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: f.get("name"),
          business: f.get("business"),
          phone: f.get("phone"),
          email: f.get("email"),
          link: f.get("link") || "",
          notes: f.get("notes") || "",
          plan,
          slot,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(out.error === "Invalid request" ? "בדקו שכל הפרטים מולאו נכון: שם, עסק, טלפון ומייל." : out.error || "משהו השתבש. נסו שוב בעוד רגע.");
        if (res.status === 409) setSlot("");
        return;
      }
      setDone(out.label);
    } catch {
      setError("אין חיבור. בדקו את האינטרנט ונסו שוב.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="s-book card" onSubmit={submit} noValidate>
      <fieldset className="s-fs">
        <legend>מתי נוח לכם?</legend>
        <div className="s-days" role="radiogroup" aria-label="יום">
          {days.map((d) => (
            <button key={d.date} type="button" role="radio" aria-checked={d.date === day} className="s-chip" onClick={() => { setDay(d.date); setSlot(""); }}>
              {d.label}
            </button>
          ))}
        </div>
        <div className="s-slots" role="radiogroup" aria-label="שעה">
          {current?.slots.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={s === slot} className="s-chip s-num" onClick={() => setSlot(s)}>
              {s.slice(11)}
            </button>
          ))}
        </div>
        <p className="s-hint">שעון ישראל. הפגישה בזום, כחצי שעה.</p>
      </fieldset>

      <fieldset className="s-fs">
        <legend>באיזה מסלול אתם חושבים להתחיל?</legend>
        <div className="s-days" role="radiogroup" aria-label="מסלול">
          {([["ai_299", "מייקי AI · ₪299"], ["ai_499", "מייקי AI פלוס · ₪499"]] as const).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={plan === id} className="s-chip" onClick={() => setPlan(id)}>
              {label}
            </button>
          ))}
        </div>
        <p className="s-hint">ובנוסף ליווי אישי, ₪400 לחודש. אפשר להחליט סופית בפגישה.</p>
      </fieldset>

      <fieldset className="s-fs s-fields">
        <legend>פרטים</legend>
        <label>שם מלא<input className="field" id="name" name="name" required minLength={2} maxLength={80} autoComplete="name" /></label>
        <label>שם העסק<input className="field" id="business" name="business" required minLength={2} maxLength={120} autoComplete="organization" /></label>
        <label>טלפון<input className="field" id="phone" name="phone" required inputMode="tel" autoComplete="tel" dir="ltr" /></label>
        <label>מייל<input className="field" id="email" name="email" type="email" required autoComplete="email" dir="ltr" /></label>
        <label className="s-wide">אתר או אינסטגרם של העסק <span className="s-opt">לא חובה</span><input className="field" id="link" name="link" maxLength={300} dir="ltr" /></label>
        <label className="s-wide">מה הכי חשוב לכם לשפר? <span className="s-opt">לא חובה</span><textarea className="field s-textarea" id="notes" name="notes" maxLength={1500} rows={3} /></label>
      </fieldset>

      {error && <p className="s-error" role="alert">{error}</p>}
      <div className="s-book-end">
        <button type="submit" className="btn btn-primary s-btn-lg" disabled={busy}>
          {busy ? "קובעים…" : slot ? `לקבוע ל${current?.label} בשעה ${slot.slice(11)}` : "לקבוע פגישה"}
        </button>
      </div>
    </form>
  );
}
