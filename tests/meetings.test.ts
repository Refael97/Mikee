import { describe, expect, it } from "vitest";
import { dayLabel, isOpenSlot, israelStamp, meetingDays, slotLabel } from "../src/lib/meetings";

// Tuesday 20 Oct 2026, 08:00 in Israel (05:00 UTC, IDT is UTC+3)
const now = new Date("2026-10-20T05:00:00Z");

describe("intro meeting slots", () => {
  it("reads the clock in Israel time", () => {
    expect(israelStamp(now)).toBe("2026-10-20 08:00");
  });

  it("offers Sunday to Thursday only, at least 12 hours ahead", () => {
    const days = meetingDays(now);
    // 08:00 + 12 hours is 20:00, after the last hour, so today is gone and Wednesday starts at 09:00
    expect(days[0].date).toBe("2026-10-21");
    expect(days[0].slots[0]).toBe("2026-10-21 09:00");
    const later = meetingDays(new Date("2026-10-20T19:30:00Z")); // 22:30, so Wednesday opens from 10:30
    expect(later[0].slots[0]).toBe("2026-10-21 11:00");
    const dates = days.map((d) => d.date);
    expect(dates).not.toContain("2026-10-23"); // Friday
    expect(dates).not.toContain("2026-10-24"); // Saturday
    expect(dates).toContain("2026-10-25"); // Sunday
  });

  it("hides taken hours and rejects them", () => {
    const taken = ["2026-10-21 10:00"];
    const wed = meetingDays(now, taken).find((d) => d.date === "2026-10-21")!;
    expect(wed.slots).not.toContain("2026-10-21 10:00");
    expect(wed.slots).toContain("2026-10-21 11:00");
    expect(isOpenSlot("2026-10-21 10:00", now, taken)).toBe(false);
    expect(isOpenSlot("2026-10-21 11:00", now, taken)).toBe(true);
    expect(isOpenSlot("2026-10-23 10:00", now)).toBe(false);
    expect(isOpenSlot("2026-10-21 10:30", now)).toBe(false);
  });

  it("labels days and slots in Hebrew", () => {
    expect(dayLabel("2026-10-20")).toBe("יום שלישי 20.10");
    expect(slotLabel("2026-10-21 10:00")).toBe("יום רביעי 21.10 בשעה 10:00");
  });
});
