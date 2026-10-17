"use client";

import { useActionState, useState } from "react";
import { changePassword, updateProfile } from "@/lib/actions";
import { useT } from "@/components/Lang";

export function ProfileForm({ name, email, username }: { name: string; email: string; username?: string | null }) {
  const t = useT();
  const [state, action, pending] = useActionState(updateProfile, null);
  return (
    <form action={action} className="grid max-w-xl gap-4 sm:grid-cols-2">
      <label className="space-y-1.5">
        <span className="text-[15px] text-ink-2">{t("שם")}</span>
        <input name="name" defaultValue={name} maxLength={80} required className="field" />
      </label>
      <label className="space-y-1.5">
        <span className="text-[15px] text-ink-2">{t("שם משתמש לכניסה")}</span>
        <input name="username" defaultValue={username ?? ""} maxLength={30} dir="ltr" autoCapitalize="none" spellCheck={false} placeholder="rachel" className="field" />
      </label>
      <label className="space-y-1.5">
        <span className="text-[15px] text-ink-2">{t("אימייל")}</span>
        <input value={email} readOnly dir="ltr" className="field text-ink-2" />
      </label>
      <div className="flex items-center gap-4 sm:col-span-2">
        <button className="btn btn-primary" disabled={pending}>
          {t("שמירה")}
        </button>
        {state?.ok && <span className="tag tag-good">{t(state.ok)}</span>}
        {state?.error && <span className="tag tag-bad">{t(state.error)}</span>}
      </div>
    </form>
  );
}

export function PasswordForm({ username }: { username?: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(changePassword, null);
  return (
    <form action={action} className="grid max-w-xl gap-4 sm:grid-cols-2">
      {/* Which account the new password belongs to, for password managers (and the browser's own check). */}
      <input type="text" name="username" autoComplete="username" defaultValue={username ?? ""} readOnly hidden aria-hidden />
      <label className="space-y-1.5 sm:col-span-2">
        <span className="text-[15px] text-ink-2">{t("הסיסמה הנוכחית")}</span>
        <input name="current" type="password" autoComplete="current-password" required className="field" dir="ltr" />
      </label>
      <label className="space-y-1.5">
        <span className="text-[15px] text-ink-2">{t("סיסמה חדשה")}</span>
        <input name="next" type="password" autoComplete="new-password" minLength={10} required className="field" dir="ltr" />
      </label>
      <label className="space-y-1.5">
        <span className="text-[15px] text-ink-2">{t("שוב, לאימות")}</span>
        <input name="confirm" type="password" autoComplete="new-password" minLength={10} required className="field" dir="ltr" />
      </label>
      <p className="text-[14px] text-ink-3 sm:col-span-2">{t("לפחות 10 תווים. אחרי ההחלפה, כל המכשירים האחרים יתנתקו.")}</p>
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
        <button className="btn btn-primary" disabled={pending}>
          {t("החלפת סיסמה")}
        </button>
        {state?.ok && <span className="tag tag-good">{t(state.ok)}</span>}
        {state?.error && <span className="tag tag-bad">{t(state.error)}</span>}
      </div>
    </form>
  );
}

