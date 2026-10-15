"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useMikeeLook } from "./MikeeLook";
import type { MikeeLook } from "@/lib/mikee-look";

export type MikeeState = "idle" | "listening" | "thinking" | "talking";
export type MikeeCue = "celebrate" | "concern" | "hello";

/** Something happened that Mikee reacts to (a card went live, a card failed). Avatars with `cues` pick it up. */
export function cueMikee(cue: MikeeCue) {
  window.dispatchEvent(new CustomEvent<MikeeCue>("mikee:cue", { detail: cue }));
}

// The animation runtime loads only in the browser and only where Mikee moves.
const MikeeRive = dynamic(() => import("./MikeeRive"), { ssr: false });

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const h = () => setReduced(m.matches);
    m.addEventListener("change", h);
    return () => m.removeEventListener("change", h);
  }, []);
  return reduced;
}

/**
 * Mikee himself, animated in Rive (public/mikee/mikee.riv) in the look the business chose. A still frame of
 * the same look shows at once and stays for avatars that do not move (old chat messages) and under
 * prefers-reduced-motion; the animation fades in over it once loaded.
 */
export function MikeeAvatar({
  size = 24,
  state = "idle",
  animate = true,
  cues = false,
  greet = false,
  look,
  className = "",
}: {
  size?: number;
  state?: MikeeState;
  /** Old chat messages stay still: only the avatar the client is looking at moves. */
  animate?: boolean;
  /** Reacts to `cueMikee()`. Give it to one avatar per screen. */
  cues?: boolean;
  /** Says hello once when he appears (the toast). */
  greet?: boolean;
  /** A specific look (the picker); otherwise the business's own. */
  look?: MikeeLook;
  className?: string;
}) {
  const chosen = useMikeeLook();
  const l = look ?? chosen;
  const reduced = useReducedMotion();
  const [ready, setReady] = useState(false);
  const [cue, setCue] = useState<MikeeCue | null>(null);
  useEffect(() => setReady(false), [l]);

  useEffect(() => {
    if (!cues) return;
    // A fresh object each time, so the same cue twice still fires twice.
    const react = (e: Event) => setCue((e as CustomEvent<MikeeCue>).detail);
    window.addEventListener("mikee:cue", react);
    return () => window.removeEventListener("mikee:cue", react);
  }, [cues]);
  useEffect(() => {
    if (!cue) return;
    const t = setTimeout(() => setCue(null), 300);
    return () => clearTimeout(t);
  }, [cue]);

  const moving = animate && !reduced;
  return (
    <span aria-hidden className={`relative inline-block shrink-0 ${className}`} style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/mikee/${l}.png`}
        alt=""
        width={size}
        height={size}
        draggable={false}
        className={`absolute inset-0 h-full w-full select-none transition-opacity duration-200 ${moving && ready ? "opacity-0" : "opacity-100"}`}
      />
      {moving && <MikeeRive key={l} look={l} state={state} cue={cue} greet={greet} interactive={size >= 28} track={size >= 32} onReady={() => setReady(true)} />}
    </span>
  );
}
