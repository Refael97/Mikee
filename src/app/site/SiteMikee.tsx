"use client";

import { useState } from "react";
import { MikeeAvatar } from "@/components/MikeeAvatar";
import { MIKEE_LOOKS, type MikeeLook } from "@/lib/mikee-look";

const SWATCH: Record<MikeeLook, string> = {
  ice_blue: "#9fd3e6",
  silver_titanium: "#c9ccd1",
  black_titanium: "#3a3b3e",
  deep_burgundy: "#6b2c3a",
};

/**
 * The hero Mikee: big, follows the pointer, winks on hover (all in the Rive file), and says hello again
 * whenever the visitor picks another of his four looks.
 */
export function SiteMikee() {
  const [look, setLook] = useState<MikeeLook>("ice_blue");
  return (
    <div className="s-mikee">
      <MikeeAvatar key={look} size={240} look={look} greet className="s-mikee-figure" />
      <div className="s-looks" role="radiogroup" aria-label="הצבע של מייקי">
        {MIKEE_LOOKS.map((l) => (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={look === l.id}
            title={l.name}
            onClick={() => setLook(l.id)}
            className="s-look"
            style={{ ["--sw" as string]: SWATCH[l.id] }}
          >
            <span className="sr-only">{l.name}</span>
          </button>
        ))}
      </div>
      <p className="s-looks-label">{MIKEE_LOOKS.find((l) => l.id === look)?.name}</p>
    </div>
  );
}
