import { NextResponse } from "next/server";
import { confirmationCode, deleteMetaData, parseSignedRequest } from "@/lib/meta/data-deletion";
import { appPath, sitePath } from "@/app/site/links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Meta's Data Deletion Request Callback: a person asked Facebook to delete what Mikee holds about them.
 * Accepted only with a valid signed_request; answers with a status page and a confirmation code.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const payload = parseSignedRequest(form?.get("signed_request")?.toString());
  if (!payload?.user_id) return NextResponse.json({ error: "invalid signed_request" }, { status: 400 });
  const affected = await deleteMetaData(payload.user_id);
  console.log("[meta] data deletion request", { affected });
  const code = confirmationCode(payload.user_id);
  const base = process.env.SITE_URL ? process.env.SITE_URL.replace(/\/$/, "") : appPath("");
  return NextResponse.json({ url: `${base}${sitePath("/data-deletion")}?code=${code}`, confirmation_code: code });
}
