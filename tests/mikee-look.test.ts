import { existsSync, readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_LOOK, MIKEE_LOOKS, lookOf } from "@/lib/mikee-look";

describe("Mikee's looks", () => {
  it("every look the client can pick exists in the Rive file and has its still frame", () => {
    const riv = readFileSync("public/mikee/mikee.riv").toString("latin1");
    for (const l of MIKEE_LOOKS) {
      expect(riv).toContain(l.id);
      expect(existsSync(`public/mikee/${l.id}.png`)).toBe(true);
    }
    for (const name of ["listening", "thinking", "talking", "hello", "celebrate", "concern"]) expect(riv).toContain(name);
  });

  it("falls back to the default for a business that never chose or holds an unknown value", () => {
    expect(lookOf({})).toBe(DEFAULT_LOOK);
    expect(lookOf({ mikeeLook: "neon_pink" })).toBe(DEFAULT_LOOK);
    expect(lookOf({ mikeeLook: "deep_burgundy" })).toBe("deep_burgundy");
  });
});
