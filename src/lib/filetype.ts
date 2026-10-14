/**
 * What a file really is, read from its first bytes. The browser's claimed type and the file name are never
 * trusted: an "image" that is really HTML or SVG would run script on our domain. Only the formats below are
 * accepted; everything else is refused.
 */

export type Kind = "image" | "video" | "audio" | "pdf" | "text";
export type Sniffed = { type: string; kind: Kind; ext: string };

const LIMITS_MB: Record<Kind, number> = { image: 25, video: 300, audio: 50, pdf: 30, text: 2 };
export const maxBytes = (kind: Kind) => LIMITS_MB[kind] * 1024 * 1024;
export const limitLabel = (kind: Kind) => `${LIMITS_MB[kind]}MB`;

const starts = (b: Uint8Array, sig: number[], at = 0) => sig.every((x, i) => b[at + i] === x);
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

export function sniff(bytes: Uint8Array, filename = ""): Sniffed | null {
  if (bytes.length < 4) return null;
  if (starts(bytes, [0xff, 0xd8, 0xff])) return { type: "image/jpeg", kind: "image", ext: "jpg" };
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { type: "image/png", kind: "image", ext: "png" };
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") return { type: "image/gif", kind: "image", ext: "gif" };
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return { type: "image/webp", kind: "image", ext: "webp" };
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WAVE") return { type: "audio/wav", kind: "audio", ext: "wav" };
  if (ascii(bytes, 0, 4) === "OggS") return { type: "audio/ogg", kind: "audio", ext: "ogg" };
  if (ascii(bytes, 0, 3) === "ID3") return { type: "audio/mpeg", kind: "audio", ext: "mp3" };
  // MPEG audio frame (MP3) or ADTS (AAC); JPEG, which also starts with 0xFF, was matched above.
  if (bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) return { type: "audio/aac", kind: "audio", ext: "aac" };
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return { type: "audio/mpeg", kind: "audio", ext: "mp3" };
  if (ascii(bytes, 0, 5) === "%PDF-") return { type: "application/pdf", kind: "pdf", ext: "pdf" };
  if (starts(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return { type: "video/webm", kind: "video", ext: "webm" };
  if (ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12);
    if (/^(heic|heix|mif1|msf1|hevc)$/.test(brand)) return { type: "image/heic", kind: "image", ext: "heic" };
    if (/^(M4A |M4B )$/.test(brand)) return { type: "audio/mp4", kind: "audio", ext: "m4a" };
    if (brand === "qt  ") return { type: "video/quicktime", kind: "video", ext: "mov" };
    if (/^(isom|iso2|iso4|iso5|iso6|mp41|mp42|avc1|M4V |M4VH|dash|3gp4|3gp5|3g2a|mmp4|f4v )$/.test(brand)) return { type: "video/mp4", kind: "video", ext: "mp4" };
    return null;
  }
  // Plain text: only for .txt/.csv files, valid UTF-8, no control bytes, and nothing that looks like markup.
  if (/\.(txt|csv)$/i.test(filename) && isPlainText(bytes)) {
    const csv = /\.csv$/i.test(filename);
    return { type: csv ? "text/csv" : "text/plain", kind: "text", ext: csv ? "csv" : "txt" };
  }
  return null;
}

function isPlainText(bytes: Uint8Array): boolean {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, 64 * 1024));
  } catch {
    return false;
  }
  if (/[\u0000-\u0008\u000e-\u001f]/.test(text)) return false;
  return !/<\s*(html|script|svg|iframe|body|meta)\b/i.test(text);
}

/** A file name that is safe to show and to put in a download header. */
export function safeName(name: string, ext: string): string {
  const base = name
    .normalize("NFC")
    .replace(/\.[^.]*$/, "")
    .replace(/[^\p{L}\p{N} _.-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${base || "file"}.${ext}`;
}
