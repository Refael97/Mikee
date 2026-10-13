"use client";

import { useActionState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <main className="flex min-h-dvh items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="orb orb-glow orb-breathe w-20" />
          <h1 className="display rise mt-9">Mikee</h1>
          <p className="lead rise mt-2 [animation-delay:60ms]">איש השיווק של העסק שלך</p>
        </div>
        <form action={action} className="card-float rise space-y-3 p-6 [animation-delay:120ms]">
          <input name="email" type="email" required autoComplete="email" placeholder="אימייל" className="field" dir="ltr" />
          <input name="password" type="password" required autoComplete="current-password" placeholder="סיסמה" className="field" dir="ltr" />
          {error && <p className="text-[15px] text-warn">{error}</p>}
          <button className="btn btn-primary w-full" disabled={pending}>
            {pending ? "נכנסים…" : "כניסה"}
          </button>
        </form>
      </div>
    </main>
  );
}
