"use client";

import { useActionState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-shell px-4 py-12">
      <div className="mb-8 flex items-center gap-2.5">
        <span className="orb w-8" />
        <span className="text-[20px] font-semibold">מייקי</span>
      </div>
      <div className="card-float w-full max-w-[400px] p-7">
        <h1 className="h2">כניסה לחשבון</h1>
        <p className="mt-1 text-[14.5px] text-ink-2">איש השיווק של העסק שלך מחכה.</p>
        <form action={action} className="mt-6 space-y-4">
          <label className="block space-y-1.5">
            <span className="label">אימייל</span>
            <input name="email" type="email" required autoComplete="email" maxLength={200} className="field" dir="ltr" />
          </label>
          <label className="block space-y-1.5">
            <span className="label">סיסמה</span>
            <input name="password" type="password" required autoComplete="current-password" maxLength={256} className="field" dir="ltr" />
          </label>
          {error && <p className="note note-bad text-[14px]">{error}</p>}
          <button className="btn btn-primary btn-lg w-full" disabled={pending}>
            {pending ? "נכנסים…" : "כניסה"}
          </button>
        </form>
      </div>
      <p className="mt-6 max-w-[400px] text-center text-[13px] text-ink-3">שום דבר לא עולה לאוויר ושום שקל לא יוצא בלי האישור שלך.</p>
    </main>
  );
}
