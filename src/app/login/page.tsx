"use client";

import { useActionState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <section className="flex flex-col justify-between border-line px-6 py-10 sm:px-12 lg:border-e">
        <div className="flex items-center gap-2.5">
          <span className="orb w-8" />
          <span className="serif text-[24px]">מייקי</span>
        </div>
        <div className="my-16 max-w-md">
          <h1 className="display rise">
            איש השיווק <span className="marked">של העסק</span> שלך.
          </h1>
          <p className="lead rise mt-5 [animation-delay:60ms]">מכיר את העסק, עוקב אחרי המספרים כל יום, מכין קמפיינים ופוסטים, ושום דבר לא עולה לאוויר בלי האישור שלך.</p>
        </div>
        <p className="hidden text-[14px] text-ink-3 lg:block">© Mikee</p>
      </section>

      <section className="flex items-center px-6 pb-16 sm:px-12 lg:pb-0">
        <form action={action} className="rise w-full max-w-sm space-y-4 [animation-delay:100ms]">
          <h2 className="h2">כניסה</h2>
          <label className="block space-y-1.5">
            <span className="text-[15px] text-ink-2">אימייל</span>
            <input name="email" type="email" required autoComplete="email" maxLength={200} className="field" dir="ltr" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[15px] text-ink-2">סיסמה</span>
            <input name="password" type="password" required autoComplete="current-password" maxLength={256} className="field" dir="ltr" />
          </label>
          {error && <p className="note note-bad text-[15px]">{error}</p>}
          <button className="btn btn-primary w-full" disabled={pending}>
            {pending ? "נכנסים…" : "כניסה"}
          </button>
        </form>
      </section>
    </main>
  );
}
