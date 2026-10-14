import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { verifyPassword } from "@/lib/crypto";
import { createRecoveryCode, resetWithCode } from "@/lib/recovery";
import { registerBusiness } from "@/lib/signup";
import { findUserByLogin, usernameProblem } from "@/lib/username";

let n = 0;
const account = async () => {
  n++;
  const r = await registerBusiness({ username: `rachel${n}`, email: `r${n}@example.com`, password: "first-pass-123", confirm: "first-pass-123", ip: `10.9.0.${n}` });
  if (!r.ok) throw new Error(r.error);
  return { ...r, username: `rachel${n}`, email: `r${n}@example.com` };
};
const reset = (o: Partial<Parameters<typeof resetWithCode>[0]>) =>
  resetWithCode({ email: "", code: "", password: "brand-new-pass-1", confirm: "brand-new-pass-1", ip: `10.8.0.${++n}`, ...o });
afterEach(() => {
  delete process.env.MIKEE_RESET_CODE;
});

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

describe("forgot password, without email but never without proof", () => {
  it("the personal recovery code resets the password once, signs out other devices, and is used up", async () => {
    const a = await account();
    const code = await createRecoveryCode(a.userId);
    expect(code).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    const r = await reset({ email: a.username, code: code.toLowerCase().replace(/-/g, " ") });
    expect(r.ok).toBe(true);
    const d = await db();
    const u = (await d.query.users.findFirst({ where: eq(schema.users.id, a.userId) }))!;
    expect(verifyPassword("brand-new-pass-1", u.passwordHash)).toBe(true);
    expect(u.sessionVersion).toBe(a.sessionVersion + 1);
    expect(u.recoveryHash).toBeNull();
    expect((await reset({ email: a.email, code })).ok).toBe(false);
  });

  it("knowing the email alone is never enough", async () => {
    const a = await account();
    expect(await reset({ email: a.email, code: "" })).toMatchObject({ ok: false });
    expect(await reset({ email: a.email, code: "AAAA-BBBB-CCCC-DDDD" })).toMatchObject({ ok: false, error: expect.stringMatching(/לא נכונים/) });
    expect(await reset({ email: "nobody@example.com", code: "AAAA-BBBB-CCCC-DDDD" })).toMatchObject({ ok: false, error: expect.stringMatching(/לא נכונים/) });
  });

  it("the platform owner's code works for anyone, and only when it is long enough", async () => {
    const a = await account();
    process.env.MIKEE_RESET_CODE = "short";
    expect((await reset({ email: a.email, code: "short" })).ok).toBe(false);
    process.env.MIKEE_RESET_CODE = "OWNER-CODE-1234-5678";
    expect((await reset({ email: a.username, code: "owner-code-1234-5678" })).ok).toBe(true);
  });

  it("stops guessing after a few tries", async () => {
    const a = await account();
    const ip = "10.6.6.6";
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await reset({ email: a.email, code: `WRONG-${i}`, ip }));
    expect(results[5]).toMatchObject({ ok: false, error: expect.stringMatching(/יותר מדי/) });
  });
});
