import { NextResponse, type NextRequest } from "next/server";

/**
 * A fresh Content-Security-Policy per page view: only our own scripts (marked with a one-time nonce) may run,
 * nothing may frame the app, and the page may talk only to its own server. API routes and files are not
 * matched here; they set their own headers.
 */
export function middleware(req: NextRequest) {
  // The marketing site (mikee.co.il) is served by the same app from src/app/site; see siteRoute.
  const site = siteRoute(req);
  if (site?.done) return site.done;

  // One address only: the sign-in cookie belongs to one host, and Facebook and Google return to APP_URL.
  // Browsing on another address (the Railway one, or the custom domain before APP_URL points to it) would
  // lose the session on the way back from a connection.
  const canonical = site ? null : canonicalRedirect(req);
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
  const res = site?.rewrite
    ? NextResponse.rewrite(site.rewrite, { request: { headers: requestHeaders } })
    : NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

/** The site's own pages; everything else on the site's address belongs to the app. */
const SITE_PAGES = new Set(["/", "/meeting", "/terms", "/privacy", "/data-deletion", "/accessibility"]);

const hostOf = (url: string | undefined) => {
  try {
    return url ? new URL(url) : null;
  } catch {
    return null;
  }
};

/**
 * mikee.co.il (SITE_URL) shows the marketing pages from /site, under clean paths: / is /site, /meeting is
 * /site/meeting. Any other page asked for on that address (login, signup, the app) goes to APP_URL, so the
 * sign-in cookie stays on app.mikee.co.il. On the app's own address /site/* moves to the site's address.
 * Without SITE_URL (local development) the pages stay at /site.
 * Returns null for requests that are not the site's business.
 */
function siteRoute(req: NextRequest): { done?: NextResponse; rewrite?: URL } | null {
  const site = hostOf(process.env.SITE_URL);
  if (!site || site.protocol !== "https:") return null;
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim().toLowerCase();
  const path = req.nextUrl.pathname;
  const onSite = host === site.host || host === `www.${site.host}`;

  if (!onSite) {
    if (path === "/site" || path.startsWith("/site/")) {
      return { done: NextResponse.redirect(new URL((path.slice(5) || "/") + req.nextUrl.search, site), 308) };
    }
    return null;
  }
  if (host !== site.host) return { done: NextResponse.redirect(new URL(path + req.nextUrl.search, site), 308) };
  // Files (Mikee's still frames, the Rive runtime, images) are served as they are.
  if (/\.[a-z0-9]+$/i.test(path)) return { done: NextResponse.next() };
  if (path.startsWith("/site/") || path === "/site") return { done: NextResponse.redirect(new URL((path.slice(5) || "/") + req.nextUrl.search, site), 308) };
  if (SITE_PAGES.has(path)) return { rewrite: new URL(`/site${path === "/" ? "" : path}${req.nextUrl.search}`, req.url) };
  const app = hostOf(process.env.APP_URL);
  if (app) return { done: NextResponse.redirect(new URL(path + req.nextUrl.search, app), 307) };
  return { done: new NextResponse("Not found", { status: 404 }) };
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
