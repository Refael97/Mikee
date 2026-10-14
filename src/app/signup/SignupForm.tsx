"use client";

import { useActionState } from "react";
import { signup } from "../login/actions";

function Field({ label, hint, ...props }: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block space-y-1.5">
      <span className="label">{label}</span>
      <input className="field" {...props} />
      {hint && <span className="block text-[13px] text-ink-3">{hint}</span>}
    </label>
  );
}

export function SignupForm({ invite }: { invite: boolean }) {
  const [error, action, pending] = useActionState(signup, null);
  return (
    <form action={action} className="mt-6 space-y-4">
      <Field label="שם העסק" name="business" required minLength={2} maxLength={80} autoComplete="organization" />
      <Field label="השם שלך" name="name" required minLength={2} maxLength={80} autoComplete="name" />
      <Field label="אימייל" name="email" type="email" required maxLength={200} autoComplete="email" dir="ltr" />
      <Field label="סיסמה" name="password" type="password" required minLength={10} maxLength={200} autoComplete="new-password" dir="ltr" hint="10 תווים לפחות" />
      <Field label="הסיסמה שוב" name="confirm" type="password" required minLength={10} maxLength={200} autoComplete="new-password" dir="ltr" />
      {invite && <Field label="קוד הזמנה" name="invite" required maxLength={200} autoComplete="off" dir="ltr" />}
      {/* Hidden from people; a bot that fills it is turned away. */}
      <div aria-hidden className="absolute -start-[9999px] h-px w-px overflow-hidden">
        <input name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {error && <p className="note note-bad text-[14px]">{error}</p>}
      <button className="btn btn-primary btn-lg w-full" disabled={pending}>
        {pending ? "פותחים חשבון…" : "פתיחת חשבון"}
      </button>
    </form>
  );
}
