import { deauthorize, parseSignedRequest } from "@/lib/meta/data-deletion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Meta's Deauthorize Callback: the person removed Mikee from their Facebook settings. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const payload = parseSignedRequest(form?.get("signed_request")?.toString());
  if (!payload?.user_id) return new Response("Bad request", { status: 400 });
  const affected = await deauthorize(payload.user_id);
  console.log("[meta] deauthorized", { affected });
  return new Response("OK");
}
