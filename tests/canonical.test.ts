import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

const req = (url: string, host: string, method = "GET") => new NextRequest(url, { method, headers: { host } });
afterEach(() => {
  delete process.env.APP_URL;
});

describe("one address for the app", () => {
  it("sends pages on another host to APP_URL, keeping the path", () => {
    process.env.APP_URL = "https://app.mikee.co.il";
    const res = middleware(req("https://mikee-production.up.railway.app/settings?x=1", "mikee-production.up.railway.app"));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://app.mikee.co.il/settings?x=1");
  });

  it("leaves the canonical host, local runs and form posts alone", () => {
    process.env.APP_URL = "https://app.mikee.co.il";
    expect(middleware(req("https://app.mikee.co.il/", "app.mikee.co.il")).status).toBe(200);
    expect(middleware(req("http://localhost:3000/", "localhost:3000")).status).toBe(200);
    expect(middleware(req("https://other.example/login", "other.example", "POST")).status).toBe(200);
    process.env.APP_URL = "http://localhost:3000";
    expect(middleware(req("https://other.example/", "other.example")).status).toBe(200);
  });
});
