"use client";

import { useEffect, useId, useState } from "react";

export type MikeeState = "idle" | "listening" | "thinking" | "talking";
export type MikeeCue = "celebrate" | "concern" | "hello";

/** Something happened that Mikee reacts to (a card went live, a card failed). Avatars with `cues` pick it up. */
export function cueMikee(cue: MikeeCue) {
  window.dispatchEvent(new CustomEvent<MikeeCue>("mikee:cue", { detail: cue }));
}

const BODY = "M50 4A42 42 0 0 1 92 46V78Q92 88 82 88H50A42 42 0 0 1 8 46A42 42 0 0 1 50 4Z";
const OPEN = "M44.6 56.6H55.4Q55 65 50 65Q45 65 44.6 56.6Z";

const CUE_MS: Record<MikeeCue, number> = { celebrate: 1500, concern: 2000, hello: 1100 };

/**
 * Mikee himself: a glossy 3D speech bubble with eyes, drawn in SVG and animated in CSS (globals.css, `.mk-*`).
 * He breathes and blinks; thinks, talks and listens with the chat; celebrates, worries and says hello on cue.
 * Under prefers-reduced-motion every animation stops and he stays still.
 */
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
  /** Old chat messages stay still: only the avatar the client is looking at moves. */
  animate?: boolean;
  /** Reacts to `cueMikee()`. Give it to one avatar per screen. */
  cues?: boolean;
  /** Says hello once when he appears (the toast). */
  greet?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const [cue, setCue] = useState<MikeeCue | null>(greet ? "hello" : null);

  useEffect(() => {
    if (!cue) return;
    const t = setTimeout(() => setCue(null), CUE_MS[cue]);
    return () => clearTimeout(t);
  }, [cue]);

  useEffect(() => {
    if (!cues) return;
    const react = (e: Event) => setCue((e as CustomEvent<MikeeCue>).detail);
    window.addEventListener("mikee:cue", react);
    return () => window.removeEventListener("mikee:cue", react);
  }, [cues]);

  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`mikee ${className}`}
      data-live={animate ? "" : undefined}
      data-mode={animate ? state : "idle"}
      data-cue={cue ?? undefined}
    >
      <defs>
        {/* Light comes from the top left: a lit core, a darker far edge, a rim of light, a glossy highlight. */}
        <radialGradient id={`${id}b`} cx="0.36" cy="0.3" r="0.82">
          <stop offset="0" stopColor="#e9f8d3" />
          <stop offset="0.32" stopColor="#ade2c4" />
          <stop offset="0.68" stopColor="#6ebfe0" />
          <stop offset="1" stopColor="#3d86d3" />
        </radialGradient>
        <radialGradient id={`${id}s`} cx="0.3" cy="0.24" r="0.95">
          <stop offset="0.55" stopColor="#123478" stopOpacity="0" />
          <stop offset="1" stopColor="#123478" stopOpacity="0.42" />
        </radialGradient>
        <linearGradient id={`${id}r`} x1="0.1" y1="0.05" x2="0.6" y2="0.6">
          <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${id}h`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0.7" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}e`} cx="0.38" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#3c4352" />
          <stop offset="1" stopColor="#06070a" />
        </radialGradient>
        <clipPath id={`${id}c`}>
          <path d={BODY} />
        </clipPath>
        <clipPath id={`${id}m`}>
          <path d={OPEN} />
        </clipPath>
        <filter id={`${id}f`} x="-20%" y="-200%" width="140%" height="500%">
          <feGaussianBlur stdDeviation="1.8" />
        </filter>
      </defs>
      <ellipse className="mk-shadow" cx="52" cy="93" rx="30" ry="3.2" fill="#0f2142" opacity="0.28" filter={`url(#${id}f)`} />
      <g className="mk-body">
        <path d={BODY} fill={`url(#${id}b)`} />
        <g clipPath={`url(#${id}c)`}>
          <path d={BODY} fill={`url(#${id}s)`} />
          <ellipse cx="54" cy="86" rx="28" ry="5" fill="#dff6ff" opacity="0.28" filter={`url(#${id}f)`} />
          <path d={BODY} fill="none" stroke={`url(#${id}r)`} strokeWidth="3" />
        </g>
        <ellipse cx="31" cy="21" rx="16" ry="8.5" transform="rotate(-32 31 21)" fill={`url(#${id}h)`} />
        <ellipse cx="27.5" cy="18" rx="6" ry="2.8" transform="rotate(-32 27.5 18)" fill="#fff" opacity="0.9" />
        <circle cx="19.5" cy="35" r="2" fill="#fff" opacity="0.75" />
        <g className="mk-face">
          <g className="mk-look">
            <g className="mk-eyes">
              <circle cx="37.7" cy="43.3" r="6.7" fill={`url(#${id}e)`} />
              <circle cx="62.3" cy="43.3" r="6.7" fill={`url(#${id}e)`} />
              <circle cx="35.4" cy="40.8" r="2.2" fill="#fff" />
              <circle cx="60" cy="40.8" r="2.2" fill="#fff" />
              <circle cx="40.2" cy="46" r="0.9" fill="#fff" opacity="0.55" />
              <circle cx="64.8" cy="46" r="0.9" fill="#fff" opacity="0.55" />
            </g>
          </g>
          <g className="mk-joy" fill="none" stroke="#0b0d12" strokeWidth="3.6" strokeLinecap="round">
            <path d="M32.5 45Q37.7 37.5 42.9 45" />
            <path d="M57.1 45Q62.3 37.5 67.5 45" />
          </g>
          <ellipse cx="29.5" cy="52.5" rx="4.5" ry="2.6" fill="#ff7f9a" opacity="0.32" />
          <ellipse cx="70.5" cy="52.5" rx="4.5" ry="2.6" fill="#ff7f9a" opacity="0.32" />
          <g fill="none" stroke="#0b0d12" strokeWidth="3.6" strokeLinecap="round">
            <path className="mk-smile" d="M45 57.8Q50 63 55 57.8" />
            <path className="mk-flat" d="M47.4 59.4H52.6" />
            <path className="mk-frown" d="M46 61.2Q50 57.4 54 61.2" />
          </g>
          <g className="mk-open">
            <path d={OPEN} fill="#0b0d12" />
            <ellipse cx="50" cy="65" rx="4" ry="2.6" fill="#e8768f" clipPath={`url(#${id}m)`} />
          </g>
        </g>
      </g>
    </svg>
  );
}
