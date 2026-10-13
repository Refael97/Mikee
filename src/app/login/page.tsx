"use client";

import { useActionState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="orb orb-glow orb-breathe h-16 w-16" />
          <h1 className="rise mt-8 text-[2.6rem] font-semibold tracking-[-0.03em]">Mikee</h1>
          <p className="rise mt-1 text-ink-2 [animation-delay:60ms]">איש השיווק של העסק שלך</p>
        </div>
        <form action={action} className="float rise space-y-3 rounded-[28px] p-6 [animation-delay:120ms]">
          <input name="email" type="email" required autoComplete="email" placeholder="אימייל" className="field" dir="ltr" />
          <input name="password" type="password" required autoComplete="current-password" placeholder="סיסמה" className="field" dir="ltr" />
          {error && <p className="text-sm text-warn">{error}</p>}
          <button className="btn btn-primary w-full" disabled={pending}>
            {pending ? "נכנסים…" : "כניסה"}
          </button>
        </form>
      </div>
    </main>
  );
}
