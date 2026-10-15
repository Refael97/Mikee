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
  useViewModelInstanceTrigger,
} from "@rive-app/react-canvas";
import type { MikeeCue, MikeeState } from "./MikeeAvatar";
import type { MikeeLook } from "@/lib/mikee-look";

// Served from our own origin (scripts/copy-rive-wasm.mjs): the CSP allows no external scripts.
RuntimeLoader.setWasmUrl("/rive/rive.wasm");

const LAYOUT = new Layout({ fit: Fit.Contain, alignment: Alignment.Center });

/**
 * The animated Mikee (public/mikee/mikee.riv, state machine "Mikee", view model "Mikee"). The look is a view
 * model instance; the chat's state drives the listening, thinking and talking booleans; cues fire the
 * hello, celebrate and concern triggers. Loaded only in the browser, over the still frame.
 */
export default function MikeeRive({ look, state, cue, greet, interactive, onReady }: { look: MikeeLook; state: MikeeState; cue: MikeeCue | null; greet: boolean; interactive: boolean; onReady: () => void }) {
  const { rive, RiveComponent } = useRive({
    src: "/mikee/mikee.riv",
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
