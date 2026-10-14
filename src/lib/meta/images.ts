import "server-only";
import sharp from "sharp";
import { bytesFromOwnUrl, storeBytes } from "../media";
import { safeFetch } from "../net";

/**
 * Photos as each network accepts them. Instagram takes JPEG only, at most 8MB, with an aspect ratio between
 * 4:5 and 1.91:1 (docs: instagram-platform/content-publishing, ig-user/media). Facebook Page photos take
 * JPEG, PNG and GIF up to 10MB (docs: page/photos). The library keeps PNG, WebP, HEIC and 9:16 images, so
 * each one is converted on the way out: oriented, in sRGB, cropped to the nearest allowed shape when it is
 * too tall or too wide (from the center), at most 1440px wide, and compressed until it fits.
 */
export type Target = "instagram" | "facebook";

const LIMIT: Record<Target, number> = { instagram: 8 * 1024 * 1024, facebook: 10 * 1024 * 1024 };
const MIN_RATIO = 4 / 5;
const MAX_RATIO = 1.91;

async function original(url: string): Promise<Buffer> {
  const own = await bytesFromOwnUrl(url);
  if (own) return own;
  const res = await safeFetch(url, { maxBytes: 30 * 1024 * 1024, timeoutMs: 60_000 });
  if (!res.ok) throw new Error(`Could not download the image (HTTP ${res.status})`);
  return Buffer.from(await res.bytes());
}

export async function toSocialJpeg(input: Buffer, target: Target): Promise<Buffer> {
  let img = sharp(input, { failOn: "none" }).rotate();
  const meta = await img.metadata();
  let w = meta.autoOrient?.width ?? meta.width ?? 0;
  let h = meta.autoOrient?.height ?? meta.height ?? 0;
  if (!w || !h) throw new Error("The image could not be read");
  if (target === "instagram") {
    const ratio = w / h;
    if (ratio < MIN_RATIO) {
      const nh = Math.round(w / MIN_RATIO);
      img = img.extract({ left: 0, top: Math.round((h - nh) / 2), width: w, height: nh });
      h = nh;
    } else if (ratio > MAX_RATIO) {
      const nw = Math.round(h * MAX_RATIO);
      img = img.extract({ left: Math.round((w - nw) / 2), top: 0, width: nw, height: h });
      w = nw;
    }
  }
  const base = await img.resize({ width: Math.min(w, 1440), withoutEnlargement: true }).toColourspace("srgb").toBuffer();
  for (const quality of [90, 82, 74, 66, 58]) {
    const out = await sharp(base).jpeg({ quality, mozjpeg: true }).toBuffer();
    if (out.length <= LIMIT[target]) return out;
  }
  throw new Error("The image is too large even after compression");
}

/** A converted copy kept with the business's files (not shown in the library), served from a signed link. */
export async function socialImageUrl(workspaceId: string, url: string, target: Target): Promise<string> {
  const jpeg = await toSocialJpeg(await original(url), target);
  const m = await storeBytes(workspaceId, jpeg, { filename: `${target}.jpg`, source: "prepared", sourceRef: url.slice(0, 300), inLibrary: false });
  return m.url;
}
