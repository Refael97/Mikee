import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { oauthDialogUrl } from "@/lib/meta/graph";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", process.env.APP_URL));
  // Without the app's id, its Login for Business configuration and the public address, Facebook shows its
  // own error page; say what is missing instead.
  if (!/^\d+$/.test(process.env.META_APP_ID ?? "") || !/^\d+$/.test(process.env.META_LOGIN_CONFIG_ID ?? "") || !process.env.META_APP_SECRET || !/^https:\/\//.test(process.env.APP_URL ?? "")) {
    const back = session.workspace.stage === "connect" ? "/onboarding" : "/settings";
    return NextResponse.redirect(new URL(`${back}?error=meta_not_configured`, process.env.APP_URL || "http://localhost:3000"));
  }
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(oauthDialogUrl(state));
  res.cookies.set("meta_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/meta" });
  return res;
}
