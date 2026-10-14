import { totalSeconds, VIDEO_FORMATS, VIDEO_STYLES, type VideoScene, type VideoSpec } from "./spec";

/** Font and script files every composition loads from its own kit/ folder (nothing from the network). */
export const KIT_FILES = {
  "kit/gsap.min.js": "node_modules/gsap/dist/gsap.min.js",
  "kit/motion.js": "src/lib/video/kit/motion.js",
  ...Object.fromEntries(
    ["hebrew", "latin"].flatMap((sub) => [300, 400, 700, 800].map((w) => [`kit/heebo-${sub}-${w}.woff2`, `node_modules/@fontsource/heebo/files/heebo-${sub}-${w}-normal.woff2`])),
  ),
} as Record<string, string>;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Where each library item sits inside the project (media/<n>.<ext>) and what it is. */
export type MediaFiles = Record<string, { path: string; kind: "image" | "video" | "audio" }>;

function fonts() {
  const ranges = {
    hebrew: "U+0307-0308, U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F",
    latin: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
  };
  return Object.entries(ranges)
    .flatMap(([sub, range]) =>
      [300, 400, 700, 800].map((w) => `@font-face{font-family:Heebo;font-weight:${w};font-display:block;src:url(kit/heebo-${sub}-${w}.woff2) format("woff2");unicode-range:${range}}`),
    )
    .join("\n");
}

const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:#000;overflow:hidden}
html[data-preview],html[data-preview] body{width:100%;height:100%;background:transparent}
#root{position:relative;overflow:hidden;font-family:Heebo,system-ui,sans-serif;direction:rtl;transform-origin:0 0;
  --pad:calc(var(--u)*8);-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
.scene{position:absolute;inset:0;overflow:hidden;background:var(--bg);color:var(--ink);visibility:hidden;opacity:0}
.fill{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 35%,rgba(0,0,0,.72) 100%)}
.pad{position:absolute;inset:var(--pad);display:flex;flex-direction:column;justify-content:center;gap:calc(var(--u)*3.2)}
.bottom{justify-content:flex-end}
.h{font-weight:var(--hw);font-size:calc(var(--u)*11);line-height:1.04;letter-spacing:var(--hls);text-wrap:balance}
.sub{font-weight:400;font-size:calc(var(--u)*4.6);line-height:1.35;opacity:.86;text-wrap:balance}
.rule{width:calc(var(--u)*14);height:calc(var(--u)*.8);background:var(--accent);transform-origin:100% 50%}
.light{color:#fff}
.product{position:absolute;inset:0;display:grid;grid-template-rows:62% 1fr}
.wide .product{grid-template-rows:none;grid-template-columns:1fr 1fr}
.product .photo{position:relative;overflow:hidden}
.product .info{display:flex;flex-direction:column;justify-content:center;gap:calc(var(--u)*2.4);padding:0 var(--pad)}
.name{font-weight:700;font-size:calc(var(--u)*7);line-height:1.1;text-wrap:balance}
.prices{display:flex;align-items:baseline;gap:calc(var(--u)*3)}
.price{font-weight:800;font-size:calc(var(--u)*10);color:var(--accent);line-height:1}
.old{font-weight:400;font-size:calc(var(--u)*5);opacity:.5;text-decoration:line-through}
.note{font-size:calc(var(--u)*4.2);opacity:.8}
.lines{gap:calc(var(--u)*1.6)}
.lines .h{font-size:calc(var(--u)*10)}
.lines .h:last-child{color:var(--accent)}
.grid{position:absolute;inset:0;display:grid;gap:calc(var(--u)*1.2);background:var(--bg)}
.g2{grid-template-rows:1fr 1fr}.wide .g2{grid-template-rows:none;grid-template-columns:1fr 1fr}
.g3{grid-template-rows:1.3fr 1fr;grid-template-columns:1fr 1fr}.g3 .cell:first-child{grid-column:1/3}
.g4{grid-template-rows:1fr 1fr;grid-template-columns:1fr 1fr}
.cell{position:relative;overflow:hidden}
.caption{position:absolute;inset-inline:var(--pad);bottom:var(--pad);font-weight:700;font-size:calc(var(--u)*6.4);color:#fff;text-shadow:0 calc(var(--u)*.4) calc(var(--u)*3) rgba(0,0,0,.45)}
.mark{font-weight:800;font-size:calc(var(--u)*26);line-height:.6;color:var(--accent);height:calc(var(--u)*12)}
.quote{font-weight:var(--qw);font-size:calc(var(--u)*6.6);line-height:1.3;text-wrap:balance}
.author{display:flex;align-items:center;gap:calc(var(--u)*2.4);font-size:calc(var(--u)*4.2);font-weight:700}
.author .rule{width:calc(var(--u)*7);height:calc(var(--u)*.5)}
.cta{align-items:center;text-align:center}
.cta .h{font-size:calc(var(--u)*10)}
.btn{display:inline-block;background:var(--accent);color:var(--on-accent);font-weight:800;font-size:calc(var(--u)*5.4);
  padding:calc(var(--u)*2.6) calc(var(--u)*7);border-radius:calc(var(--u)*1)}
.detail{font-size:calc(var(--u)*4.4);opacity:.8;direction:ltr;unicode-bidi:plaintext}
.clipname{position:absolute;inset:var(--pad);display:flex;flex-direction:column;justify-content:flex-end;gap:calc(var(--u)*2.4);color:#fff}
.clipname .h{font-size:calc(var(--u)*9)}
.logo{max-width:calc(var(--u)*34);max-height:calc(var(--u)*16);object-fit:contain}
`;

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

type Window = { start: number; seconds: number };

/** A photo (with a slow push-in) or a video clip playing for the scene's window, muted unless asked. */
function visual(id: string, media: MediaFiles, w: Window, opts: { from?: number; sound?: boolean } = {}) {
  const m = media[id];
  if (!m) return "";
  if (m.kind !== "video") return `<img class="fill" src="${esc(m.path)}" alt="" data-kb>`;
  const audio = opts.sound ? ` data-has-audio="true" data-volume="1"` : " muted";
  return `<video class="fill" src="${esc(m.path)}" data-start="${w.start}" data-duration="${w.seconds}" data-media-start="${opts.from ?? 0}"${audio} playsinline preload="auto"></video>`;
}

function scene(s: VideoScene, media: MediaFiles, w: Window): string {
  const pic = (id: string, from?: number) => visual(id, media, w, { from });
  switch (s.type) {
    case "title":
      return s.mediaId
        ? `${pic(s.mediaId, s.from)}<div class="shade"></div><div class="pad bottom light"><div class="rule" data-anim="line" data-at="0.2"></div><h1 class="h" data-anim="rise" data-at="0.35">${esc(s.headline)}</h1>${s.sub ? `<p class="sub" data-anim="rise" data-at="0.75">${esc(s.sub)}</p>` : ""}</div>`
        : `<div class="pad"><div class="rule" data-anim="line" data-at="0.15"></div><h1 class="h" data-anim="rise" data-at="0.3">${esc(s.headline)}</h1>${s.sub ? `<p class="sub" data-anim="rise" data-at="0.7">${esc(s.sub)}</p>` : ""}</div>`;
    case "product":
      return `<div class="product"><div class="photo" data-anim="wipe" data-at="0">${pic(s.mediaId, s.from)}</div><div class="info">
<h2 class="name" data-anim="rise" data-at="0.45">${esc(s.name)}</h2>
${s.price ? `<div class="prices" data-anim="rise" data-at="0.75"><span class="price">${esc(s.price)}</span>${s.oldPrice ? `<span class="old">${esc(s.oldPrice)}</span>` : ""}</div>` : ""}
${s.note ? `<p class="note" data-anim="fade" data-at="1.05">${esc(s.note)}</p>` : ""}</div></div>`;
    case "clip": {
      const text = s.headline
        ? `<div class="shade"></div><div class="clipname"><h2 class="h" data-anim="rise" data-at="0.3">${esc(s.headline)}</h2>${s.sub ? `<p class="sub" data-anim="rise" data-at="0.65">${esc(s.sub)}</p>` : ""}</div>`
        : "";
      return `${visual(s.mediaId, media, w, { from: s.from, sound: s.sound })}${text}`;
    }
    case "text":
      return `<div class="pad lines">${s.lines.map((l, i) => `<p class="h" data-anim="rise" data-at="${(0.2 + i * 0.45).toFixed(2)}">${esc(l)}</p>`).join("")}</div>`;
    case "gallery":
      return `<div class="grid g${s.mediaIds.length}">${s.mediaIds.map((id, i) => `<div class="cell" data-anim="pop" data-at="${(i * 0.22).toFixed(2)}">${pic(id)}</div>`).join("")}</div>${s.caption ? `<p class="caption" data-anim="rise" data-at="${(0.3 + s.mediaIds.length * 0.22).toFixed(2)}">${esc(s.caption)}</p>` : ""}`;
    case "quote":
      return `<div class="pad"><div class="mark" data-anim="fade" data-at="0.1">”</div><p class="quote" data-anim="rise" data-at="0.3">${esc(s.quote)}</p>${s.author ? `<div class="author" data-anim="fade" data-at="0.9"><span class="rule"></span>${esc(s.author)}</div>` : ""}</div>`;
    case "cta":
      return `<div class="pad cta">${s.logoMediaId && media[s.logoMediaId] ? `<img class="logo" src="${esc(media[s.logoMediaId].path)}" alt="" data-anim="fade" data-at="0">` : ""}<h2 class="h" data-anim="rise" data-at="0.25">${esc(s.headline)}</h2><span class="btn" data-anim="pop" data-at="0.7">${esc(s.action)}</span>${s.detail ? `<p class="detail" data-anim="fade" data-at="1.1">${esc(s.detail)}</p>` : ""}</div>`;
  }
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Background music as consecutive segments of one track: full level, and a dip to a quarter wherever a clip
 * keeps its own sound, so speech stays clear. Fades in at the start and out at the end.
 */
export function musicSegments(total: number, volume: number, from: number, speech: Window[]) {
  const cuts = new Set([0, total]);
  for (const w of speech) [w.start, Math.min(total, w.start + w.seconds)].forEach((t) => cuts.add(r2(t)));
  const points = [...cuts].sort((a, b) => a - b);
  const segs = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i], points[i + 1]];
    if (b - a < 0.01) continue;
    const dipped = speech.some((w) => a >= w.start - 0.001 && b <= w.start + w.seconds + 0.001);
    segs.push({ start: a, seconds: r2(b - a), mediaStart: r2(from + a), volume: r2(dipped ? volume * 0.25 : volume) });
  }
  return segs;
}

/** The composition: one HTML file, every value escaped, every file local. */
export function compose(spec: VideoSpec, media: MediaFiles, opts: { preview?: boolean } = {}) {
  const f = VIDEO_FORMATS[spec.format];
  const look = VIDEO_STYLES[spec.style];
  const bg = spec.colors?.bg ?? look.bg;
  const ink = spec.colors?.ink ?? look.ink;
  const accent = spec.colors?.accent ?? look.accent;
  const onAccent = luminance(accent) > 0.45 ? "#111111" : "#ffffff";
  const unit = Math.min(f.width, f.height) / 100;
  const duration = totalSeconds(spec);
  const elegant = spec.style === "elegant";

  let t = 0;
  const speech: Window[] = [];
  const scenes = spec.scenes
    .map((s, i) => {
      const w = { start: r2(t), seconds: s.seconds };
      t += s.seconds;
      if (s.type === "clip" && s.sound && media[s.mediaId]?.kind === "video") speech.push(w);
      return `<section class="scene clip" id="s${i}" data-start="${w.start}" data-duration="${w.seconds}" data-track-index="0">${scene(s, media, w)}</section>`;
    })
    .join("\n");
  const track = spec.music && media[spec.music.mediaId]?.kind === "audio" ? media[spec.music.mediaId].path : null;
  const segs = track ? musicSegments(duration, spec.music!.volume, spec.music!.from ?? 0, speech) : [];
  const music = segs
    .map(
      (m, i) =>
        `<audio src="${esc(track!)}" data-start="${m.start}" data-duration="${m.seconds}" data-media-start="${m.mediaStart}" data-volume="${m.volume}"${i === 0 ? ' data-fade-in="0.6"' : ""}${i === segs.length - 1 ? ' data-fade-out="1.5"' : ""} preload="auto"></audio>`,
    )
    .join("\n");

  return {
    width: f.width,
    height: f.height,
    duration,
    html: `<!doctype html>
<html lang="he"${opts.preview ? " data-preview" : ""}>
<head>
<meta charset="utf-8">
<title>${esc(spec.title)}</title>
<style>
${fonts()}
${CSS}
#root{width:${f.width}px;height:${f.height}px;--u:${unit}px;--bg:${bg};--ink:${ink};--accent:${accent};--on-accent:${onAccent};--hw:${elegant ? 300 : 800};--hls:${elegant ? "-0.01em" : "-0.025em"};--qw:${elegant ? 300 : 400}}
</style>
</head>
<body>
<div id="root" class="${spec.format}" data-composition-id="root" data-start="0" data-duration="${duration}" data-width="${f.width}" data-height="${f.height}" data-fps="30">
${scenes}
${music}
</div>
<script src="kit/gsap.min.js"></script>
<script src="kit/motion.js"></script>
</body>
</html>
`,
  };
}
