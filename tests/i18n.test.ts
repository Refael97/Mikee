import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { en } from "@/lib/i18n/en";
import { dirOf, isLang, localeOf, translate, translator } from "@/lib/i18n";
import { RANGE_PRESETS, longDate, rangeLabel, shortDate } from "@/lib/date-range";
import { AUTONOMY } from "@/lib/autonomy";
import { KPIS } from "@/lib/dashboard";
import { CONNECTORS } from "@/lib/connectors";
import { GUIDANCE, GUIDANCE_INCLUDES, PLANS } from "@/lib/plans";
import { MIKEE_LOOKS } from "@/lib/mikee-look";
import { BUSINESS, GOALS, HELP, KNOWLEDGE, STATE } from "@/lib/intake";
import { ITEMS, PHASES } from "@/lib/journey";
import { ACTIONS, AGENT_NAMES, stepLabel, stepText } from "@/lib/progress";
import { scheduleJobTitle } from "@/lib/schedule-list";

const SRC = join(__dirname, "..", "src");
const HEBREW = /[\u05D0-\u05EA]/;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Every literal key passed to t("…") anywhere in the source. */
function usedKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  for (const file of walk(SRC)) {
    if (file.endsWith("lib/i18n/en.ts")) continue;
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) keys.set(JSON.parse(`"${m[1]}"`), file.slice(SRC.length + 1));
  }
  return keys;
}

describe("interface language", () => {
  it("knows the two languages, their direction and locale", () => {
    expect(isLang("he") && isLang("en")).toBe(true);
    expect(isLang("fr")).toBe(false);
    expect(dirOf("he")).toBe("rtl");
    expect(dirOf("en")).toBe("ltr");
    expect(localeOf("he")).toBe("he-IL");
    expect(localeOf("en")).toBe("en-GB");
  });

  it("returns the Hebrew itself in Hebrew, the English in English, and fills placeholders", () => {
    expect(translate("he", "שמירה")).toBe("שמירה");
    expect(translate("en", "שמירה")).toBe("Save");
    expect(translate("en", "מודעה {i} מתוך {n}", { i: 2, n: 5 })).toBe("Ad 2 of 5");
    expect(translate("he", "מודעה {i} מתוך {n}", { i: 2, n: 5 })).toBe("מודעה 2 מתוך 5");
    // A key without English falls back to the Hebrew, so a missing entry never shows an empty label.
    expect(translate("en", "טקסט שאין לו תרגום")).toBe("טקסט שאין לו תרגום");
    expect(translator("en")("יציאה")).toBe("Sign out");
  });

  it("has English for every string the interface passes to t()", () => {
    const missing = [...usedKeys()].filter(([k]) => !(k in en)).map(([k, f]) => `${f}: ${k}`);
    expect(missing).toEqual([]);
  });

  it("has English for the labels the interface takes from the library modules", () => {
    const labels = [
      ...RANGE_PRESETS.map((p) => p.label),
      ...AUTONOMY.flatMap((a) => [a.label, a.short, a.description]),
      ...Object.values(KPIS).flatMap((k) => [k.label, k.hint]),
      ...CONNECTORS.flatMap((c) => [c.name, c.does]),
      ...Object.values(PLANS()).map((p) => p.name),
      ...Object.values(GUIDANCE).map((g) => g.name),
      ...GUIDANCE_INCLUDES,
      ...MIKEE_LOOKS.map((l) => l.name),
      ...[...BUSINESS, ...HELP, ...STATE, ...GOALS, ...KNOWLEDGE].flatMap((o) => [o.title, o.sub]),
      ...PHASES.flatMap((p) => [p.title, p.hint]),
      ...ITEMS.flatMap((s) => [s.title, s.why]),
      ...Object.values(AGENT_NAMES),
      scheduleJobTitle({ format: "story" }),
      scheduleJobTitle({ channels: ["instagram", "facebook"] }),
      scheduleJobTitle({}),
    ].filter((s) => HEBREW.test(s));
    const missing = labels.filter((s) => !(s in en));
    expect(missing).toEqual([]);
  });

  it("translates composed step labels actor by actor, and leaves them alone in Hebrew", () => {
    const en = translator("en");
    const he = translator("he");
    expect(stepText(stepLabel("scan_website"), en)).toBe("Mikee is reading the website");
    expect(stepText(stepLabel("budget_status", "media_buyer"), en)).toBe("Campaigns agent is checking how much budget is free this month");
    expect(stepText(stepLabel("ask_copywriter"), en)).toBe("Mikee is bringing in the copy agent");
    expect(stepText(stepLabel("scan_website"), he)).toBe("מייקי קורא את האתר");
    const leftover = Object.keys(ACTIONS)
      .flatMap((tool) => [stepLabel(tool), stepLabel(tool, "analyst"), stepLabel(tool, "unknown_agent")])
      .filter((label) => HEBREW.test(stepText(label, en)));
    expect(leftover).toEqual([]);
  });

  it("never leaves Hebrew in an English value or a placeholder behind", () => {
    const bad = Object.entries(en).filter(([k, v]) => HEBREW.test(v) || (k.match(/\{\w+\}/g) ?? []).some((p) => !v.includes(p)));
    expect(bad).toEqual([]);
  });

  it("writes dates and range labels in the interface language", () => {
    expect(shortDate("2026-10-17")).toBe("17 באוק׳ 2026");
    expect(shortDate("2026-10-17", "en")).toBe("17 Oct 2026");
    expect(longDate("2026-10-17", "en")).toBe("17 October 2026");
    expect(rangeLabel({ preset: "last_7d", since: "2026-10-10", until: "2026-10-16" }, "en")).toBe("Last 7 days: 10 Oct 2026 to 16 Oct 2026");
    expect(rangeLabel({ preset: "maximum", since: "2023-01-01", until: "2026-10-17" }, "en")).toBe("Maximum");
    expect(rangeLabel({ since: "2026-10-01", until: "2026-10-01" })).toBe("1 באוק׳ 2026");
  });
});
