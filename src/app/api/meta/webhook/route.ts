import { timingSafeEqual } from "crypto";
import { ingest, validSignature } from "@/lib/instagram/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 512 * 1024;

/** Meta's subscription check: echoes the challenge only when the verify token matches META_WEBHOOK_VERIFY_TOKEN. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN ?? "";
  const given = q.get("hub.verify_token") ?? "";
  const match = !!expected && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (q.get("hub.mode") !== "subscribe" || !match) return new Response("Forbidden", { status: 403 });
  return new Response(q.get("hub.challenge") ?? "", { headers: { "Content-Type": "text/plain" } });
}

/** Message events, accepted only with a valid signature from Meta (no cookies, so no same-origin check applies). */
export async function POST(req: Request) {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return new Response("Too large", { status: 413 });
  const raw = await req.text();
  if (raw.length > MAX_BYTES) return new Response("Too large", { status: 413 });
  if (!validSignature(raw, req.headers.get("x-hub-signature-256"))) return new Response("Bad signature", { status: 401 });
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  try {
    await ingest(payload as Parameters<typeof ingest>[0]);
  } catch (e) {
    // Meta retries a failed delivery; stored messages are not stored twice.
    console.error("[instagram] webhook", e);
    return new Response("Error", { status: 500 });
  }
  return new Response("EVENT_RECEIVED");
}
