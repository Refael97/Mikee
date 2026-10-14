"use client";

import { useActionState, useEffect, useState } from "react";
import { signup } from "../login/actions";

type Check = { state: "idle" | "checking" | "free" | "taken"; message?: string };

/** The username, checked as it is typed: free or taken, before the form is sent. */
function UsernameField() {
  const [value, setValue] = useState("");
  const [check, setCheck] = useState<Check>({ state: "idle" });
  useEffect(() => {
    const u = value.trim().toLowerCase();
    if (u.length < 3) return setCheck({ state: "idle" });
    setCheck({ state: "checking" });
    const t = setTimeout(async () => {
      const r = await fetch(`/api/username?u=${encodeURIComponent(u)}`, { cache: "no-store" })
        .then((x) => x.json())
        .catch(() => null);
      if (!r) return setCheck({ state: "idle" });
      setCheck(r.available ? { state: "free", message: "פנוי" } : { state: "taken", message: r.problem ?? r.error ?? "תפוס" });
    }, 350);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <label className="block space-y-1.5">
      <span className="label">שם משתמש</span>
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
        {check.state === "checking" ? "בודק…" : check.message ?? "באנגלית: אותיות, ספרות, נקודה או קו תחתון. לכניסה מהירה."}
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
  const [error, action, pending] = useActionState(signup, null);
  return (
    <form action={action} className="mt-6 space-y-4">
      <UsernameField />
      <Field label="אימייל" name="email" type="email" required maxLength={200} autoComplete="email" dir="ltr" />
      <Field label="סיסמה" name="password" type="password" required minLength={10} maxLength={200} autoComplete="new-password" dir="ltr" hint="10 תווים לפחות" />
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
