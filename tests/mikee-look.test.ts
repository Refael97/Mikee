import { existsSync, readFileSync } from "fs";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "@/lib/db";
import { DEFAULT_LOOK, MIKEE_LOOKS, lookOf } from "@/lib/mikee-look";
import { setUserTheme } from "@/lib/mikee-theme";
import { createBusiness } from "./support/setup";

async function user() {
  const ws = await createBusiness();
  const d = await db();
  const [u] = await d
    .insert(schema.users)
    .values({ workspaceId: ws, email: `theme-${Math.random().toString(36).slice(2)}@example.com`, name: "נועה", passwordHash: "x" })
    .returning();
  return u;
}

describe("Mikee's colours", () => {
  it("every colour the user can pick, and every state the app drives, exists in the Rive file; each colour has its still frame", () => {
    const riv = readFileSync("public/mikee/mikee.riv").toString("latin1");
    for (const l of MIKEE_LOOKS) {
      expect(riv).toContain(l.id);
      expect(existsSync(`public/mikee/${l.id}.png`)).toBe(true);
    }
    for (const name of ["listening", "thinking", "talking", "surprised", "hello", "celebrate", "concern", "lookX", "lookY"]) expect(riv).toContain(name);
  });

  it("a new user starts with ice blue, and a saved colour is kept", async () => {
    const u = await user();
    expect(u.mikeeTheme).toBe(DEFAULT_LOOK);
    expect(await setUserTheme(u.id, "deep_burgundy")).toEqual({ ok: true, theme: "deep_burgundy" });
    const d = await db();
    const row = await d.query.users.findFirst({ where: eq(schema.users.id, u.id) });
    expect(row?.mikeeTheme).toBe("deep_burgundy");
  });

  it("refuses anything but the four names, including the file's unused instances", async () => {
    const u = await user();
    for (const bad of ["light", "dark", "Instance", "neon_pink", "", null, 3]) expect((await setUserTheme(u.id, bad)).ok).toBe(false);
    const d = await db();
    expect((await d.query.users.findFirst({ where: eq(schema.users.id, u.id) }))?.mikeeTheme).toBe(DEFAULT_LOOK);
  });

  it("falls back to ice blue for a missing or unknown value", () => {
    expect(lookOf(undefined)).toBe(DEFAULT_LOOK);
    expect(lookOf("neon_pink")).toBe(DEFAULT_LOOK);
    expect(lookOf("black_titanium")).toBe("black_titanium");
  });
});
