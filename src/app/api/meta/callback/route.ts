import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { saveConnection } from "@/lib/connections";
import { discoverAssets } from "@/lib/meta/context";
import { exchangeCode, Graph, inspectToken } from "@/lib/meta/graph";

export async function GET(req: NextRequest) {
  const base = process.env.APP_URL ?? req.nextUrl.origin;
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", base));
  const back = session.workspace.stage === "connect" ? "/onboarding" : "/settings";

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state || state !== req.cookies.get("meta_oauth_state")?.value) {
    return NextResponse.redirect(new URL(`${back}?error=meta_cancelled`, base));
  }
  try {
    const { token, expiresAt } = await exchangeCode(code);
    const info = await inspectToken(token);
    if (info && (!info.valid || info.appId !== process.env.META_APP_ID)) return NextResponse.redirect(new URL(`${back}?error=meta_wrong_app`, base));
    const { me } = await discoverAssets(new Graph(token));
    await saveConnection(
      session.workspace.id,
      "meta",
      { userName: me.name, tokenExpiresAt: info?.expiresAt ?? expiresAt, dataAccessExpiresAt: info?.dataAccessExpiresAt, scopes: info?.scopes, appId: info?.appId },
      token,
    );
    const res = NextResponse.redirect(new URL(back, base));
    res.cookies.delete("meta_oauth_state");
    return res;
  } catch (e) {
    console.error("[meta] connect failed", (e as Error).message);
    return NextResponse.redirect(new URL(`${back}?error=meta_failed`, base));
  }
}
