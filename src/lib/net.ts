import "server-only";
import { lookup } from "dns/promises";
import { BlockList, isIP } from "net";
import { Agent, fetch as undiciFetch } from "undici";

/**
 * Every request the server makes to an address that came from a client, a website or the model goes through
 * here. It refuses anything that is not plain http(s) on the public internet: internal networks, the cloud
 * metadata service, localhost, odd ports. The check runs again at connection time for every redirect hop,
 * so DNS tricks (a name that resolves to a public address first and a private one later) do not get through.
 * Bodies are read with a hard size cap and a timeout.
 */

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  blocked.addSubnet(net, prefix, "ipv6");

export class BlockedAddress extends Error {}

export function isPublicIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return !blocked.check(ip, "ipv4");
  if (v === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (mapped) return !blocked.check(mapped[1], "ipv4");
    return !blocked.check(ip, "ipv6");
  }
  return false;
}

const BLOCKED_HOSTS = /^(localhost|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal|.*\.railway\.internal)$/i;

/** Validates the shape of a URL before any network work. */
export function checkUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedAddress("Not a valid address");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new BlockedAddress("Only http and https addresses are allowed");
  if (url.username || url.password) throw new BlockedAddress("Addresses with credentials are not allowed");
  if (url.port && url.port !== "80" && url.port !== "443") throw new BlockedAddress("Only standard web ports are allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTS.test(host)) throw new BlockedAddress("Internal addresses are not allowed");
  if (isIP(host) && !isPublicIp(host)) throw new BlockedAddress("Internal addresses are not allowed");
  return url;
}

/** DNS lookup for the connection itself: every resolved address must be public. */
function guardedLookup(hostname: string, options: any, callback: (err: Error | null, address?: any, family?: number) => void) {
  lookup(hostname, { all: true, verbatim: true })
    .then((addrs) => {
      if (!addrs.length) return callback(new BlockedAddress(`No address for ${hostname}`));
      const bad = addrs.find((a) => !isPublicIp(a.address));
      if (bad) return callback(new BlockedAddress(`${hostname} points to an internal address`));
      if (options?.all) return callback(null, addrs);
      callback(null, addrs[0].address, addrs[0].family);
    })
    .catch((e) => callback(e));
}

const agent = new Agent({ connect: { lookup: guardedLookup as any }, headersTimeout: 15_000, bodyTimeout: 30_000 });

export type SafeResponse = {
  ok: boolean;
  status: number;
  url: string;
  headers: Headers;
  bytes: () => Promise<Buffer>;
  text: () => Promise<string>;
  json: () => Promise<any>;
};

/** Test seam: in tests the global fetch is replaced with a fake, and DNS is not available. */
const testing = () => !!process.env.VITEST;

export async function safeFetch(
  raw: string,
  opts: { maxBytes?: number; timeoutMs?: number; headers?: Record<string, string>; maxRedirects?: number; sameHost?: boolean } = {},
): Promise<SafeResponse> {
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const first = checkUrl(raw);
  let url = first;
  const deadline = AbortSignal.timeout(timeoutMs);
  for (let hop = 0; ; hop++) {
    const res = testing()
      ? await globalThis.fetch(url.toString(), { headers: opts.headers, redirect: "manual", signal: deadline })
      : ((await undiciFetch(url.toString(), { headers: opts.headers, redirect: "manual", signal: deadline, dispatcher: agent })) as unknown as Response);
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      if (hop >= (opts.maxRedirects ?? 5)) throw new BlockedAddress("Too many redirects");
      const next = checkUrl(new URL(res.headers.get("location")!, url).toString());
      if (opts.sameHost && next.hostname !== first.hostname) throw new BlockedAddress("Redirect to another site was blocked");
      await res.body?.cancel().catch(() => undefined);
      url = next;
      continue;
    }
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > maxBytes) {
      await res.body?.cancel().catch(() => undefined);
      throw new BlockedAddress(`The file is larger than the ${Math.round(maxBytes / 1024 / 1024)}MB limit`);
    }
    let cached: Buffer | null = null;
    const bytes = async () => {
      if (cached) return cached;
      const chunks: Uint8Array[] = [];
      let size = 0;
      const reader = res.body?.getReader();
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) {
            await reader.cancel().catch(() => undefined);
            throw new BlockedAddress(`The file is larger than the ${Math.round(maxBytes / 1024 / 1024)}MB limit`);
          }
          chunks.push(value);
        }
      }
      cached = Buffer.concat(chunks);
      return cached;
    };
    return { ok: res.ok, status: res.status, url: url.toString(), headers: res.headers, bytes, text: async () => (await bytes()).toString("utf8"), json: async () => JSON.parse((await bytes()).toString("utf8")) };
  }
}
