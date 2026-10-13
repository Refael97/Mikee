import { z } from "zod";

export const CTA = z.enum([
  "SHOP_NOW",
  "LEARN_MORE",
  "SIGN_UP",
  "CONTACT_US",
  "BOOK_TRAVEL",
  "GET_OFFER",
  "ORDER_NOW",
  "SUBSCRIBE",
  "WHATSAPP_MESSAGE",
  "MESSAGE_PAGE",
  "CALL_NOW",
  "APPLY_NOW",
  "DOWNLOAD",
]);

export const Media = z.object({
  type: z.enum(["image", "video"]),
  url: z.string().url().describe("Public URL of the image or video file"),
});

export const AdSpec = z.object({
  primaryText: z.string().min(1).describe("Main text above the media, in the brand voice"),
  headline: z.string().optional().describe("Short bold line under the media"),
  description: z.string().optional(),
  link: z.string().url().describe("Where a click goes (product page, landing page, WhatsApp link)"),
  cta: CTA.default("LEARN_MORE"),
  media: Media,
});

export const CampaignSpec = z.object({
  title: z.string().describe("Friendly card headline for the client, plain words without emoji, e.g. 'נותנים לקולקציה החדשה את הבמה'"),
  why: z.string().describe("One or two sentences: what this is for and why it is good for the business"),
  goal: z.enum(["sales", "leads", "traffic", "engagement", "awareness"]),
  dailyBudget: z.number().positive().describe("Daily budget in the ad account currency (major units, e.g. 50 = ₪50)"),
  startTime: z.string().optional().describe("ISO 8601. Omit to start right after approval"),
  endTime: z.string().optional().describe("ISO 8601. Omit to run until stopped"),
  audience: z.object({
    description: z.string().describe("Plain-language summary for the card, e.g. 'קהל חדש בישראל, עם התאמה אוטומטית'"),
    countries: z.array(z.string().length(2)).default(["IL"]),
    cities: z
      .array(z.object({ key: z.string(), name: z.string(), radiusKm: z.number().optional() }))
      .optional()
      .describe("City keys from search_targeting (type adgeolocation)"),
    ageMin: z.number().int().min(18).max(65).optional(),
    ageMax: z.number().int().min(18).max(65).optional(),
    genders: z.enum(["all", "women", "men"]).default("all"),
    interests: z
      .array(z.object({ id: z.string(), name: z.string() }))
      .optional()
      .describe("Interest ids from search_targeting"),
    customAudienceIds: z.array(z.string()).optional(),
    excludedCustomAudienceIds: z.array(z.string()).optional(),
    advantage: z.boolean().default(true).describe("Let Meta expand beyond the suggested audience when it helps"),
  }),
  leadFormId: z.string().optional().describe("For goal=leads with an instant form instead of the website"),
  conversionEvent: z
    .enum(["PURCHASE", "LEAD", "COMPLETE_REGISTRATION", "ADD_TO_CART", "INITIATED_CHECKOUT", "CONTACT", "SCHEDULE"])
    .optional()
    .describe("Website event to optimize for (sales defaults to PURCHASE, website leads to LEAD)"),
  ads: z.array(AdSpec).min(1).max(6),
});
export type CampaignSpec = z.infer<typeof CampaignSpec>;

export const ChangeSpec = z.object({
  title: z.string().describe("Friendly card headline, e.g. 'נותנים לסרטון החדש עוד במה'"),
  why: z.string().describe("What Mikee noticed and why the change helps the business"),
  target: z.object({
    type: z.enum(["campaign", "adset", "ad"]),
    id: z.string(),
    name: z.string().describe("Friendly name shown to the client"),
  }),
  change: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("pause") }),
    z.object({ kind: z.literal("resume") }),
    z.object({ kind: z.literal("daily_budget"), amount: z.number().positive(), previous: z.number().optional() }),
    z.object({ kind: z.literal("end_date"), endTime: z.string() }),
  ]),
});
export type ChangeSpec = z.infer<typeof ChangeSpec>;

export const PostSpec = z.object({
  title: z.string().describe("Friendly card headline, e.g. 'פוסט לקולקציה החדשה'"),
  channels: z.array(z.enum(["facebook", "instagram"])).min(1),
  text: z.string().min(1),
  media: z.array(Media).max(10).default([]).describe("Instagram requires at least one image or video"),
  link: z.string().url().optional().describe("Facebook only: a link to attach when there is no media"),
  scheduleAt: z.string().optional().describe("ISO 8601 time to publish. Omit to publish on approval"),
});
export type PostSpec = z.infer<typeof PostSpec>;

export const MediaSpec = z.object({
  title: z.string().describe("Friendly card headline, e.g. 'סרטון קצר לקולקציה החדשה'"),
  why: z.string().describe("Why this media is needed"),
  type: z.enum(["image", "video"]),
  model: z.string().describe("Higgsfield model id (e.g. marketing_studio_image, gpt_image_2_5, marketing_studio_video, seedance_2_5)"),
  prompt: z.string().min(10),
  aspectRatio: z.string().default("4:5").describe("4:5 or 1:1 for feed, 9:16 for reels and stories"),
  duration: z.number().int().min(2).max(20).optional().describe("Video seconds"),
  count: z.number().int().min(1).max(4).default(1),
  referenceUrls: z.array(z.string().url()).max(4).default([]).describe("Real product photos to base the generation on"),
  referenceRole: z.string().optional().describe("Role for the references as the model defines it (see Higgsfield model info)"),
});
export type MediaSpec = z.infer<typeof MediaSpec>;

export const BudgetRequestSpec = z.object({ amount: z.number().positive(), reason: z.string().min(10), month: z.string() });
export type BudgetRequestSpec = z.infer<typeof BudgetRequestSpec>;

/**
 * Switching a built campaign on. Created by the platform (never by the model) after a campaign card was
 * approved, built paused, and read back from Meta; spending starts only when this card is approved.
 */
export const ActivateSpec = z.object({
  fromProposal: z.string().uuid(),
  title: z.string(),
  campaignId: z.string(),
  adsetId: z.string(),
  adIds: z.array(z.string()),
  dailyBudget: z.number().positive(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  review: z.string().describe("Plain-language state of Meta's ad review at build time"),
  media: z.array(z.object({ type: z.enum(["image", "video"]), url: z.string(), text: z.string().optional(), headline: z.string().optional(), cta: z.string().optional() })).default([]),
});
export type ActivateSpec = z.infer<typeof ActivateSpec>;

export type ProposalKind = "campaign" | "change" | "post" | "budget" | "media" | "activate";

/** What the chat UI renders for a proposal. Built server-side from the specs above. */
export type ProposalCard = {
  kind: ProposalKind;
  title: string;
  why: string;
  rows: { label: string; value: string }[];
  media?: { type: "image" | "video"; url: string; text?: string; headline?: string; cta?: string }[];
  /** For media cards: what is being created, so the screen can show it forming. */
  generate?: { type: "image" | "video"; count: number; ratio: string };
  approveLabel: string;
  changeLabel: string;
};
