"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check } from "lucide-react";
import { useT } from "@/components/Lang";

/**
 * The submit button of a server-action form: disabled while it is sent (no double submit), says what is
 * happening, and confirms for a moment when it is done.
 */
export function SubmitButton({ children, pendingText = "שומר…", doneText = "נשמר", className = "btn btn-primary", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: string; doneText?: string | null }) {
  const t = useT();
  const { pending } = useFormStatus();
  const [done, setDone] = useState(false);
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !pending && doneText) {
      setDone(true);
      const timer = setTimeout(() => setDone(false), 1800);
      was.current = pending;
      return () => clearTimeout(timer);
    }
    was.current = pending;
  }, [pending, doneText]);
  return (
    <button {...rest} type="submit" disabled={pending || rest.disabled} aria-busy={pending || undefined} className={className}>
      {pending ? (
        <span className="shimmer">{t(pendingText)}</span>
      ) : done ? (
        <span className="fade-in flex items-center gap-1.5">
          <Check className="h-4 w-4" strokeWidth={2} />
          {doneText && t(doneText)}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
