"use client";

import { useActionState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm fade-in">
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="orb h-16 w-16" />
          <h1 className="mt-6 text-4xl font-semibold tracking-tight">Mikee</h1>
          <p className="mt-2 text-ink-2">איש השיווק של העסק שלך</p>
        </div>
        <form action={action} className="card space-y-3 p-6">
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
