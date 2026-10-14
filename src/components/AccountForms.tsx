"use client";

import { useActionState, useState } from "react";
import { changePassword, makeRecoveryCode, updateProfile } from "@/lib/actions";

export function ProfileForm({ name, email, username }: { name: string; email: string; username?: string | null }) {
  const [state, action, pending] = useActionState(updateProfile, null);
  return (
    <form action={action} className="grid max-w-xl gap-4 sm:grid-cols-2">
      <label className="space-y-1.5">
        <span className="text-[15px] text-ink-2">שם</span>
        <input name="name" defaultValue={name} maxLength={80} required className="field" />
      </label>
      <label className="space-y-1.5">
        <span className="text-[15px] text-ink-2">שם משתמש לכניסה</span>
        <input name="username" defaultValue={username ?? ""} maxLength={30} dir="ltr" autoCapitalize="none" spellCheck={false} placeholder="rachel" className="field" />
      </label>
      <label className="space-y-1.5">
        <span className="text-[15px] text-ink-2">אימייל</span>
        <input value={email} readOnly dir="ltr" className="field text-ink-2" />
      </label>
      <div className="flex items-center gap-4 sm:col-span-2">
        <button className="btn btn-primary" disabled={pending}>
          שמירה
        </button>
        {state?.ok && <span className="tag tag-good">{state.ok}</span>}
        {state?.error && <span className="tag tag-bad">{state.error}</span>}
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, null);
  return (
    <form action={action} className="grid max-w-xl gap-4 sm:grid-cols-2">
      <label className="space-y-1.5 sm:col-span-2">
        <span className="text-[15px] text-ink-2">הסיסמה הנוכחית</span>
        <input name="current" type="password" autoComplete="current-password" required className="field" dir="ltr" />
      </label>
      <label className="space-y-1.5">
        <span className="text-[15px] text-ink-2">סיסמה חדשה</span>
        <input name="next" type="password" autoComplete="new-password" minLength={10} required className="field" dir="ltr" />
      </label>
      <label className="space-y-1.5">
        <span className="text-[15px] text-ink-2">שוב, לאימות</span>
        <input name="confirm" type="password" autoComplete="new-password" minLength={10} required className="field" dir="ltr" />
      </label>
      <p className="text-[14px] text-ink-3 sm:col-span-2">לפחות 10 תווים. אחרי ההחלפה, כל המכשירים האחרים יתנתקו.</p>
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
        <button className="btn btn-primary" disabled={pending}>
          החלפת סיסמה
        </button>
        {state?.ok && <span className="tag tag-good">{state.ok}</span>}
        {state?.error && <span className="tag tag-bad">{state.error}</span>}
      </div>
    </form>
  );
}

/** The one-time recovery code: shown once, right after it is made. It resets the password without email. */
export function RecoveryCodeForm({ has }: { has: boolean }) {
  const [state, action, pending] = useActionState(makeRecoveryCode, null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="max-w-xl space-y-4">
      <p className="text-[15px] text-ink-2">
        אם תשכחי את הסיסמה, הקוד הזה מאפס אותה מיד ממסך הכניסה. שמרי אותו במקום בטוח (מנהל סיסמאות, או מודפס). כל קוד עובד פעם אחת, וקוד חדש מבטל את הקודם.
      </p>
      {state?.code ? (
        <div className="space-y-3 rounded-[6px] border border-line bg-surface-2 p-4">
          <p className="text-[14px] font-medium">הקוד שלך (מוצג פעם אחת בלבד):</p>
          <p className="num select-all font-mono text-[20px] font-semibold tracking-[0.12em]" dir="ltr">
            {state.code}
          </p>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            onClick={() => navigator.clipboard?.writeText(state.code!).then(() => setCopied(true), () => undefined)}
          >
            {copied ? "הועתק" : "העתקה"}
          </button>
        </div>
      ) : (
        <form action={action} className="flex flex-wrap items-center gap-4">
          <button className="btn btn-primary" disabled={pending}>
            {has ? "יצירת קוד חדש" : "יצירת קוד שחזור"}
          </button>
          <span className={`tag ${has ? "tag-good" : "tag-warn"}`}>{has ? "יש קוד שמור" : "עדיין אין קוד"}</span>
          {state?.error && <span className="tag tag-bad">{state.error}</span>}
        </form>
      )}
    </div>
  );
}
