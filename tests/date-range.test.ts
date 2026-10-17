import { describe, expect, it } from "vitest";
import { monthGrid, parseRange, presetRange, rangeLabel, rangeQuery, todayIn } from "@/lib/date-range";

// Saturday, 17 October 2026.
const today = "2026-10-17";

describe("date ranges like Ads Manager", () => {
  it("works out each preset's days, the last N days ending yesterday and the week starting on Sunday", () => {
    expect(presetRange("today", today)).toEqual({ since: today, until: today });
    expect(presetRange("yesterday", today)).toEqual({ since: "2026-10-16", until: "2026-10-16" });
    expect(presetRange("today_yesterday", today)).toEqual({ since: "2026-10-16", until: today });
    expect(presetRange("last_7d", today)).toEqual({ since: "2026-10-10", until: "2026-10-16" });
    expect(presetRange("last_30d", today)).toEqual({ since: "2026-09-17", until: "2026-10-16" });
    expect(presetRange("this_week", today)).toEqual({ since: "2026-10-11", until: today });
    expect(presetRange("last_week", today)).toEqual({ since: "2026-10-04", until: "2026-10-10" });
    expect(presetRange("this_month", today)).toEqual({ since: "2026-10-01", until: today });
    expect(presetRange("last_month", today)).toEqual({ since: "2026-09-01", until: "2026-09-30" });
    expect(presetRange("last_month", "2026-03-05")).toEqual({ since: "2026-02-01", until: "2026-02-28" });
  });

  it("reads the address: a preset, two valid days, or the default when anything is off", () => {
    expect(parseRange({ p: "last_30d" }, today)).toEqual({ preset: "last_30d", since: "2026-09-17", until: "2026-10-16" });
    expect(parseRange({ since: "2026-09-01", until: "2026-09-15" }, today)).toEqual({ since: "2026-09-01", until: "2026-09-15" });
    for (const bad of [
      { since: "2026-09-15", until: "2026-09-01" },
      { since: "2026-10-01", until: "2026-10-20" },
      { since: "2026-02-30", until: "2026-03-01" },
      { since: "x", until: "y" },
      { p: "forever" },
      {},
    ]) {
      expect(parseRange(bad, today)).toEqual({ preset: "last_7d", ...presetRange("last_7d", today) });
    }
  });

  it("writes the range back to the address and labels it in Hebrew", () => {
    expect(rangeQuery({ preset: "last_30d", since: "2026-09-17", until: "2026-10-16" })).toBe("p=last_30d");
    expect(rangeQuery({ since: "2026-09-01", until: "2026-09-15" })).toBe("since=2026-09-01&until=2026-09-15");
    expect(rangeLabel({ preset: "last_30d", since: "2026-09-17", until: "2026-10-16" })).toBe("30 הימים האחרונים: 17 בספט׳ 2026 עד 16 באוק׳ 2026");
    expect(rangeLabel({ since: "2026-10-16", until: "2026-10-16" })).toBe("16 באוק׳ 2026");
  });

  it("lays out a month from Sunday and knows today's date in the business's time zone", () => {
    const oct = monthGrid(2026, 9);
    expect(oct.slice(0, 5)).toEqual([null, null, null, null, "2026-10-01"]); // 1 October 2026 is a Thursday
    expect(oct.filter(Boolean)).toHaveLength(31);
    expect(todayIn("Asia/Jerusalem", new Date("2026-10-16T22:30:00Z"))).toBe("2026-10-17");
  });
});
