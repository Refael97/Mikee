"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "./actions";
import { MikeeAvatar } from "@/components/MikeeAvatar";
import { useT } from "@/components/Lang";

export default function LoginPage() {
  const t = useT();
  const [error, action, pending] = useActionState(login, null);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-shell px-4 py-12">
      <div className="mb-8 flex items-center gap-2.5">
        <MikeeAvatar size={64} />
        <span className="text-[20px] font-semibold">{t("מייקי")}</span>
      </div>
      <div className="card-float w-full max-w-[400px] p-7">
        <h1 className="h2">{t("כניסה לחשבון")}</h1>
        <p className="mt-1 text-[14.5px] text-ink-2">{t("איש השיווק של העסק שלך מחכה.")}</p>
        <form action={action} className="mt-6 space-y-4">
          <label className="block space-y-1.5">
            <span className="label">{t("שם משתמש")}</span>
            <input name="email" required autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={200} className="field" dir="ltr" />
          </label>
          <label className="block space-y-1.5">
            <span className="flex items-baseline justify-between">
              <span className="label">{t("סיסמה")}</span>
              <Link href="/forgot" className="link text-[13.5px]">
                {t("שכחתי סיסמה")}
              </Link>
            </span>
            <input name="password" type="password" required autoComplete="current-password" maxLength={256} className="field" dir="ltr" />
          </label>
          {error && <p className="note note-bad text-[14px]">{error}</p>}
          <button className="btn btn-primary btn-lg w-full" disabled={pending}>
            {pending ? t("נכנסים…") : t("כניסה")}
          </button>
        </form>
      </div>
      <p className="mt-6 text-[14.5px] text-ink-2">
        {t("אין לך חשבון?")}{" "}
        <Link href="/signup" className="link">
          {t("פתיחת חשבון לעסק")}
        </Link>
      </p>
      <p className="mt-3 max-w-[400px] text-center text-[13px] text-ink-3">{t("שום דבר לא עולה לאוויר ושום שקל לא יוצא בלי האישור שלך.")}</p>
      <p className="mt-3 flex gap-4 text-[13px] text-ink-3">
        <a href="/site/terms" className="hover:text-ink-2">{t("תנאי שימוש")}</a>
        <a href="/site/privacy" className="hover:text-ink-2">{t("פרטיות")}</a>
        <a href="/site/accessibility" className="hover:text-ink-2">{t("נגישות")}</a>
      </p>
    </main>
  );
}
