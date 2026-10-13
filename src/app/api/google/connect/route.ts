import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { driveAuthUrl, driveConfigured } from "@/lib/google";

export async function GET() {
  if (!(await getSession())) return NextResponse.redirect(new URL("/login", process.env.APP_URL));
  if (!driveConfigured()) return NextResponse.redirect(new URL("/settings?error=drive_unavailable", process.env.APP_URL));
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(driveAuthUrl(state));
  res.cookies.set("google_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/google" });
  return res;
}
