import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { oauthDialogUrl } from "@/lib/meta/graph";

export async function GET() {
  if (!(await getSession())) return NextResponse.redirect(new URL("/login", process.env.APP_URL));
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(oauthDialogUrl(state));
  res.cookies.set("meta_oauth_state", state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
