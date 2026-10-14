import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { appSecretProof, MetaError, oauthDialogUrl } from "@/lib/meta/graph";
import { scheduleProblem, targeting } from "@/lib/meta/actions";
import { toSocialJpeg } from "@/lib/meta/images";
import { postProblem } from "@/lib/agent/tools";
import { friendlyError } from "@/lib/errors";
import { CampaignSpec, PostSpec } from "@/lib/specs";
import { campaignSpec } from "./support/setup";

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

describe("Facebook Login for Business, as Meta documents it", () => {
  it("sends the configuration with the code grant, and one exact redirect address", () => {
    process.env.META_APP_ID = "1100822339358315";
    process.env.META_LOGIN_CONFIG_ID = "987654321";
    process.env.APP_URL = "https://app.mikee.co.il/";
    const u = new URL(oauthDialogUrl("s1"));
    expect(u.origin + u.pathname).toMatch(/^https:\/\/www\.facebook\.com\/v\d+\.0\/dialog\/oauth$/);
    expect(Object.fromEntries(u.searchParams)).toEqual({
      client_id: "1100822339358315",
      redirect_uri: "https://app.mikee.co.il/api/meta/callback",
      state: "s1",
      config_id: "987654321",
      response_type: "code",
      override_default_response_type: "true",
    });
    expect(u.searchParams.has("scope")).toBe(false);
  });

  it("signs calls with appsecret_proof (HMAC-SHA256 of the token with the app secret)", () => {
    process.env.META_APP_SECRET = "secret";
    expect(appSecretProof("token")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("only a dead token disconnects; an object-level permission error does not", () => {
    expect(new MetaError("x", 190).isAccessLost).toBe(true);
    expect(new MetaError("terms", 200, 1870034).isAccessLost).toBe(false);
    expect(friendlyError(new MetaError("terms", 200, 1870034))).toMatch(/תנאי הקהלים/);
    expect(new MetaError("insights", 80000).isThrottled).toBe(true);
    expect(friendlyError(new MetaError("old", 2635))).toMatch(/גרסה ישנה/);
  });
});

describe("campaigns, as the Marketing API accepts them", () => {
  const spec = (audience: Record<string, unknown>) => CampaignSpec.parse({ ...campaignSpec(), audience: { description: "x", ...audience } });

  it("with Advantage+ audience, ages become a suggestion inside Meta's limits", () => {
    const t = targeting(spec({ ageMin: 30, ageMax: 45, advantage: true }));
    expect([t.age_min, t.age_max, t.age_range]).toEqual([25, 65, [30, 45]]);
    const strict = targeting(spec({ ageMin: 30, ageMax: 45, advantage: false }));
    expect([strict.age_min, strict.age_max, strict.age_range]).toEqual([30, 45, undefined]);
  });

  it("one city gets a 17-80 km radius, several cities none, regions go under regions", () => {
    expect(targeting(spec({ cities: [{ key: "1", name: "תל אביב" }] })).geo_locations).toEqual({ cities: [{ key: "1", radius: 17, distance_unit: "kilometer" }] });
    expect(targeting(spec({ cities: [{ key: "1", name: "א" }, { key: "2", name: "ב" }, { key: "9", name: "מחוז", type: "region" }] })).geo_locations).toEqual({
      cities: [{ key: "1" }, { key: "2" }],
      regions: [{ key: "9" }],
    });
    expect(() => spec({ cities: [{ key: "1", name: "א", radiusKm: 5 }] })).toThrow();
  });
});

describe("posts, as Pages and Instagram accept them", () => {
  const post = (o: Record<string, unknown>) => PostSpec.parse({ title: "t", channels: ["instagram"], text: "שלום", media: [{ type: "image", url: "https://x.example/a.jpg" }], ...o });

  it("catches what Meta would refuse before the client sees a card", () => {
    expect(postProblem(post({ text: "#א ".repeat(31) }))).toMatch(/30 hashtags/);
    expect(postProblem(post({ text: "x".repeat(2201) }))).toMatch(/2200/);
    expect(postProblem(post({ media: [] }))).toMatch(/image or a video/);
    expect(postProblem(post({ channels: ["facebook"], media: [{ type: "video", url: "https://x.example/a.mp4" }, { type: "image", url: "https://x.example/a.jpg" }] }))).toMatch(/one video or photos/);
    expect(postProblem(post({}))).toBeNull();
    expect(scheduleProblem(new Date(Date.now() + 5 * 60_000).toISOString())).toMatch(/10 minutes/);
    expect(scheduleProblem(new Date(Date.now() + 40 * 86400_000).toISOString())).toMatch(/30 days/);
    expect(scheduleProblem(new Date(Date.now() + 86400_000).toISOString())).toBeNull();
  });

  it("turns any library photo into a JPEG Instagram accepts: 4:5 to 1.91:1, at most 1440 wide, under 8MB", async () => {
    const tall = await sharp({ create: { width: 1080, height: 1920, channels: 4, background: "#c9a46a" } }).png().toBuffer();
    const out = await toSocialJpeg(tall, "instagram");
    const m = await sharp(out).metadata();
    expect(m.format).toBe("jpeg");
    expect(m.width! / m.height!).toBeCloseTo(0.8, 2);
    const wide = await toSocialJpeg(await sharp({ create: { width: 3000, height: 1000, channels: 3, background: "#222" } }).webp().toBuffer(), "instagram");
    const w = await sharp(wide).metadata();
    expect(w.width).toBe(1440);
    expect(w.width! / w.height!).toBeLessThanOrEqual(1.911);
    const fb = await sharp(await toSocialJpeg(tall, "facebook")).metadata();
    expect(fb.width! / fb.height!).toBeCloseTo(1080 / 1920, 2);
  });
});
