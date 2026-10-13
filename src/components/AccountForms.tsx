"use client";

import { useActionState } from "react";
import { changePassword, updateProfile } from "@/lib/actions";

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const [state, action, pending] = useActionState(updateProfile, null);
  return (
    <form action={action} className="grid max-w-xl gap-4 sm:grid-cols-2">
      <label className="space-y-1.5">
        <span className="text-[15px] text-ink-2">שם</span>
        <input name="name" defaultValue={name} maxLength={80} required className="field" />
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
