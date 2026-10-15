"use client";

import { useEffect, useRef } from "react";
import {
  Alignment,
  Fit,
  Layout,
  RuntimeLoader,
  useRive,
  useViewModel,
  useViewModelInstance,
  useViewModelInstanceBoolean,
  useViewModelInstanceNumber,
  useViewModelInstanceTrigger,
} from "@rive-app/react-canvas";
import type { MikeeCue, MikeeState } from "./MikeeAvatar";
import { MIKEE_ASSET_VERSION, type MikeeLook } from "@/lib/mikee-look";

// Served from our own origin (scripts/copy-rive-wasm.mjs): the CSP allows no external scripts.
RuntimeLoader.setWasmUrl("/rive/rive.wasm");

const LAYOUT = new Layout({ fit: Fit.Contain, alignment: Alignment.Center });

/*
 * One pointer watcher for every Mikee on the page. Rive only sees the pointer over its own canvas, so the
 * page feeds the gaze (lookX, lookY) from anywhere on the screen, once per frame. It also notices the pointer
 * heading out through the top of the window (about to close the tab or switch it) and makes Mikee surprised,
 * at most once every three seconds. Mouse only: on touch screens none of this happens.
 */
type Pointer = { x: number; y: number } | null;
type Listener = (pointer: Pointer, surprised: boolean) => void;
const listeners = new Set<Listener>();
let installed = false;
let pointer: Pointer = null;
let surprised = false;
let surprisedAt = 0;
let lastY = Number.POSITIVE_INFINITY;
let frame = 0;

function emit() {
  frame = 0;
  listeners.forEach((l) => l(pointer, surprised));
}
function schedule() {
  if (!frame) frame = requestAnimationFrame(emit);
}
function setSurprised(on: boolean) {
  if (on === surprised) return;
  if (on) {
    if (Date.now() - surprisedAt < 3000) return;
    surprisedAt = Date.now();
  }
  surprised = on;
}
function install() {
  if (installed) return;
  installed = true;
  window.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType !== "mouse") return;
      pointer = { x: e.clientX, y: e.clientY };
      if (e.clientY <= 40 && e.clientY < lastY) setSurprised(true);
      else if (e.clientY > 120) setSurprised(false);
      lastY = e.clientY;
      schedule();
    },
    { passive: true },
  );
  // Leaving the window: through the top edge is the exit; any way out resets the gaze.
  document.addEventListener("mouseout", (e) => {
    if (e.relatedTarget !== null) return;
    if (e.clientY <= 0) setSurprised(true);
    pointer = null;
    schedule();
  });
  // Coming back calms him down.
  document.addEventListener("mouseover", (e) => {
    if (e.relatedTarget !== null || !surprised) return;
    surprised = false;
    schedule();
  });
}
function watchPointer(l: Listener) {
  install();
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
const clamp = (n: number) => Math.max(-1, Math.min(1, n));

/**
 * The animated Mikee (public/mikee/mikee.riv, state machine "Mikee", view model "Mikee"). The look is a view
 * model instance; the chat's state drives the listening, thinking and talking booleans; cues fire the
 * hello, celebrate and concern triggers. Loaded only in the browser, over the still frame.
 */
export default function MikeeRive({
  look,
  state,
  cue,
  greet,
  interactive,
  track,
  onReady,
}: {
  look: MikeeLook;
  state: MikeeState;
  cue: MikeeCue | null;
  greet: boolean;
  interactive: boolean;
  /** Follows the pointer across the whole screen and reacts to the exit (avatars of 32px and up). */
  track: boolean;
  onReady: () => void;
}) {
  const { rive, canvas, RiveComponent } = useRive({
    src: `/mikee/mikee.riv?v=${MIKEE_ASSET_VERSION}`,
    artboard: "Mikee",
    stateMachine: "Mikee",
    layout: LAYOUT,
    autoplay: true,
    autoBind: false,
    // Hover, click and following the pointer are part of the file; old or tiny avatars stay out of the way.
    shouldDisableRiveListeners: !interactive,
  });
  const vm = useViewModel(rive, { name: "Mikee" });
  const instance = useViewModelInstance(vm, { name: look, rive });

  const listening = useViewModelInstanceBoolean("listening", instance);
  const thinking = useViewModelInstanceBoolean("thinking", instance);
  const talking = useViewModelInstanceBoolean("talking", instance);
  const hello = useViewModelInstanceTrigger("hello", instance);
  const celebrate = useViewModelInstanceTrigger("celebrate", instance);
  const concern = useViewModelInstanceTrigger("concern", instance);
  const lookX = useViewModelInstanceNumber("lookX", instance);
  const lookY = useViewModelInstanceNumber("lookY", instance);
  const surprise = useViewModelInstanceBoolean("surprised", instance);

  // Only a Mikee the visitor can see reacts to the exit.
  const visible = useRef(false);
  useEffect(() => {
    if (!canvas || !track) return;
    const io = new IntersectionObserver(([e]) => (visible.current = e.isIntersecting));
    io.observe(canvas);
    return () => io.disconnect();
  }, [canvas, track]);

  useEffect(() => {
    if (!instance || !canvas || !track) return;
    let wasSurprised = false;
    return watchPointer((p, s) => {
      if (p) {
        const r = canvas.getBoundingClientRect();
        lookX.setValue(clamp((p.x - (r.left + r.width / 2)) / 300));
        lookY.setValue(clamp((p.y - (r.top + r.height / 2)) / 300));
      } else {
        lookX.setValue(0);
        lookY.setValue(0);
      }
      const now = s && visible.current;
      if (now !== wasSurprised) {
        wasSurprised = now;
        surprise.setValue(now);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance, canvas, track]);

  const ready = useRef(false);
  useEffect(() => {
    if (!instance || ready.current) return;
    ready.current = true;
    onReady();
    if (greet) hello.trigger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance]);

  useEffect(() => {
    if (!instance) return;
    listening.setValue(state === "listening");
    thinking.setValue(state === "thinking");
    talking.setValue(state === "talking");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance, state]);

  useEffect(() => {
    if (!instance || !cue) return;
    ({ hello, celebrate, concern })[cue].trigger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance, cue]);

  return <RiveComponent className="absolute inset-0" aria-hidden />;
}
