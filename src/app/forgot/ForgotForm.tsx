"use client";

import { useActionState } from "react";
import { resetPassword } from "../login/actions";

export function ForgotForm() {
  const [error, action, pending] = useActionState(resetPassword, null);
  return (
    <form action={action} className="mt-6 space-y-4">
      <label className="block space-y-1.5">
        <span className="label">אימייל או שם משתמש</span>
        <input name="email" required maxLength={200} autoComplete="username" className="field" dir="ltr" />
      </label>
      <label className="block space-y-1.5">
        <span className="label">קוד שחזור</span>
        <input name="code" required maxLength={100} autoComplete="one-time-code" placeholder="XXXX-XXXX-XXXX-XXXX" className="field font-mono tracking-wider" dir="ltr" />
      </label>
      <label className="block space-y-1.5">
        <span className="label">סיסמה חדשה</span>
        <input name="password" type="password" required minLength={10} maxLength={200} autoComplete="new-password" className="field" dir="ltr" />
        <span className="block text-[13px] text-ink-3">10 תווים לפחות</span>
      </label>
      <label className="block space-y-1.5">
        <span className="label">הסיסמה החדשה שוב</span>
        <input name="confirm" type="password" required minLength={10} maxLength={200} autoComplete="new-password" className="field" dir="ltr" />
      </label>
      {error && <p className="note note-bad text-[14px]">{error}</p>}
      <button className="btn btn-primary btn-lg w-full" disabled={pending}>
        {pending ? "מאפסים…" : "איפוס וכניסה"}
      </button>
    </form>
  );
}
