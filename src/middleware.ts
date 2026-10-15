import { NextResponse, type NextRequest } from "next/server";

/**
 * A fresh Content-Security-Policy per page view: only our own scripts (marked with a one-time nonce) may run,
 * nothing may frame the app, and the page may talk only to its own server. API routes and files are not
 * matched here; they set their own headers.
 */
export function middleware(req: NextRequest) {
  // One address only: the sign-in cookie belongs to one host, and Facebook and Google return to APP_URL.
  // Browsing on another address (the Railway one, or the custom domain before APP_URL points to it) would
  // lose the session on the way back from a connection.
  const canonical = canonicalRedirect(req);
  if (canonical) return canonical;

  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const dev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    // 'wasm-unsafe-eval' lets the self-hosted Rive runtime compile its WASM; it does not allow eval of JS.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval' https://apis.google.com${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "connect-src 'self' https://www.googleapis.com https://content.googleapis.com",
    "frame-src 'self' https://docs.google.com https://drive.google.com https://accounts.google.com",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    ...(process.env.APP_URL?.startsWith("https:") ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

function canonicalRedirect(req: NextRequest): NextResponse | null {
  if (req.method !== "GET" && req.method !== "HEAD") return null;
  let app: URL;
  try {
    app = new URL(process.env.APP_URL ?? "");
  } catch {
    return null;
  }
  if (app.protocol !== "https:") return null;
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim().toLowerCase();
  if (!host || host === app.host || host.startsWith("localhost") || host.startsWith("127.0.0.1")) return null;
  const to = new URL(req.nextUrl.pathname + req.nextUrl.search, app);
  return NextResponse.redirect(to, 308);
}

export const config = {
  matcher: [{ source: "/((?!api/|_next/static|_next/image|favicon.ico).*)", missing: [{ type: "header", key: "next-router-prefetch" }] }],
};
