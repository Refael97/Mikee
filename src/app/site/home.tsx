"use client";

import { useEffect, useState } from "react";
import { MikeeAvatar, type MikeeState } from "@/components/MikeeAvatar";
import type { MikeeLook } from "@/lib/mikee-look";

/** Sections rise into place as they scroll in. Without script, or with reduced motion, everything just shows. */
export function Reveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const items = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]")).filter((el) => el.getBoundingClientRect().top > window.innerHeight * 0.9);
    items.forEach((el) => el.classList.add("h-wait"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.remove("h-wait");
          e.target.classList.add("h-in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}

/** Mikee in a scene: the live character, sized to its stage. */
export function Scene({ size, look = "ice_blue", state = "idle", greet = false, className = "" }: { size: number; look?: MikeeLook; state?: MikeeState; greet?: boolean; className?: string }) {
  return (
    <div className={`h-scene ${className}`}>
      <MikeeAvatar size={size} look={look} state={state} greet={greet} />
    </div>
  );
}

/*
 * The phone in the hero plays one short conversation on a loop: she asks, Mikee thinks, answers, and his
 * card arrives waiting for her approval, then gets approved and goes live.
 */
const SCRIPT = [
  { at: 400, step: 1 },
  { at: 1500, step: 2 },
  { at: 2900, step: 3 },
  { at: 3700, step: 4 },
  { at: 6200, step: 5 },
  { at: 9800, step: 0 },
];

export function PhoneChat() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStep(4);
      return;
    }
    let timers: ReturnType<typeof setTimeout>[] = [];
    const run = () => {
      timers = SCRIPT.map(({ at, step }) => setTimeout(() => (step === 0 ? (setStep(0), run()) : setStep(step)), at));
    };
    run();
    return () => timers.forEach(clearTimeout);
  }, []);

  const state: MikeeState = step === 2 ? "thinking" : step === 3 ? "talking" : "idle";
  return (
    <div className="h-phone" aria-hidden>
      <div className="h-phone-notch" />
      <div className="h-phone-head">
        <MikeeAvatar size={30} state={state} />
        <b>מייקי</b>
      </div>
      <div className="h-phone-body">
        {step >= 1 && <p className="h-msg h-msg-you">צריך יותר פניות החודש, משהו לשכונה</p>}
        {step === 2 && (
          <p className="h-msg h-msg-typing">
            <i />
            <i />
            <i />
          </p>
        )}
        {step >= 3 && <p className="h-msg">הכנתי קמפיין לידים עם שתי גרסאות למודעה. התקציב נשאר מתחת לתקרה שלך.</p>}
        {step >= 4 && (
          <div className="h-mini-card">
            <div className="h-mini-top">
              <span>קמפיין · פייסבוק ואינסטגרם</span>
              <span className={`h-pill ${step >= 5 ? "h-pill-live" : "h-pill-wait"}`}>{step >= 5 ? "באוויר" : "ממתין לאישור"}</span>
            </div>
            <b>פניות מתושבי האזור</b>
            <div className="h-mini-imgs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/site/cafe.jpg" alt="" width={120} height={120} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/site/warehouse.jpg" alt="" width={120} height={120} />
            </div>
            <span className={`h-mini-btn ${step >= 5 ? "is-done" : ""}`}>{step >= 5 ? "הקמפיין באוויר" : "אשר והעלה · ₪60 ליום"}</span>
          </div>
        )}
      </div>
      <div className="h-phone-input">
        <span>כתבו למייקי</span>
        <i />
      </div>
    </div>
  );
}

/** The chat in "inside Mikee": the composer types its next request letter by letter. */
export function TypingLine({ text }: { text: string }) {
  const [n, setN] = useState(text.length);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setN(0);
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setN(i);
      if (i >= text.length) {
        i = -18; // a pause, then type again
      }
    }, 90);
    return () => clearInterval(t);
  }, [text]);
  return (
    <span className="h-typing-line">
      {text.slice(0, Math.max(0, n))}
      <i />
    </span>
  );
}
