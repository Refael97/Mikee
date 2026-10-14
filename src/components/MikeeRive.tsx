"use client";

import { Alignment, Fit, Layout, RuntimeLoader, useRive, type ViewModelInstance } from "@rive-app/react-canvas";
import { useEffect, useState } from "react";
import type { MikeeCue, MikeeState } from "./MikeeAvatar";

// Our CSP allows no CDN: the runtime is served from our own origin.
RuntimeLoader.setWasmUrl("/rive/rive.wasm");

const MODES = ["listening", "thinking", "talking"] as const;
const LAYOUT = new Layout({ fit: Fit.Contain, alignment: Alignment.Center });

/** The animated character (public/rive/mikee.riv, artboard and state machine "Mikee"). Loaded only in the browser. */
export default function MikeeRive({ state, cues, greet, onReady }: { state: MikeeState; cues: boolean; greet: boolean; onReady: () => void }) {
  const { rive, RiveComponent } = useRive({ src: "/rive/mikee.riv", artboard: "Mikee", stateMachine: "Mikee", autoplay: true, autoBind: false, layout: LAYOUT });
  const [vm, setVm] = useState<ViewModelInstance | null>(null);

  useEffect(() => {
    if (!rive) return;
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const instance = rive.viewModelByName("Mikee")?.instanceByName(dark ? "dark" : "light") ?? null;
    if (instance) rive.bindViewModelInstance(instance);
    setVm(instance);
    onReady();
    if (greet) instance?.trigger("hello")?.trigger();
    // onReady and greet matter only on the first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rive]);

  useEffect(() => {
    if (!vm) return;
    for (const mode of MODES) {
      const input = vm.boolean(mode);
      if (input) input.value = state === mode;
    }
  }, [vm, state]);

  useEffect(() => {
    if (!vm || !cues) return;
    const react = (e: Event) => vm.trigger((e as CustomEvent<MikeeCue>).detail)?.trigger();
    window.addEventListener("mikee:cue", react);
    return () => window.removeEventListener("mikee:cue", react);
  }, [vm, cues]);

  return <RiveComponent className="absolute inset-0" />;
}
