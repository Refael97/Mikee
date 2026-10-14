import "server-only";
import { sql } from "drizzle-orm";
import type { z } from "zod";
import { db, schema } from "./db";

/**
 * Checks shared by every API route: the request comes from our own pages, it is not too big, its body has
 * the expected shape, and the caller is within its rate limits.
 */

export class Refused extends Error {
  constructor(
    message: string,
    public status = 400,
    public retryAfter?: number,
  ) {
    super(message);
  }
  response() {
    return Response.json(
      { error: this.message },
      { status: this.status, headers: this.retryAfter ? { "Retry-After": String(this.retryAfter) } : undefined },
    );
  }
}

/** Wraps a route handler so a refusal becomes a clean JSON answer and nothing internal leaks out. */
export function guarded<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (e) {
      if (e instanceof Refused) return e.response();
      console.error("[api]", e);
      return Response.json({ error: "משהו השתבש. נסי שוב בעוד רגע." }, { status: 500 });
    }
  };
}

const appHost = () => {
  try {
    return process.env.APP_URL ? new URL(process.env.APP_URL).host : null;
  } catch {
    return null;
  }
};

/**
 * Cross-site request forgery guard for cookie-authenticated writes: the browser always sends Origin on a
 * POST/PATCH/DELETE, and it must be our own site.
 */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const allowed = new Set([new URL(req.url).host, req.headers.get("host"), appHost()].filter(Boolean) as string[]);
  if (!origin) throw new Refused("Missing origin", 403);
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    throw new Refused("Bad origin", 403);
  }
  if (!allowed.has(host)) throw new Refused("Cross-site request blocked", 403);
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

/** Reads a JSON body with a size cap and validates it. */
export async function readJson<S extends z.ZodType>(req: Request, shape: S, maxBytes = 32 * 1024): Promise<z.infer<S>> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Refused("הבקשה גדולה מדי", 413);
  const text = await req.text();
  if (Buffer.byteLength(text) > maxBytes) throw new Refused("הבקשה גדולה מדי", 413);
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new Refused("Invalid JSON");
  }
  const parsed = shape.safeParse(raw);
  if (!parsed.success) throw new Refused("Invalid request");
  return parsed.data;
}

/**
 * Fixed-window counter in the database, so the limit holds across server instances.
 * Returns false (and how long to wait) when the caller is over the limit.
 */
export async function hit(key: string, limit: number, windowSec: number): Promise<{ ok: boolean; retryAfter: number; count: number }> {
  const now = Math.floor(Date.now() / 1000);
  const window = now - (now % windowSec);
  const d = await db();
  const [row] = await d
    .insert(schema.rateLimits)
    .values({ key, windowStart: window, count: 1 })
    .onConflictDoUpdate({ target: [schema.rateLimits.key, schema.rateLimits.windowStart], set: { count: sql`${schema.rateLimits.count} + 1` } })
    .returning({ count: schema.rateLimits.count });
  if (Math.random() < 0.01) await d.execute(sql`DELETE FROM rate_limits WHERE window_start < ${now - 2 * 86400}`).catch(() => undefined);
  return { ok: row.count <= limit, retryAfter: window + windowSec - now, count: row.count };
}

export async function limit(key: string, max: number, windowSec: number, message = "יותר מדי בקשות. נסי שוב בעוד כמה דקות.") {
  const r = await hit(key, max, windowSec);
  if (!r.ok) throw new Refused(message, 429, r.retryAfter);
}

/** How much one business may do. Generous for a person, tight for a script. */
export const LIMITS = {
  messagesPerMinute: 8,
  messagesPerDay: 300,
  uploadsPerHour: 120,
  approvalsPerMinute: 20,
  supportPerDay: 10,
  loginPerEmail15m: 6,
  loginPerIp15m: 30,
  messageChars: 6000,
  attachmentsPerMessage: 10,
};

/**
 * Text from the client, cleaned before it reaches the model: invisible characters removed, length capped,
 * and anything imitating the platform's own event notes defanged (the model is told those notes come only
 * from the platform, so a client cannot pose as one).
 */
export function cleanClientText(text: string, max = LIMITS.messageChars): string {
  return text
    .normalize("NFC")
    .replace(/[​-‏‪-‮⁠-⁤﻿]/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\[(\s*)(platform event|scheduled check-in|mikee reaching out|system|untrusted)/gi, "($1$2")
    .replace(/<\/?\s*(untrusted|system|instructions?|client[_\s-]*skill)[^>]*>/gi, "")
    .slice(0, max)
    .trim();
}
