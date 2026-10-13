import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { saveConnection } from "@/lib/connections";
import { discoverAssets } from "@/lib/meta/context";
import { exchangeCode, Graph } from "@/lib/meta/graph";

export async function GET(req: NextRequest) {
  const base = process.env.APP_URL ?? req.nextUrl.origin;
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", base));
  const back = session.workspace.stage === "connect" ? "/onboarding" : "/settings";

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state || state !== req.cookies.get("meta_oauth_state")?.value) {
    return NextResponse.redirect(new URL(`${back}?error=${encodeURIComponent("החיבור לפייסבוק בוטל או פג. נסי שוב.")}`, base));
  }
  try {
    const { token, expiresAt } = await exchangeCode(code);
    const { me } = await discoverAssets(new Graph(token));
    await saveConnection(session.workspace.id, "meta", { userName: me.name, tokenExpiresAt: expiresAt }, token);
    const res = NextResponse.redirect(new URL(back, base));
    res.cookies.delete("meta_oauth_state");
    return res;
  } catch (e) {
    return NextResponse.redirect(new URL(`${back}?error=${encodeURIComponent(`החיבור נכשל: ${(e as Error).message}`)}`, base));
  }
}
