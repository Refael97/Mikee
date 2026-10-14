import { describe, expect, it } from "vitest";
import { SPECIALISTS } from "@/lib/agent/specialists";
import { MIKEE_TOOLS } from "@/lib/agent/run";
import { SILENT_STEPS, stepLabel } from "@/lib/progress";

describe("what the client sees while the work goes on", () => {
  it("says who does what in plain words", () => {
    expect(stepLabel("ask_media_buyer")).toBe("מייקי מפעיל את סוכן הקמפיינים");
    expect(stepLabel("budget_status", "media_buyer")).toBe("סוכן הקמפיינים בודק כמה תקציב פנוי החודש");
    expect(stepLabel("read_results", "analyst")).toBe("סוכן הנתונים מקבל נתונים ממטא");
    expect(stepLabel("propose_video", "video_editor")).toBe("סוכן עריכת הווידאו מכין לך את הסרטון לאישור");
  });

  it("every step Mikee or a specialist can take has its own sentence, never a generic one", () => {
    for (const t of MIKEE_TOOLS.map((x) => x.name)) {
      if (SILENT_STEPS.has(t)) continue;
      expect(stepLabel(t), t).not.toMatch(/בודק עוד פרט/);
    }
    for (const s of SPECIALISTS) for (const t of s.tools) expect(stepLabel(t, s.id), `${s.id} ${t}`).not.toMatch(/^הצוות|עובד על החלק שלו/);
  });
});
