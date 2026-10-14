/**
 * Mikee render worker. Takes a HyperFrames project (an index.html plus its fonts, scripts and images, all sent
 * in the request) and returns the MP4. It fetches nothing itself, keeps nothing after answering, and accepts
 * requests only with the shared RENDER_SECRET.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT ?? 8080);
const SECRET = process.env.RENDER_SECRET ?? "";
const MAX_BODY = 90 * 1024 * 1024;
const MAX_SECONDS = 60;
const TIMEOUT_MS = Number(process.env.RENDER_TIMEOUT_MS ?? 10 * 60_000);
const MAX_WAITING = Number(process.env.RENDER_MAX_WAITING ?? 4);
const CLI = join(dirname(fileURLToPath(import.meta.url)), "node_modules", "hyperframes", "dist", "cli.js");

/** Only the files a Mikee composition is made of. */
export const SAFE_PATH = /^(index\.html|kit\/[a-z0-9][a-z0-9.-]{0,80}\.(js|woff2)|media\/[0-9]{1,3}\.(jpg|jpeg|png|webp|gif))$/;

export function authorized(header) {
  if (SECRET.length < 24) return false;
  const given = Buffer.from(String(header ?? "").replace(/^Bearer /, ""));
  const want = Buffer.from(SECRET);
  return given.length === want.length && timingSafeEqual(given, want);
}

export function checkProject(body) {
  if (!body || !Array.isArray(body.files) || body.files.length > 80) return "files missing";
  const seconds = Number(body.duration);
  if (!(seconds > 0 && seconds <= MAX_SECONDS)) return "duration out of range";
  if (!body.files.some((f) => f.path === "index.html")) return "index.html missing";
  for (const f of body.files) {
    if (typeof f.path !== "string" || !SAFE_PATH.test(f.path) || typeof f.data !== "string") return `bad file ${String(f.path).slice(0, 60)}`;
  }
  return null;
}

let running = Promise.resolve();
let waiting = 0;

function run(dir, out, quality) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, "render", dir, "-o", out, "-q", quality, "--quiet", "--workers", process.env.RENDER_WORKERS ?? "2"], {
      env: { ...process.env, RENDER_SECRET: "", DO_NOT_TRACK: "1", HYPERFRAMES_NO_TELEMETRY: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    child.stdout.on("data", (d) => (log = (log + d).slice(-4000)));
    child.stderr.on("data", (d) => (log = (log + d).slice(-4000)));
    const timer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`render failed (${code}): ${log.slice(-600)}`));
    });
  });
}

async function render(body) {
  const dir = await mkdtemp(join(tmpdir(), "mikee-"));
  try {
    for (const f of body.files) {
      const to = join(dir, f.path);
      await mkdir(dirname(to), { recursive: true });
      await writeFile(to, Buffer.from(f.data, "base64"));
    }
    const out = join(dir, "out.mp4");
    await run(dir, out, body.quality === "draft" ? "draft" : "standard");
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error("too large"), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const send = (res, status, body, type = "application/json") => {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
};

export const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true, waiting });
    if (req.method !== "POST" || req.url !== "/render") return send(res, 404, { error: "not found" });
    if (!authorized(req.headers.authorization)) return send(res, 401, { error: "unauthorized" });
    if (waiting >= MAX_WAITING) return send(res, 429, { error: "busy" });
    const body = JSON.parse((await readBody(req)).toString("utf8"));
    const problem = checkProject(body);
    if (problem) return send(res, 400, { error: problem });

    // One render at a time: each already uses several Chrome workers.
    waiting++;
    const job = running.then(() => render(body));
    running = job.catch(() => undefined);
    try {
      const mp4 = await job;
      send(res, 200, mp4, "video/mp4");
    } finally {
      waiting--;
    }
  } catch (err) {
    console.error("[render]", err?.message ?? err);
    if (!res.headersSent) send(res, err?.status ?? 500, { error: err?.status === 413 ? "too large" : "render failed" });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (SECRET.length < 24) console.warn("[render] RENDER_SECRET is missing or shorter than 24 characters: every request will be refused.");
  // Railway's private network is IPv6; fall back to IPv4 where IPv6 is not available.
  const listen = (host) => server.listen(PORT, host, () => console.log(`[render] listening on ${host} ${PORT}`));
  server.once("error", (err) => {
    if (err.code !== "EAFNOSUPPORT") throw err;
    listen("0.0.0.0");
  });
  listen("::");
}
