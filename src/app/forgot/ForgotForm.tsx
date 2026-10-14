"use client";

import { useActionState } from "react";
import { resetPassword } from "../login/actions";

export function ForgotForm() {
  const [error, action, pending] = useActionState(resetPassword, null);
  return (
    <form action={action} className="mt-6 space-y-4">
      <label className="block space-y-1.5">
        <span className="label">שם משתמש</span>
        <input name="email" required maxLength={200} autoComplete="username" autoCapitalize="none" spellCheck={false} className="field" dir="ltr" />
      </label>
      <label className="block space-y-1.5">
        <span className="label">סיסמה חדשה</span>
        <input name="password" type="password" required minLength={10} maxLength={200} autoComplete="new-password" className="field" dir="ltr" />
        <span className="block text-[13px] text-ink-3">10 תווים לפחות</span>
      </label>
      {error && <p className="note note-bad text-[14px]">{error}</p>}
      <button className="btn btn-primary btn-lg w-full" disabled={pending}>
        {pending ? "שומרים…" : "שמירה וכניסה"}
      </button>
    </form>
  );
}
