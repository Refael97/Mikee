"use client";

import { useActionState, useEffect, useState } from "react";
import { signup } from "../login/actions";
import { useT } from "@/components/Lang";

type Check = { state: "idle" | "checking" | "free" | "taken"; message?: string };

/** The username, checked as it is typed: free or taken, before the form is sent. */
function UsernameField() {
  const t = useT();
  const [value, setValue] = useState("");
  const [check, setCheck] = useState<Check>({ state: "idle" });
  useEffect(() => {
    const u = value.trim().toLowerCase();
    if (u.length < 3) return setCheck({ state: "idle" });
    setCheck({ state: "checking" });
    const timer = setTimeout(async () => {
      const r = await fetch(`/api/username?u=${encodeURIComponent(u)}`, { cache: "no-store" })
        .then((x) => x.json())
        .catch(() => null);
      if (!r) return setCheck({ state: "idle" });
      setCheck(r.available ? { state: "free", message: t("פנוי") } : { state: "taken", message: r.problem ?? r.error ?? t("תפוס") });
    }, 350);
    return () => clearTimeout(timer);
  }, [value]);
  return (
    <label className="block space-y-1.5">
      <span className="label">{t("שם משתמש")}</span>
      <input
        name="username"
        className="field"
        dir="ltr"
        required
        minLength={3}
        maxLength={30}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/\s/g, ""))}
        aria-invalid={check.state === "taken"}
      />
      <span className={`block text-[13px] ${check.state === "free" ? "text-good" : check.state === "taken" ? "text-bad" : "text-ink-3"}`} aria-live="polite">
        {check.state === "checking" ? t("בודק…") : check.message ?? t("באנגלית: אותיות, ספרות, נקודה או קו תחתון. לכניסה מהירה.")}
      </span>
    </label>
  );
}

function Field({ label, hint, ...props }: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block space-y-1.5">
      <span className="label">{label}</span>
      <input className="field" {...props} />
      {hint && <span className="block text-[13px] text-ink-3">{hint}</span>}
    </label>
  );
}

export function SignupForm() {
  const t = useT();
  const [error, action, pending] = useActionState(signup, null);
  return (
    <form action={action} className="mt-6 space-y-4">
      <UsernameField />
      <Field label={t("אימייל")} name="email" type="email" required maxLength={200} autoComplete="email" dir="ltr" />
      <Field label={t("סיסמה")} name="password" type="password" required minLength={10} maxLength={200} autoComplete="new-password" dir="ltr" hint={t("10 תווים לפחות")} />
      {/* Hidden from people; a bot that fills it is turned away. */}
      <div aria-hidden className="absolute -start-[9999px] h-px w-px overflow-hidden">
        <input name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <label className="flex items-start gap-2.5 text-[14px] leading-relaxed text-ink-2">
        <input type="checkbox" name="terms" required className="mt-1 h-4 w-4 shrink-0" />
        <span>
          {t("קראתי ואני מסכימה ל")}<a href="/site/terms" target="_blank" className="underline underline-offset-2">{t("תנאי השימוש")}</a> {t("ול")}<a href="/site/privacy" target="_blank" className="underline underline-offset-2">{t("מדיניות הפרטיות")}</a>{t(", ובהם האחריות שלי לבדוק כל תוכן והמלצה של מייקי לפני שאני מאשרת.")}
        </span>
      </label>
      {error && <p className="note note-bad text-[14px]">{error}</p>}
      <button className="btn btn-primary btn-lg w-full" disabled={pending}>
        {pending ? t("פותחים חשבון…") : t("פתיחת חשבון")}
      </button>
    </form>
  );
}
