import { afterEach, describe, expect, it, vi } from "vitest";
import { getObject, objectUrl, putObject } from "@/lib/storage";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("file storage addresses", () => {
  it("puts the bucket in the path for R2 and S3, and in the host for Railway buckets", () => {
    expect(objectUrl({ endpoint: "https://acc.r2.cloudflarestorage.com", bucket: "mikee-media", style: "path" }, "ws/1").href).toBe("https://acc.r2.cloudflarestorage.com/mikee-media/ws/1");
    expect(objectUrl({ endpoint: "https://storage.railway.app", bucket: "mikee-abc", style: "virtual" }, "ws/1").href).toBe("https://mikee-abc.storage.railway.app/ws/1");
  });

  it("signs and sends a Railway bucket request to the bucket's own host, and reads it back", async () => {
    vi.stubEnv("S3_ENDPOINT", "https://storage.railway.app");
    vi.stubEnv("S3_BUCKET", "mikee-abc");
    vi.stubEnv("S3_ACCESS_KEY_ID", "key");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "secret");
    const store = new Map<string, Uint8Array>();
    const calls: { url: string; method: string; auth: string }[] = [];
    vi.stubGlobal("fetch", async (url: URL, init: RequestInit) => {
      const h = init.headers as Record<string, string>;
      calls.push({ url: String(url), method: String(init.method), auth: h.authorization });
      if (init.method === "PUT") store.set(url.pathname, init.body as Uint8Array);
      return new Response(init.method === "GET" ? (store.get(url.pathname) as BodyInit) : null, { status: 200 });
    });
    const stored = await putObject("ws1", Buffer.from("video bytes"), "video/mp4");
    expect(stored.storage).toBe("s3");
    expect(calls[0].url).toMatch(/^https:\/\/mikee-abc\.storage\.railway\.app\/ws1\/[0-9a-f-]{36}$/);
    expect(calls[0].auth).toMatch(/^AWS4-HMAC-SHA256 Credential=key\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
    expect((await getObject(stored)).toString()).toBe("video bytes");
    vi.stubEnv("S3_URL_STYLE", "path");
    await putObject("ws1", Buffer.from("x"), "video/mp4");
    expect(calls.at(-1)!.url).toMatch(/^https:\/\/storage\.railway\.app\/mikee-abc\/ws1\//);
  });

  it("a refusal from the storage says why, in the storage's own words", async () => {
    vi.stubEnv("S3_ENDPOINT", "https://storage.railway.app");
    vi.stubEnv("S3_BUCKET", "mikee-abc");
    vi.stubEnv("S3_ACCESS_KEY_ID", "key");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "secret");
    vi.stubGlobal("fetch", async () => new Response("<Error><Code>SignatureDoesNotMatch</Code><Message>The request signature we calculated does not match</Message></Error>", { status: 403 }));
    await expect(putObject("ws1", Buffer.from("x"), "video/mp4")).rejects.toThrow("Storage upload failed (HTTP 403, SignatureDoesNotMatch: The request signature we calculated does not match)");
  });
});
