import "server-only";
import { createHash, createHmac, randomUUID } from "crypto";

/**
 * Where file bytes live. In production: an S3-compatible bucket (AWS S3, Cloudflare R2, Railway buckets),
 * private, reached only by the server. Without bucket settings (local runs and tests) bytes stay in the
 * database, which is fine for small pilots but capped at 50MB per file.
 *
 *   S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com   S3_BUCKET=mikee-media
 *   S3_REGION=auto   S3_ACCESS_KEY_ID=...   S3_SECRET_ACCESS_KEY=...
 *
 * Railway buckets: S3_ENDPOINT=https://storage.railway.app (the bucket goes in the host name automatically;
 * S3_URL_STYLE=path or virtual overrides it, as the bucket's Credentials tab says).
 */

export type Stored = { storage: "db" | "s3"; key: string | null; bytes: Buffer | null };

export const DB_MAX_BYTES = 50 * 1024 * 1024;

function s3Config() {
  const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) return null;
  const endpoint = S3_ENDPOINT.replace(/\/$/, "");
  // Railway buckets want the bucket in the host name (virtual-hosted style); R2, S3 and others take it in the path.
  const style = process.env.S3_URL_STYLE === "virtual" || process.env.S3_URL_STYLE === "path" ? process.env.S3_URL_STYLE : /(^|\.)storage\.railway\.app$/.test(new URL(endpoint).host) ? "virtual" : "path";
  return { endpoint, bucket: S3_BUCKET, region: process.env.S3_REGION || "auto", keyId: S3_ACCESS_KEY_ID, secret: S3_SECRET_ACCESS_KEY, style };
}

export const usingBucket = () => !!s3Config();

export async function putObject(workspaceId: string, bytes: Buffer, contentType: string): Promise<Stored> {
  const cfg = s3Config();
  if (!cfg) {
    if (bytes.length > DB_MAX_BYTES) throw new Error("File storage is not configured for files over 50MB");
    return { storage: "db", key: null, bytes };
  }
  // Keys are namespaced by business and never derived from the file name.
  const key = `${workspaceId}/${randomUUID()}`;
  const res = await s3(cfg, "PUT", key, bytes, contentType);
  if (!res.ok) throw new Error(`Storage upload failed (HTTP ${res.status})`);
  return { storage: "s3", key, bytes: null };
}

export async function getObject(row: { storage: string; key: string | null; bytes: Buffer | Uint8Array | null }): Promise<Buffer> {
  if (row.storage !== "s3") return Buffer.from(row.bytes ?? new Uint8Array());
  const cfg = s3Config();
  if (!cfg || !row.key) throw new Error("File storage is not configured");
  const res = await s3(cfg, "GET", row.key);
  if (!res.ok) throw new Error(`Storage read failed (HTTP ${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export async function deleteObject(row: { storage: string; key: string | null }) {
  if (row.storage !== "s3" || !row.key) return;
  const cfg = s3Config();
  if (cfg) await s3(cfg, "DELETE", row.key).catch(() => undefined);
}

const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest();

/** The object's address, in the style the storage provider expects. */
export function objectUrl(cfg: { endpoint: string; bucket: string; style: string }, key: string): URL {
  const path = key.split("/").map(encodeURIComponent).join("/");
  if (cfg.style !== "virtual") return new URL(`${cfg.endpoint}/${cfg.bucket}/${path}`);
  const base = new URL(cfg.endpoint);
  return new URL(`${base.protocol}//${cfg.bucket}.${base.host}/${path}`);
}

/** A minimal AWS Signature V4 request, enough for put, get and delete of one object. */
async function s3(cfg: NonNullable<ReturnType<typeof s3Config>>, method: "PUT" | "GET" | "DELETE", key: string, body?: Buffer, contentType?: string) {
  const url = objectUrl(cfg, key);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const day = amzDate.slice(0, 8);
  const payloadHash = body ? sha256(body) : sha256("");
  const headers: Record<string, string> = { host: url.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  if (contentType) headers["content-type"] = contentType;
  const signed = Object.keys(headers).sort();
  const canonical = [method, url.pathname, "", ...signed.map((h) => `${h}:${headers[h]}`), "", signed.join(";"), payloadHash].join("\n");
  const scope = `${day}/${cfg.region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const kDate = hmac(`AWS4${cfg.secret}`, day);
  const kSigning = hmac(hmac(hmac(kDate, cfg.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(toSign).digest("hex");
  const { host: _host, ...sendHeaders } = headers;
  return fetch(url, {
    method,
    body: body ? new Uint8Array(body) : undefined,
    headers: { ...sendHeaders, authorization: `AWS4-HMAC-SHA256 Credential=${cfg.keyId}/${scope}, SignedHeaders=${signed.join(";")}, Signature=${signature}` },
    cache: "no-store",
  });
}
