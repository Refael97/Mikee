import { expect, it } from "vitest";
import { db, schema } from "@/lib/db";
import { listScheduledTasks, scheduleJobTitle, scheduleWhen } from "@/lib/schedule-list";
import { createBusiness } from "./support/setup";

it("names a story and a post in plain Hebrew, with the business clock", () => {
  expect(scheduleJobTitle({ format: "story", channels: ["instagram"] })).toBe("העלאת סטורי לאינסטגרם");
  expect(scheduleJobTitle({ format: "auto", channels: ["instagram"] })).toBe("פרסום באינסטגרם");
  expect(scheduleJobTitle({ format: "auto", channels: ["facebook", "instagram"] })).toBe("פרסום בפייסבוק ובאינסטגרם");
  // 1 Nov 2026 16:00 UTC is 18:00 in Israel (winter clock).
  expect(scheduleWhen("2026-11-01T16:00:00.000Z")).toContain("18:00");
  expect(scheduleWhen("2026-11-01T16:00:00.000Z")).toContain("נובמבר");
});

it("lists only this business's future tasks, soonest first", async () => {
  const ws = await createBusiness();
  const other = await createBusiness();
  const d = await db();
  const row = (workspaceId: string, status: string, at: string, key: string) =>
    d.insert(schema.proposals).values({
      workspaceId,
      kind: "post",
      status,
      versionHash: "v",
      dedupeKey: key,
      month: "2026-11",
      card: { title: "סטורי ליום ראשון" },
      action: { format: "story", channels: ["instagram"], scheduleAt: at, text: "", media: [] },
    });
  await row(ws, "scheduled", "2026-11-02T14:00:00.000Z", "late");
  await row(ws, "scheduled", "2026-11-01T16:00:00.000Z", "early");
  await row(ws, "pending", "2026-11-01T12:00:00.000Z", "waiting");
  await row(ws, "done", "2026-10-01T16:00:00.000Z", "done");
  await row(other, "scheduled", "2026-11-01T16:00:00.000Z", "foreign");

  const tasks = await listScheduledTasks(ws);
  expect(tasks.map((t) => t.title)).toEqual(["העלאת סטורי לאינסטגרם", "העלאת סטורי לאינסטגרם"]);
  expect(tasks[0].when).toContain("18:00");
  expect(tasks[1].when).toContain("16:00");
  expect(await listScheduledTasks(other)).toHaveLength(1);
});
