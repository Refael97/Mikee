import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { connectDrive } from "@/lib/google";

export async function GET(req: NextRequest) {
  const base = process.env.APP_URL ?? req.nextUrl.origin;
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", base));
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state || state !== req.cookies.get("google_oauth_state")?.value) return NextResponse.redirect(new URL("/settings?error=drive_cancelled", base));
  try {
    await connectDrive(session.workspace.id, code);
    const res = NextResponse.redirect(new URL("/library?connected=drive", base));
    res.cookies.delete("google_oauth_state");
    return res;
  } catch (e) {
    console.error("[google] connect failed", (e as Error).message);
    return NextResponse.redirect(new URL("/settings?error=drive_failed", base));
  }
}
