import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

/**
 * The production driver (postgres-js) cannot send a JS Date inside a raw sql`` template, though the test
 * database (PGlite) can, so tests alone never catch it. Raw templates take dates as ISO text instead.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}

describe("raw SQL", () => {
  it("never interpolates a Date directly", () => {
    const bad: string[] = [];
    for (const f of files("src")) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/sql(?:<[^>]*>)?`([^`]*)`/g)) {
        for (const [, e] of m[1].matchAll(/\$\{([^}]*)\}/g)) {
          if (/\b(since|until|cutoff|date|day|from|to|start|end|before|after|at)\b/i.test(e) && !/toISOString\(\)|^\s*schema\./.test(e)) bad.push(`${f}: \${${e}}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
