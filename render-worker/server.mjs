/**
 * Mikee render worker. Takes a HyperFrames project (an index.html plus its fonts, scripts, photos, clips and
 * music, all streamed in the request) and returns the MP4. It fetches nothing itself, keeps nothing after
 * answering, and accepts requests only with the shared RENDER_SECRET.
 *
 * Request body: repeated frames of [4-byte path length][path][8-byte size][bytes]. Header X-Duration: seconds.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, mkdir, readdir, readFile, rename, rm } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT ?? 8080);
const SECRET = process.env.RENDER_SECRET ?? "";
const MAX_BODY = 1024 * 1024 * 1024;
const MAX_FILES = 120;
const MAX_SECONDS = 60;
const TIMEOUT_MS = Number(process.env.RENDER_TIMEOUT_MS ?? 15 * 60_000);
const MAX_WAITING = Number(process.env.RENDER_MAX_WAITING ?? 4);
const CLI = join(dirname(fileURLToPath(import.meta.url)), "node_modules", "hyperframes", "dist", "cli.js");

/** Only the files a Mikee composition is made of. */
export const SAFE_PATH = /^(index\.html|kit\/[a-z0-9][a-z0-9.-]{0,80}\.(js|woff2)|media\/[0-9]{1,3}\.(jpg|jpeg|png|webp|gif|mp4|mp3|m4a|aac|wav|ogg))$/;

export function authorized(header) {
  if (SECRET.length < 24) return false;
  const given = Buffer.from(String(header ?? "").replace(/^Bearer /, ""));
  const want = Buffer.from(SECRET);
  return given.length === want.length && timingSafeEqual(given, want);
}

export function checkDuration(value) {
  const seconds = Number(value);
  return seconds > 0 && seconds <= MAX_SECONDS ? null : "duration out of range";
}

/**
 * Reads the framed stream and writes each file under dir as it arrives. Refuses a bad path before writing a
 * byte of it, and stops at the size and file-count limits.
 */
export async function receiveProject(stream, dir) {
  let buf = Buffer.alloc(0);
  let total = 0;
  const paths = [];
  let current = null; // { out, left }
  const finish = (out) => new Promise((res, rej) => out.end((e) => (e ? rej(e) : res())));

  for await (const chunk of stream) {
    total += chunk.length;
    if (total > MAX_BODY) throw Object.assign(new Error("too large"), { status: 413 });
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    while (buf.length) {
      if (current) {
        const take = Math.min(current.left, buf.length);
        if (!current.out.write(buf.subarray(0, take))) await new Promise((r) => current.out.once("drain", r));
        current.left -= take;
        buf = buf.subarray(take);
        if (current.left === 0) {
          await finish(current.out);
          current = null;
        }
        continue;
      }
      if (buf.length < 4) break;
      const len = buf.readUInt32BE(0);
      if (len > 200) throw Object.assign(new Error("bad path"), { status: 400 });
      if (buf.length < 4 + len + 8) break;
      const path = buf.subarray(4, 4 + len).toString("utf8");
      const size = Number(buf.readBigUInt64BE(4 + len));
      if (!SAFE_PATH.test(path) || paths.includes(path)) throw Object.assign(new Error(`bad file ${path.slice(0, 60)}`), { status: 400 });
      if (paths.length >= MAX_FILES) throw Object.assign(new Error("too many files"), { status: 400 });
      paths.push(path);
      buf = buf.subarray(4 + len + 8);
      const to = join(dir, path);
      await mkdir(dirname(to), { recursive: true });
      current = { out: createWriteStream(to), left: size };
      if (size === 0) {
        await finish(current.out);
        current = null;
      }
    }
  }
  if (current || buf.length) throw Object.assign(new Error("truncated project"), { status: 400 });
  if (!paths.includes("index.html")) throw Object.assign(new Error("index.html missing"), { status: 400 });
  return paths;
}

function exec(cmd, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: { ...process.env, RENDER_SECRET: "", DO_NOT_TRACK: "1", HYPERFRAMES_NO_TELEMETRY: "1", ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    child.stdout.on("data", (d) => (log = (log + d).slice(-4000)));
    child.stderr.on("data", (d) => (log = (log + d).slice(-4000)));
    const timer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT_MS);
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve(log) : reject(new Error(`${cmd.split("/").pop()} failed (${code}): ${log.slice(-600)}`));
    });
  });
}

/**
 * Clips from phones have a keyframe every few seconds, which makes frame-exact seeking stall. Re-encode each
 * one to H.264 with a keyframe every frame-second, 30fps, at most 1920 pixels on the long side.
 */
async function prepareClips(dir) {
  const media = join(dir, "media");
  const names = await readdir(media).catch(() => []);
  for (const name of names.filter((n) => n.endsWith(".mp4"))) {
    const src = join(media, name);
    const tmp = join(media, `prep-${name}`);
    await exec("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-i", src,
      "-vf", "scale=w=min(iw\\,1920):h=min(ih\\,1920):force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30,format=yuv420p",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-g", "30", "-keyint_min", "30", "-sc_threshold", "0",
      "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", tmp,
    ]);
    await rename(tmp, src);
  }
}

let running = Promise.resolve();
let waiting = 0;

async function render(dir) {
  await prepareClips(dir);
  const out = join(dir, "out.mp4");
  await exec(process.execPath, [CLI, "render", dir, "-o", out, "-q", "standard", "--quiet", "--workers", process.env.RENDER_WORKERS ?? "2"]);
  return readFile(out);
}

const send = (res, status, body, type = "application/json") => {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
};

export const server = createServer(async (req, res) => {
  let dir = null;
  try {
    if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true, waiting });
    if (req.method !== "POST" || req.url !== "/render") return send(res, 404, { error: "not found" });
    if (!authorized(req.headers.authorization)) return send(res, 401, { error: "unauthorized" });
    const bad = checkDuration(req.headers["x-duration"]);
    if (bad) return send(res, 400, { error: bad });
    if (waiting >= MAX_WAITING) return send(res, 429, { error: "busy" });

    waiting++;
    try {
      dir = await mkdtemp(join(tmpdir(), "mikee-"));
      await receiveProject(req, dir);
      // One render at a time: each already uses several Chrome workers.
      const job = running.then(() => render(dir));
      running = job.catch(() => undefined);
      send(res, 200, await job, "video/mp4");
    } finally {
      waiting--;
    }
  } catch (err) {
    console.error("[render]", err?.message ?? err);
    if (!res.headersSent) send(res, err?.status ?? 500, { error: err?.status ? err.message : "render failed" });
    req.resume();
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (SECRET.length < 24) console.warn("[render] RENDER_SECRET is missing or shorter than 24 characters: every request will be refused.");
  // Railway's private network is IPv6; fall back to IPv4 where IPv6 is not available.
  server.once("error", (err) => {
    if (err.code !== "EAFNOSUPPORT") throw err;
    server.listen(PORT, "0.0.0.0");
  });
  server.on("listening", () => console.log(`[render] listening on ${JSON.stringify(server.address())}`));
  server.listen(PORT, "::");
}
