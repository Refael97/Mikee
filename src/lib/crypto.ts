import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from "crypto";

function key(): Buffer {
  const hex = process.env.MIKEE_ENCRYPTION_KEY;
  if (!hex || hex.length < 64) throw new Error("MIKEE_ENCRYPTION_KEY must be 32 bytes of hex");
  return Buffer.from(hex.slice(0, 64), "hex");
}

/** AES-256-GCM. Output: iv.tag.ciphertext (base64url). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(sealed: string): string {
  const [iv, tag, data] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash || hash.length !== 128) return false;
  const actual = scryptSync(password.slice(0, 256), Buffer.from(salt, "hex"), 64);
  return timingSafeEqual(actual, Buffer.from(hash, "hex"));
}

/** Used when the email does not exist, so a wrong email takes as long as a wrong password. */
export const DUMMY_HASH = `${"0".repeat(32)}:${"0".repeat(128)}`;

/** A password strong enough for an account that can spend money on ads. */
export function passwordProblem(password: string): string | null {
  if (password.length < 10) return "הסיסמה צריכה להיות באורך 10 תווים לפחות";
  if (password.length > 200) return "הסיסמה ארוכה מדי";
  if (/^(.)\1+$/.test(password) || /^(0123456789|1234567890|password|qwerty)/i.test(password)) return "הסיסמה קלה מדי לניחוש";
  return null;
}
