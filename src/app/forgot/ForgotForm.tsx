"use client";

import { useActionState } from "react";
import { resetPassword } from "../login/actions";
import { useT } from "@/components/Lang";

export function ForgotForm() {
  const t = useT();
  const [error, action, pending] = useActionState(resetPassword, null);
  return (
    <form action={action} className="mt-6 space-y-4">
      <label className="block space-y-1.5">
        <span className="label">{t("שם משתמש")}</span>
        <input name="email" required maxLength={200} autoComplete="username" autoCapitalize="none" spellCheck={false} className="field" dir="ltr" />
      </label>
      <label className="block space-y-1.5">
        <span className="label">{t("סיסמה חדשה")}</span>
        <input name="password" type="password" required minLength={10} maxLength={200} autoComplete="new-password" className="field" dir="ltr" />
        <span className="block text-[13px] text-ink-3">{t("10 תווים לפחות")}</span>
      </label>
      {error && <p className="note note-bad text-[14px]">{error}</p>}
      <button className="btn btn-primary btn-lg w-full" disabled={pending}>
        {pending ? t("שומרים…") : t("שמירה וכניסה")}
      </button>
    </form>
  );
}
