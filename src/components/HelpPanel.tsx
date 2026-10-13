"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { ChevronDown, Mail, MessageCircle, X } from "lucide-react";
import { sendSupport } from "@/lib/actions";

const FAQ: [string, string][] = [
  ["האם מייקי יכול להוציא כסף בלי לשאול אותי?", "לא. כל קמפיין, שינוי תקציב או פוסט מגיע אלייך ככרטיס, ושום דבר לא עולה לאוויר עד שאת מאשרת. התקציב החודשי שהגדרת הוא תקרה קשיחה."],
  ["איך מחברים את פייסבוק ואינסטגרם?", "בהגדרות וחיבורים, לוחצים על התחברות עם פייסבוק ובוחרים את הדף ואת חשבון המודעות. מייקי מזהה את העסק בעצמו ושואל אם זה הוא."],
  ["איפה התמונות והסרטונים שלי?", "בספרייה. אפשר להעלות קבצים, לגרור אותם או לייבא מגוגל דרייב. מייקי מחפש שם לפני שהוא יוצר משהו חדש."],
  ["מה ההבדל בין תקציב הפרסום לשימוש של מייקי?", "תקציב הפרסום משולם ישירות למטא. השימוש של מייקי (חשיבה ויצירת מדיה) נספר בנפרד, עם תקרה משלו בהגדרות."],
  ["אפשר לעצור קמפיין?", "כן. כותבים למייקי ״תעצור את הקמפיין של...״, והוא מכין כרטיס עצירה לאישור."],
  ["המידע שלי בטוח?", "הגישה לחשבונות שמורה מוצפנת ולא מגיעה למודל. כל עסק רואה רק את המידע שלו, והקבצים נשמרים באחסון פרטי."],
];

/** Help without leaving the screen: quick answers, a way to ask Mikee, and a direct line to a person. */
export function HelpPanel({ open, onClose, support }: { open: boolean; onClose: () => void; support: { email?: string; whatsapp?: string } }) {
  const [state, action, pending] = useActionState(sendSupport, null);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);

  return (
    <div className={`fixed inset-0 z-[60] ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div className={`absolute inset-0 bg-ink/25 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`} onClick={onClose} />
      <aside
        role="dialog"
        aria-label="עזרה"
        className={`absolute inset-y-0 end-0 flex w-full max-w-[420px] flex-col bg-surface shadow-[var(--shadow-float)] transition-[transform,visibility] duration-[380ms] ease-[var(--ease)] ${
          open ? "visible translate-x-0" : "invisible -translate-x-full"
        }`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-5">
          <h2 className="h2">איך אפשר לעזור?</h2>
          <button onClick={onClose} className="btn btn-ghost btn-sm px-2" aria-label="סגירה">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-10">
          <section className="py-5">
            <h3 className="font-semibold">שאלות נפוצות</h3>
            <div className="group-list mt-2">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group px-3.5 py-2.5">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-[15px] font-medium [&::-webkit-details-marker]:hidden">
                    {q}
                    <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-ink-3 transition-transform group-open:rotate-180" strokeWidth={1.75} />
                  </summary>
                  <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-2">{a}</p>
                </details>
              ))}
            </div>
            <Link href="/mikee" onClick={onClose} className="link mt-3 inline-block text-[14.5px]">
              או פשוט לשאול את מייקי
            </Link>
          </section>

          <section className="rule py-5">
            <h3 className="font-semibold">לדבר עם בן אדם</h3>
            <p className="mt-1 text-[14.5px] text-ink-2">משהו לא עובד, או שיש שאלה על החשבון? כתבי לנו כאן, ואנחנו חוזרים תוך יום עסקים.</p>
            <form action={action} className="mt-4 space-y-3">
              <select name="topic" className="field" defaultValue="general">
                <option value="general">שאלה כללית</option>
                <option value="bug">משהו לא עובד</option>
                <option value="billing">מנוי וחיוב</option>
                <option value="connections">חיבור חשבונות</option>
                <option value="privacy">פרטיות ומידע</option>
              </select>
              <textarea name="body" rows={4} maxLength={4000} required placeholder="מה קרה? כמה שיותר פרטים עוזרים לנו" className="field resize-none" />
              {state?.error && <p className="note note-bad text-[15px]">{state.error}</p>}
              {state?.ok && <p className="note text-[15px]">{state.ok}</p>}
              <button className="btn btn-primary w-full" disabled={pending}>
                {pending ? "שולח…" : "שליחה לצוות"}
              </button>
            </form>
            {(support.email || support.whatsapp) && (
              <div className="mt-5 flex flex-wrap gap-2">
                {support.whatsapp && (
                  <a href={`https://wa.me/${support.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="btn btn-quiet btn-sm">
                    <MessageCircle className="h-4 w-4" strokeWidth={1.8} /> וואטסאפ
                  </a>
                )}
                {support.email && (
                  <a href={`mailto:${support.email}`} className="btn btn-quiet btn-sm" dir="ltr">
                    <Mail className="h-4 w-4" strokeWidth={1.8} /> {support.email}
                  </a>
                )}
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
