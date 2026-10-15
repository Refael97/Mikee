import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { isLook, type MikeeLook } from "./mikee-look";

/** Saves the user's colour for Mikee. Anything but the four names in mikee.riv is refused. */
export async function setUserTheme(userId: string, theme: unknown): Promise<{ ok: true; theme: MikeeLook } | { ok: false; error: string }> {
  if (!isLook(theme)) return { ok: false, error: "הצבע הזה לא קיים." };
  const d = await db();
  await d.update(schema.users).set({ mikeeTheme: theme }).where(eq(schema.users.id, userId));
  return { ok: true, theme };
}
