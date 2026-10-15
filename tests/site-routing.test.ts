import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

const req = (url: string, host: string) => new NextRequest(url, { headers: { host } });
beforeEach(() => {
  process.env.APP_URL = "https://app.mikee.co.il";
  process.env.SITE_URL = "https://mikee.co.il";
});
afterEach(() => {
  delete process.env.APP_URL;
  delete process.env.SITE_URL;
});

describe("the site on mikee.co.il", () => {
  it("shows the site's pages at clean paths, with the page's CSP", () => {
    const home = middleware(req("https://mikee.co.il/", "mikee.co.il"));
    expect(home.headers.get("x-middleware-rewrite")).toBe("https://mikee.co.il/site");
    expect(home.headers.get("Content-Security-Policy")).toContain("script-src 'self' 'nonce-");
    expect(middleware(req("https://mikee.co.il/meeting", "mikee.co.il")).headers.get("x-middleware-rewrite")).toBe("https://mikee.co.il/site/meeting");
  });

  it("sends account pages to the app, so the sign-in cookie stays on app.mikee.co.il", () => {
    for (const path of ["/login", "/signup?plan=ai_299", "/mikee", "/settings"]) {
      const res = middleware(req(`https://mikee.co.il${path}`, "mikee.co.il"));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe(`https://app.mikee.co.il${path}`);
    }
  });

  it("serves files as they are, and moves www and /site paths to the clean address", () => {
    expect(middleware(req("https://mikee.co.il/mikee/ice_blue.png", "mikee.co.il")).status).toBe(200);
    expect(middleware(req("https://mikee.co.il/rive/rive.wasm", "mikee.co.il")).headers.get("location")).toBeNull();
    expect(middleware(req("https://www.mikee.co.il/meeting", "www.mikee.co.il")).headers.get("location")).toBe("https://mikee.co.il/meeting");
    expect(middleware(req("https://mikee.co.il/site/terms", "mikee.co.il")).headers.get("location")).toBe("https://mikee.co.il/terms");
  });

  it("leaves the app as it was", () => {
    const app = middleware(req("https://app.mikee.co.il/", "app.mikee.co.il"));
    expect(app.status).toBe(200);
    expect(app.headers.get("x-middleware-rewrite")).toBeNull();
    expect(middleware(req("https://app.mikee.co.il/site/meeting", "app.mikee.co.il")).headers.get("location")).toBe("https://mikee.co.il/meeting");
    const other = middleware(req("https://mikee-production.up.railway.app/settings", "mikee-production.up.railway.app"));
    expect(other.headers.get("location")).toBe("https://app.mikee.co.il/settings");
  });
});
