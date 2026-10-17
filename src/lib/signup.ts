import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { hashPassword, passwordProblem } from "./crypto";
import { cleanClientText, hit } from "./guard";
import { logActivity } from "./activity";
import { cleanUsername, usernameProblem, usernameTaken } from "./username";

/**
 * Who may open a new business account: anyone (with per-network and daily limits), unless MIKEE_SIGNUP=closed.
 */
export type SignupMode = "open" | "closed";

export function signupMode(): SignupMode {
  return process.env.MIKEE_SIGNUP?.trim().toLowerCase() === "closed" ? "closed" : "open";
}

export const SIGNUP_LIMITS = { perIpHour: 20, perIpDay: 50, globalDay: Number(process.env.MIKEE_SIGNUP_DAILY_CAP) || 50 };

export type SignupInput = { username: string; email: string; password: string; confirm?: string; business?: string; name?: string; website?: string; ip: string; /** The version of the terms the owner ticked, recorded with the account. */ terms?: string };
export type SignupResult = { ok: true; userId: string; sessionVersion: number; workspaceId: string } | { ok: false; error: string };

const EMAIL = /^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}$/i;

/**
 * Opens a new business and its owner. Every field is capped and cleaned, the password must be strong, and the
 * same answer is given for an email that is taken as for one that is not accepted, so the form cannot be used
 * to find out who has an account.
 */
export async function registerBusiness(input: SignupInput): Promise<SignupResult> {
  const mode = signupMode();
  if (mode === "closed") return { ok: false, error: "ההרשמה סגורה כרגע. אפשר לפנות אלינו ונפתח לך חשבון." };
  // A field people never see; bots fill it.
  if (input.website) return { ok: false, error: "לא הצלחנו לפתוח את החשבון. אפשר לנסות שוב." };

  const [hour, day, all] = await Promise.all([
    hit(`signup:ip:h:${input.ip}`, SIGNUP_LIMITS.perIpHour, 3600),
    hit(`signup:ip:d:${input.ip}`, SIGNUP_LIMITS.perIpDay, 86400),
    hit("signup:all", SIGNUP_LIMITS.globalDay, 86400),
  ]);
  if (!hour.ok || !day.ok) return { ok: false, error: "נפתחו יותר מדי חשבונות מהרשת הזו. אפשר לנסות שוב מאוחר יותר." };
  if (!all.ok) return { ok: false, error: "ההרשמה עמוסה היום. אפשר לנסות שוב מחר, או לפנות אלינו." };

  const username = cleanUsername(input.username);
  const badName = usernameProblem(username);
  if (badName) return { ok: false, error: badName };
  // Business and personal names are optional here; they can be filled in later (profile, the business page).
  const name = cleanClientText(input.name ?? "", 80).replace(/\s+/g, " ") || username;
  const business = cleanClientText(input.business ?? "", 80).replace(/\s+/g, " ") || `העסק של ${username}`;
  const email = input.email.trim().toLowerCase().slice(0, 200);
  if (!EMAIL.test(email)) return { ok: false, error: "כתובת האימייל לא נראית תקינה." };
  if (input.confirm !== undefined && input.password !== input.confirm) return { ok: false, error: "הסיסמאות לא זהות." };
  const weak = passwordProblem(input.password);
  if (weak) return { ok: false, error: weak };

  const taken = "לא הצלחנו לפתוח חשבון עם הפרטים האלה. אם כבר יש לך חשבון, אפשר להיכנס או לאפס סיסמה דרך התמיכה.";
  const hash = hashPassword(input.password); // before the lookup, so a taken email takes as long as a new one
  const d = await db();
  if (await usernameTaken(username)) return { ok: false, error: "שם המשתמש תפוס. אפשר לנסות אחר." };
  if (await d.query.users.findFirst({ where: eq(schema.users.email, email), columns: { id: true } })) return { ok: false, error: taken };

  try {
    const created = await d.transaction(async (tx) => {
      const [ws] = await tx.insert(schema.workspaces).values({ name: business }).returning();
      const [user] = await tx.insert(schema.users).values({ workspaceId: ws.id, email, username, name, passwordHash: hash }).returning();
      return { ws, user };
    });
    await logActivity(created.ws.id, "security", "החשבון נפתח", { ip: input.ip, ...(input.terms ? { termsAccepted: input.terms, termsAcceptedAt: new Date().toISOString() } : {}) });
    return { ok: true, userId: created.user.id, sessionVersion: created.user.sessionVersion, workspaceId: created.ws.id };
  } catch (e) {
    if (/username/i.test(String((e as Error)?.message ?? e))) return { ok: false, error: "שם המשתמש תפוס. אפשר לנסות אחר." };
    if (/unique|duplicate/i.test(String((e as Error)?.message ?? e))) return { ok: false, error: taken };
    throw e;
  }
}
