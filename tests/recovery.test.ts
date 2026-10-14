import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { verifyPassword } from "@/lib/crypto";
import { resetPassword } from "@/lib/recovery";
import { registerBusiness } from "@/lib/signup";
import { findUserByLogin, usernameProblem } from "@/lib/username";

let n = 0;
const account = async () => {
  n++;
  const r = await registerBusiness({ username: `rachel${n}`, email: `r${n}@example.com`, password: "first-pass-123", confirm: "first-pass-123", ip: `10.9.0.${n}` });
  if (!r.ok) throw new Error(r.error);
  return { ...r, username: `rachel${n}`, email: `r${n}@example.com` };
};
const reset = (o: Partial<Parameters<typeof resetPassword>[0]>) => resetPassword({ login: "", password: "brand-new-pass-1", ip: `10.8.0.${++n}`, ...o });

describe("usernames", () => {
  it("are unique ignoring case, follow the shape, and sign in like an email", async () => {
    const a = await account();
    const again = await registerBusiness({ username: a.username.toUpperCase(), email: `other${n}@example.com`, password: "first-pass-123", confirm: "first-pass-123", ip: "10.7.0.1" });
    expect(again).toMatchObject({ ok: false, error: expect.stringMatching(/תפוס/) });
    expect(usernameProblem("ab")).toBeTruthy();
    expect(usernameProblem("1rachel")).toBeTruthy();
    expect(usernameProblem("admin")).toMatch(/שמור/);
    expect(usernameProblem("rachel.sitbon_1")).toBeNull();
    expect((await findUserByLogin(a.username.toUpperCase()))?.id).toBe(a.userId);
    expect((await findUserByLogin(a.email))?.id).toBe(a.userId);
  });
});

describe("forgot password (pilot): a username and a new password", () => {
  it("sets the new password right away and signs out other devices", async () => {
    const a = await account();
    const r = await reset({ login: a.username.toUpperCase() });
    expect(r.ok).toBe(true);
    const d = await db();
    const u = (await d.query.users.findFirst({ where: eq(schema.users.id, a.userId) }))!;
    expect(verifyPassword("brand-new-pass-1", u.passwordHash)).toBe(true);
    expect(u.sessionVersion).toBe(a.sessionVersion + 1);
  });

  it("says so when there is no such user, and still asks for a reasonable password", async () => {
    const a = await account();
    expect(await reset({ login: "nobody-here" })).toMatchObject({ ok: false, error: expect.stringMatching(/לא מצאנו/) });
    expect(await reset({ login: a.email, password: "short" })).toMatchObject({ ok: false });
  });

  it("is rate limited", async () => {
    const ip = "10.6.6.6";
    const results = [];
    for (let i = 0; i < 21; i++) results.push(await reset({ login: `ghost${i}`, ip }));
    expect(results[20]).toMatchObject({ ok: false, error: expect.stringMatching(/יותר מדי/) });
  });
});
