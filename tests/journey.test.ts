import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { journeyAsText, journeyStatus } from "@/lib/journey";
import { runTool } from "@/lib/agent/tools";
import { dueNudges } from "@/lib/proactive";
import { businessBrief } from "@/lib/agent/brief";
import { createBusiness, NOW, TZ } from "./support/setup";

beforeAll(() => vi.useFakeTimers({ toFake: ["Date"], now: NOW }));
afterAll(() => vi.useRealTimers());

describe("the marketing path", () => {
  it("starts from what the platform can see, and shows only universal steps until the business type is known", async () => {
    const ws = await createBusiness();
    const j = await journeyStatus(ws);
    const items = j.phases.flatMap((p) => p.items);
    expect(items.find((i) => i.id === "tracking")?.status).toBe("done"); // the pixel is connected
    expect(items.some((i) => i.id === "catalog_ads")).toBe(false);
    expect(j.currentPhase).toBe("foundations");
    expect(j.nextUp.length).toBeGreaterThan(0);
  });

  it("Mikee keeps it current: steps, focus and business type", async () => {
    const ws = await createBusiness();
    const ctx = { workspaceId: ws, tz: TZ };
    await runTool(ctx, "update_journey", {
      businessType: "ecommerce",
      focus: "למכור את קולקציית החורף",
      items: [
        { id: "profile", status: "done" },
        { id: "offer", status: "done" },
        { id: "catalog", status: "skipped", note: "אין קטלוג בינתיים" },
        { id: "first_campaign", status: "active", note: "קמפיין מכירות לקולקציה" },
        { id: "retargeting", status: "next" },
      ],
    });
    const j = await journeyStatus(ws);
    expect(j.businessType).toBe("ecommerce");
    expect(j.focus?.text).toBe("למכור את קולקציית החורף");
    expect(j.currentPhase).toBe("reach");
    expect(j.nextUp[0].id).toBe("retargeting");
    expect(j.phases.flatMap((p) => p.items).some((i) => i.id === "catalog_ads")).toBe(true); // e-commerce steps appear

    const text = await journeyAsText(ws);
    expect(text).toContain("למכור את קולקציית החורף");
    expect(text).toContain("first_campaign");
    expect(await businessBrief(ws, TZ)).toContain("Where the business stands on its marketing path");
  });

  it("refuses steps that do not exist", async () => {
    const ws = await createBusiness();
    const r = await runTool({ workspaceId: ws, tz: TZ }, "update_journey", { items: [{ id: "hack_the_planet", status: "done" }] });
    expect(r.isError).toBe(true);
  });

  it("after a few quiet days with nothing waiting, Mikee suggests the next step", async () => {
    const ws = await createBusiness();
    const d = await db();
    await d.update(schema.workspaces).set({ createdAt: new Date(NOW.getTime() - 20 * 86_400_000) }).where(eq(schema.workspaces.id, ws));
    const due = await dueNudges(ws, TZ, NOW);
    const next = due.find((n) => n.kind === "next_step");
    expect(next?.title).toMatch(/^הצעד הבא/);
    expect(next?.mayStaySilent).toBe(true);
    // Not on the first days with Mikee.
    const fresh = await createBusiness();
    expect((await dueNudges(fresh, TZ, NOW)).some((n) => n.kind === "next_step")).toBe(false);
  });
});
