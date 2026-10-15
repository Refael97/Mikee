import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { saveConnection } from "@/lib/connections";
import { discoverAssets } from "@/lib/meta/context";
import { clientBusinessId, exchangeCode, Graph, inspectToken } from "@/lib/meta/graph";
import { logConnectDiagnosis } from "@/lib/meta/diagnose";

/**
 * The connection is kept even when Meta leaves permissions out (pages and Instagram still work); the screen
 * then says exactly what is missing. Ads and business permissions on a business integration come only with
 * an ad account chosen in Facebook's window, so that is what the notice asks for.
 */
function missingNotice(scopes: string[]) {
  const has = (s: string) => scopes.includes(s);
  if (!has("ads_read") || !has("ads_management")) return "?notice=meta_missing_ads";
  if (!has("business_management")) return "?notice=meta_missing_business";
  return "";
}

export async function GET(req: NextRequest) {
  const base = process.env.APP_URL ?? req.nextUrl.origin;
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", base));
  const back = session.workspace.stage === "connect" ? "/onboarding" : "/settings";

  const q = req.nextUrl.searchParams;
  // Facebook reports a refusal or a problem on the redirect itself (docs: manual login flow).
  if (q.get("error")) {
    console.warn("[meta] login returned", q.get("error"), q.get("error_reason"), q.get("error_description")?.slice(0, 200));
    return NextResponse.redirect(new URL(`${back}?error=${q.get("error") === "access_denied" ? "meta_cancelled" : "meta_failed"}`, base));
  }
  const code = q.get("code");
  const state = q.get("state");
  if (!code || !state || state !== req.cookies.get("meta_oauth_state")?.value) {
    return NextResponse.redirect(new URL(`${back}?error=meta_cancelled`, base));
  }
  try {
    const { token, expiresAt } = await exchangeCode(code);
    const info = await inspectToken(token);
    const businessId = info?.type === "SYSTEM_USER" ? await clientBusinessId(token) : null;
    // What Meta granted and what each asset read answers, in the log, whether or not the connection works.
    await logConnectDiagnosis(token, info, businessId).catch((e) => console.warn("[meta] diagnosis failed", (e as Error).message));
    if (!info || !info.valid || info.appId !== process.env.META_APP_ID) return NextResponse.redirect(new URL(`${back}?error=meta_wrong_app`, base));
    const { me, problems } = await discoverAssets(new Graph(token));
    if (problems.length) console.warn("[meta] connected with gaps", problems.join(" | "));
    await saveConnection(
      session.workspace.id,
      "meta",
      {
        userName: me.name,
        // Who connected, so a deletion or deauthorize request from Meta finds this connection.
        metaUserId: info.userId ?? me.id,
        personId: me.id,
        tokenExpiresAt: info.expiresAt ?? expiresAt,
        dataAccessExpiresAt: info.dataAccessExpiresAt,
        scopes: info.scopes,
        appId: info.appId,
        tokenType: info.type,
        clientBusinessId: businessId ?? undefined,
      },
      token,
    );
    const res = NextResponse.redirect(new URL(`${back}${missingNotice(info.scopes)}`, base));
    res.cookies.delete("meta_oauth_state");
    return res;
  } catch (e) {
    console.error("[meta] connect failed", (e as Error).message);
    return NextResponse.redirect(new URL(`${back}?error=meta_failed`, base));
  }
}
