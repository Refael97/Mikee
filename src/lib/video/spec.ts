import { z } from "zod";

/**
 * A video Mikee composes from fixed, designed templates. The model fills in words, pictures from the
 * business's library and timing; it never writes HTML or code. The platform turns this into a HyperFrames
 * composition and renders it to MP4.
 */
const text = (max: number) => z.string().trim().min(1).max(max);
const seconds = z.number().min(1.5).max(10).default(3.5);
const mediaId = z.string().uuid().describe("An image id from the business's library (search_library)");

export const VideoScene = z.discriminatedUnion("type", [
  z.object({ type: z.literal("title"), headline: text(60), sub: text(90).optional(), mediaId: mediaId.optional().describe("Background photo"), seconds }),
  z.object({
    type: z.literal("product"),
    mediaId,
    name: text(50),
    price: text(20).optional().describe("As it should read, e.g. ₪349"),
    oldPrice: text(20).optional(),
    note: text(70).optional(),
    seconds,
  }),
  z.object({ type: z.literal("text"), lines: z.array(text(40)).min(1).max(4).describe("Short lines that appear one after the other"), seconds }),
  z.object({ type: z.literal("gallery"), mediaIds: z.array(mediaId).min(2).max(4), caption: text(60).optional(), seconds }),
  z.object({ type: z.literal("quote"), quote: text(160), author: text(40).optional(), seconds }),
  z.object({
    type: z.literal("cta"),
    headline: text(50),
    action: text(30).describe("What to do now, e.g. לקנייה באתר"),
    detail: text(60).optional().describe("Site, phone or coupon as it should read"),
    logoMediaId: mediaId.optional(),
    seconds,
  }),
]);
export type VideoScene = z.infer<typeof VideoScene>;

export const VIDEO_FORMATS = {
  reel: { width: 1080, height: 1920, label: "ריל / סטורי 9:16", ratio: "9/16" },
  feed: { width: 1080, height: 1350, label: "פיד 4:5", ratio: "4/5" },
  square: { width: 1080, height: 1080, label: "ריבוע 1:1", ratio: "1/1" },
  wide: { width: 1920, height: 1080, label: "רוחבי 16:9", ratio: "16/9" },
} as const;

export const VIDEO_STYLES = {
  clean: { label: "נקי", bg: "#ffffff", ink: "#16161a", accent: "#4b3fe0" },
  bold: { label: "נועז", bg: "#4b3fe0", ink: "#ffffff", accent: "#ffd84d" },
  elegant: { label: "אלגנטי", bg: "#14110f", ink: "#f4ede4", accent: "#c9a46a" },
} as const;

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);

export const VideoSpecBase = z.object({
    title: text(80).describe("Short card title, plain text, no emoji"),
    why: text(400).describe("Why this video, in one or two sentences to the client"),
    format: z.enum(["reel", "feed", "square", "wide"]).default("reel"),
    style: z.enum(["clean", "bold", "elegant"]).default("clean"),
    colors: z.object({ bg: hex.optional(), ink: hex.optional(), accent: hex.optional() }).optional().describe("Brand colors, when known"),
    scenes: z.array(VideoScene).min(1).max(8),
});
export const VideoSpec = VideoSpecBase.refine((v) => totalSeconds(v) <= 60, { message: "A video is at most 60 seconds" });
export type VideoSpec = z.infer<typeof VideoSpec>;

export const totalSeconds = (v: { scenes: { seconds?: number }[] }) => Math.round(v.scenes.reduce((s, x) => s + (x.seconds ?? 3.5), 0) * 10) / 10;

/** Every library image the video uses, in order of first appearance. */
export function mediaIdsOf(v: { scenes: VideoScene[] }): string[] {
  const ids: string[] = [];
  for (const s of v.scenes) {
    const add = (id?: string) => id && !ids.includes(id) && ids.push(id);
    if (s.type === "title" || s.type === "product") add(s.mediaId);
    if (s.type === "gallery") s.mediaIds.forEach(add);
    if (s.type === "cta") add(s.logoMediaId);
  }
  return ids;
}
