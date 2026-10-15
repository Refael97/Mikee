"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { setMikeeLook } from "@/lib/actions";
import { MIKEE_LOOKS, type MikeeLook } from "@/lib/mikee-look";
import { MikeeAvatar } from "./MikeeAvatar";
import { useMikeeLook } from "./MikeeLook";

/** Four looks side by side, each one alive; a tap saves it for every screen of the business. */
export function MikeeLookPicker() {
  const router = useRouter();
  const current = useMikeeLook();
  const [picked, setPicked] = useState<MikeeLook>(current);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const choose = (look: MikeeLook) => {
    if (look === picked) return;
    const before = picked;
    setPicked(look);
    setError(null);
    start(async () => {
      const r = await setMikeeLook(look).catch(() => ({ error: "השמירה לא הצליחה. נסי שוב." }));
      if (r?.error) {
        setPicked(before);
        setError(r.error);
      } else router.refresh();
    });
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" role="radiogroup" aria-label="המראה של מייקי">
        {MIKEE_LOOKS.map((l) => {
          const on = l.id === picked;
          return (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => choose(l.id)}
              className={`relative flex flex-col items-center gap-2 rounded-[14px] border px-3 pb-3 pt-4 transition-[border-color,background-color,transform] duration-200 active:scale-[.98] ${
                on ? "border-ink bg-surface" : "border-line bg-surface hover:border-line-strong hover:bg-surface-2"
              }`}
            >
              <MikeeAvatar size={72} look={l.id} />
              <span className="text-[15px] text-ink">{l.name}</span>
              {on && (
                <span className="absolute end-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-surface" aria-hidden>
                  <Check className="h-3 w-3" strokeWidth={2} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      {error && <p className="note note-bad mt-3 text-[14px]">{error}</p>}
    </div>
  );
}
