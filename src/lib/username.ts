import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "./db";

/** A sign-in name: 3-30 characters, starts with a letter, then letters, digits, dot or underscore. Case-insensitive. */
const SHAPE = /^[a-z][a-z0-9._]{2,29}$/;
const RESERVED = new Set(["admin", "administrator", "root", "mikee", "support", "help", "api", "login", "signup", "account", "settings", "system", "meta", "facebook", "instagram", "null", "undefined"]);

export const cleanUsername = (raw: string) => raw.trim().toLowerCase().slice(0, 40);

export function usernameProblem(raw: string): string | null {
  const u = cleanUsername(raw);
  if (!SHAPE.test(u)) return "שם משתמש: 3 עד 30 תווים באנגלית, מתחיל באות, ומותר גם ספרות, נקודה וקו תחתון.";
  if (RESERVED.has(u) || /\.\.|^\.|\.$/.test(u)) return "שם המשתמש הזה שמור. אפשר לבחור אחר.";
  return null;
}

export async function usernameTaken(raw: string, exceptUserId?: string): Promise<boolean> {
  const d = await db();
  const row = await d.query.users.findFirst({ where: sql`lower(${schema.users.username}) = ${cleanUsername(raw)}`, columns: { id: true } });
  return !!row && row.id !== exceptUserId;
}

/** Finds a user by email (anything with @) or by username. */
export async function findUserByLogin(identifier: string) {
  const id = identifier.trim().toLowerCase().slice(0, 200);
  if (!id) return undefined;
  const d = await db();
  return id.includes("@")
    ? d.query.users.findFirst({ where: eq(schema.users.email, id) })
    : d.query.users.findFirst({ where: sql`lower(${schema.users.username}) = ${cleanUsername(id)}` });
}
