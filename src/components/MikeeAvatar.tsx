"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

export type MikeeState = "idle" | "listening" | "thinking" | "talking";
export type MikeeCue = "celebrate" | "concern" | "hello";

/** Something happened that Mikee reacts to (a card went live, a card failed). Animated avatars that listen pick it up. */
export function cueMikee(cue: MikeeCue) {
  window.dispatchEvent(new CustomEvent<MikeeCue>("mikee:cue", { detail: cue }));
}

/**
 * The Rive character is off until `NEXT_PUBLIC_MIKEE_RIVE=on`. Until then (and while it loads, and when the
 * client asked for less motion) Mikee is a still image of the same character.
 */
const RIVE_ON = process.env.NEXT_PUBLIC_MIKEE_RIVE === "on";
const MikeeRive = dynamic(() => import("./MikeeRive"), { ssr: false });

export function MikeeAvatar({
  size = 24,
  state = "idle",
  animate = true,
  cues = false,
  greet = false,
  className = "",
}: {
  size?: number;
  state?: MikeeState;
  /** Old chat messages stay still: dozens of live canvases buy nothing. */
  animate?: boolean;
  /** Reacts to `cueMikee()`. Give it to one avatar per screen. */
  cues?: boolean;
  /** Says hello once when it appears (the toast). */
  greet?: boolean;
  className?: string;
}) {
  const [motion, setMotion] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMotion(!m.matches);
    update();
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);

  const rive = RIVE_ON && animate && motion;
  return (
    <span aria-hidden className={`mikee ${!rive && state !== "idle" ? "mikee-busy" : ""} ${className}`} style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/rive/mikee.png" alt="" width={size} height={size} draggable={false} style={rive && ready ? { opacity: 0 } : undefined} />
      {rive && <MikeeRive state={state} cues={cues} greet={greet} onReady={() => setReady(true)} />}
    </span>
  );
}
