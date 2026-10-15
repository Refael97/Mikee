import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { journeyAsText } from "@/lib/journey";
import { updateSettings } from "@/lib/settings";
import { budgetRange, intakeAsText, intakeSchema, type Intake } from "@/lib/intake";
import { createBusiness, NOW } from "./support/setup";

beforeAll(() => vi.useFakeTimers({ toFake: ["Date"], now: NOW }));
afterAll(() => vi.useRealTimers());

const answers = { businessType: "ecommerce", help: ["ads", "content"], adBudget: { min: 3000, max: 5000 }, state: "declining", goals: ["sales", "followers"], knowledge: "basic" };

describe("the questions after signup", () => {
  it("accepts a full set of answers and refuses missing or unknown ones", () => {
    expect(intakeSchema.safeParse(answers).success).toBe(true);
    expect(intakeSchema.safeParse({ ...answers, goals: [] }).success).toBe(false);
    expect(intakeSchema.safeParse({ ...answers, state: "amazing" }).success).toBe(false);
    expect(intakeSchema.safeParse({ ...answers, adBudget: { min: 0, max: 250_000 } }).success).toBe(false);
    expect(intakeSchema.safeParse({ ...answers, adBudget: { min: 6000, max: 5000 } }).success).toBe(false);
  });

  it("asks for words when the answer is other", () => {
    expect(intakeSchema.safeParse({ ...answers, businessType: "other" }).success).toBe(false);
    expect(intakeSchema.safeParse({ ...answers, businessType: "other", businessOther: "מאפייה" }).success).toBe(true);
    expect(intakeSchema.safeParse({ ...answers, help: ["other"] }).success).toBe(false);
  });

  it("reaches Mikee's brief, her own words quoted and the budget marked as a starting point", async () => {
    const ws = await createBusiness();
    const intake: Intake = { ...(answers as Intake), help: ["ads", "other"], helpOther: 'ניוזלטר "חודשי"\nעם הנחה', at: new Date().toISOString() };
    await updateSettings(ws, { intake });
    const text = await journeyAsText(ws);
    expect(text).toContain("What she told us when she signed up");
    expect(text).toContain("ניהול קמפיינים ממומנים");
    expect(text).toContain("3,000 ILS to 5,000 ILS");
    expect(text).toContain("a starting point only");
    expect(text).toContain("ירידה");
    expect(text).toContain("מכירות, עוקבים");
    expect(text).toContain("not the technical side");
    expect(text).not.toContain("\nעם הנחה"); // her words stay on one quoted line
  });

  it("is empty for a business that never answered, and reads a budget saved as one number", () => {
    expect(intakeAsText(undefined)).toBe("");
    expect(budgetRange({ adBudget: 4000 })).toEqual({ min: 4000, max: 4000 });
    expect(budgetRange({ adBudget: { min: 0, max: 2000 } })).toEqual({ min: 0, max: 2000 });
  });
});
