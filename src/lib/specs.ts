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
  "APPLY_NOW",
  "DOWNLOAD",
  "GET_QUOTE",
]);

/** Instant-form (lead) ads accept only these buttons (docs: marketing-api/guides/lead-ads/create). */
export const LEAD_CTAS = ["APPLY_NOW", "DOWNLOAD", "GET_QUOTE", "LEARN_MORE", "SIGN_UP", "SUBSCRIBE"] as const;

export const Media = z.object({
  type: z.enum(["image", "video"]),
  url: z.string().url().describe("Public URL of the image or video file"),
  metaImageHash: z.string().regex(/^[A-Za-z0-9]{8,64}$/).optional().describe("An image already in the ad account (meta_media images: hash): used as is, not uploaded again"),
  metaVideoId: z.string().regex(/^\d+$/).optional().describe("A video already in the ad account (meta_media videos: id): used as is, not uploaded again"),
});

export const AdSpec = z.object({
  primaryText: z.string().min(1).describe("Main text above the media, in the brand voice"),
  headline: z.string().optional().describe("Short bold line under the media"),
  description: z.string().optional(),
  link: z.string().url().describe("Where a click goes (product page, landing page, WhatsApp link)"),
  cta: CTA.default("LEARN_MORE"),
  media: Media,
});

/** Catalog ads use the product feed instead of requiring an uploaded image/video. */
export const CatalogSpec = z.object({
  catalogId: z.string().regex(/^\d+$/),
  productSetId: z.string().regex(/^\d+$/),
  format: z.enum(["carousel", "single_image"]).default("carousel"),
  catalogName: z.string().optional().describe("Resolved by the server from the connected catalog"),
  productSetName: z.string().optional().describe("Resolved by the server from Meta"),
});
export type CatalogSpec = z.infer<typeof CatalogSpec>;
const CampaignAdSpec = AdSpec.extend({ media: Media.optional().describe("Omit for catalog ads: images come from the approved product set") });

/** Who an ad set reaches. */
export const Audience = z.object({
    description: z.string().describe("Plain-language summary for the card, e.g. 'קהל חדש בישראל, עם התאמה אוטומטית'"),
    countries: z.array(z.string().length(2)).default(["IL"]),
    cities: z
      .array(
        z.object({
          key: z.string(),
          name: z.string(),
          type: z.enum(["city", "region"]).default("city").describe("As search_targeting returned it"),
          radiusKm: z.number().min(17).max(80).optional().describe("Cities only: 17-80 km around the city (Meta's limits)"),
        }),
      )
      .optional()
      .describe("City or region keys from search_targeting (type adgeolocation)"),
    ageMin: z.number().int().min(18).max(65).optional().describe("With advantage on, Meta treats ages as a suggestion and allows a minimum of at most 25"),
    ageMax: z.number().int().min(18).max(65).optional().describe("With advantage on, the maximum is always 65 (Meta's rule); set advantage false for strict ages"),
    genders: z.enum(["all", "women", "men"]).default("all"),
    interests: z
      .array(z.object({ id: z.string(), name: z.string() }))
      .optional()
      .describe("Interest ids from search_targeting"),
    customAudienceIds: z.array(z.string()).optional(),
    excludedCustomAudienceIds: z.array(z.string()).optional(),
    advantage: z.boolean().default(true).describe("Let Meta expand beyond the suggested audience when it helps"),
  });
export type Audience = z.infer<typeof Audience>;

/** One more ad set in a new campaign: its own audience, budget and ads. */
export const AdsetPlan = z.object({
  name: z.string().min(1).max(80).describe("Short plain name for this ad set, e.g. 'נשים 25-45 בתל אביב'"),
  dailyBudget: z.number().positive().describe("This ad set's daily budget in the account currency (major units)"),
  audience: Audience,
  ads: z.array(AdSpec).min(1).max(6),
});
export type AdsetPlan = z.infer<typeof AdsetPlan>;

export const CampaignSpec = z.object({
  title: z.string().describe("Friendly card headline for the client, plain words without emoji, e.g. 'נותנים לקולקציה החדשה את הבמה'"),
  why: z.string().describe("One or two sentences: what this is for and why it is good for the business"),
  goal: z.enum(["sales", "leads", "traffic", "engagement", "awareness"]),
  dailyBudget: z.number().positive().describe("Daily budget in the ad account currency (major units, e.g. 50 = ₪50)"),
  startTime: z.string().optional().describe("ISO 8601. Omit to start right after approval"),
  endTime: z.string().optional().describe("ISO 8601. Omit to run until stopped"),
  audience: Audience,
  leadFormId: z.string().optional().describe("For goal=leads with an instant form instead of the website"),
  leadFormName: z.string().max(200).optional().describe("Filled in by the platform from Meta; not needed in the request"),
  conversionEvent: z
    .enum(["PURCHASE", "LEAD", "COMPLETE_REGISTRATION", "ADD_TO_CART", "INITIATED_CHECKOUT", "CONTACT", "SCHEDULE"])
    .optional()
    .describe("Website event to optimize for (sales defaults to PURCHASE, website leads to LEAD)"),
  catalog: CatalogSpec.optional().describe("For catalog sales: connected catalog and a product set returned by get_campaign_context. Never replace a catalog request with ordinary traffic ads."),
  buildOnly: z.boolean().default(false).describe("True when the client asks for a paused test or build only. Never auto-activate, even at final autonomy."),
  ads: z.array(CampaignAdSpec).min(1).max(6),
  moreAdsets: z
    .array(AdsetPlan.extend({ ads: z.array(CampaignAdSpec).min(1).max(6) }))
    .max(4)
    .optional()
    .describe("More ad sets in the same new campaign (the top-level audience, dailyBudget and ads are the first ad set). Each has its own budget."),
}).superRefine((s, ctx) => {
  if (s.catalog && (s.goal !== "sales" || s.leadFormId)) ctx.addIssue({ code: "custom", path: ["catalog"], message: "Catalog campaigns require goal=sales and cannot use a lead form." });
  for (const [i, set] of [{ ads: s.ads }, ...(s.moreAdsets ?? [])].entries()) {
    for (const [j, ad] of set.ads.entries()) {
      const path = i === 0 ? ["ads", j] : ["moreAdsets", i - 1, "ads", j];
      if (!s.catalog && !ad.media) ctx.addIssue({ code: "custom", path: [...path, "media"], message: "An ordinary ad needs an image or video; catalog ads need catalog and productSetId instead." });
      if (s.catalog && ad.media) ctx.addIssue({ code: "custom", path: [...path, "media"], message: "Catalog ads use product feed media; omit media rather than silently ignoring it." });
    }
  }
});
export type CampaignSpec = z.infer<typeof CampaignSpec>;

/** Every ad set of a new campaign, the first one from the top-level fields. */
export function adsetsOf(spec: CampaignSpec): { name?: string; dailyBudget: number; audience: Audience; ads: CampaignSpec["ads"] }[] {
  return [{ dailyBudget: spec.dailyBudget, audience: spec.audience, ads: spec.ads }, ...(spec.moreAdsets ?? [])];
}

/** The whole campaign's daily budget: every ad set together. */
export const totalDaily = (spec: CampaignSpec) => adsetsOf(spec).reduce((s, a) => s + a.dailyBudget, 0);

/** Copying an existing ad set (with or without its ads), paused, into its own campaign or a matching one. */
export const AdsetCopySpec = z.object({
  title: z.string().describe("Friendly card headline, e.g. 'עוד סדרה לקהל חדש באותו קמפיין'"),
  why: z.string().describe("What the copy is for, in plain words"),
  sourceAdsetId: z.string().regex(/^\d+$/).describe("The ad set to copy (an id from read_results)"),
  includeAds: z.boolean().default(true).describe("Copy its ads too"),
  targetCampaignId: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .describe("Only when she asked for a different existing campaign; omit to copy into the source's own campaign (the server reads it)"),
  changes: z
    .object({
      name: z.string().min(1).max(120).optional(),
      audience: Audience.optional().describe("A different audience for the copy"),
      dailyBudget: z.number().positive().optional(),
    })
    .optional()
    .describe("Applied to the paused copy right after it is made"),
  // Filled in by the server from Meta, never by the model.
  sourceName: z.string().optional(),
  sourceCampaignId: z.string().optional(),
  targetCampaignName: z.string().optional(),
  sourceAdCount: z.number().int().optional(),
  copyDailyBudget: z.number().optional(),
});
export type AdsetCopySpec = z.infer<typeof AdsetCopySpec>;

/** A new ad set inside an existing campaign of this business. */
export const AdsetAddSpec = z.object({
  title: z.string().describe("Friendly card headline, e.g. 'סדרה חדשה לגברים בקמפיין הקיים'"),
  why: z.string(),
  campaignId: z.string().regex(/^\d+$/).describe("The existing campaign it goes into (an id from read_results)"),
  adset: AdsetPlan.extend({ dailyBudget: z.number().positive().optional().describe("Leave out when the campaign holds the budget itself") }),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  leadFormId: z.string().optional().describe("Needed when the campaign's ad sets use an instant form"),
  // Filled in by the server from Meta.
  campaignName: z.string().optional(),
  campaignBudget: z.boolean().optional(),
});
export type AdsetAddSpec = z.infer<typeof AdsetAddSpec>;

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
  format: z.enum(["auto", "story"]).default("auto").describe("Use story ONLY when asked for an Instagram Story; auto preserves existing feed/reel/carousel behavior. Stories accept exactly one image or video and no caption."),
  text: z.string().default(""),
  media: z.array(Media).max(10).default([]).describe("Instagram requires at least one image or video"),
  link: z.string().url().optional().describe("Facebook only: a link to attach when there is no media"),
  scheduleAt: z.string().datetime({ offset: true }).optional().describe("ISO 8601 time to publish, 10 minutes to 30 days ahead (Facebook only). Omit to publish on approval"),
});
export type PostSpec = z.infer<typeof PostSpec>;

export const MediaSpec = z.object({
  title: z.string().describe("Friendly card headline, e.g. 'סרטון קצר לקולקציה החדשה'"),
  why: z.string().describe("Why this media is needed"),
  type: z.enum(["image", "video"]),
  model: z.string().describe("Higgsfield model id (e.g. marketing_studio_image, gpt_image_2_5, marketing_studio_video, seedance_2_5)"),
  prompt: z.string().min(10),
  aspectRatio: z.string().default("4:5").describe("4:5 or 1:1 for feed photos (Instagram feed photos must be between 4:5 and 1.91:1), 9:16 for reel videos"),
  duration: z.number().int().min(3).max(20).optional().describe("Video seconds (Instagram and Facebook Reels need at least 3)"),
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
  catalog: CatalogSpec.optional(),
  fromProposal: z.string().uuid(),
  title: z.string(),
  campaignId: z.string(),
  adsetId: z.string(),
  adIds: z.array(z.string()),
  /** Every ad set to switch on (a new campaign can have several). */
  adsetIds: z.array(z.string()).optional(),
  /** "adsets": only the new ad sets and their ads go live, inside a campaign that already exists. */
  scope: z.enum(["campaign", "adsets"]).default("campaign"),
  dailyBudget: z.number().min(0),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  review: z.string().describe("Plain-language state of Meta's ad review at build time"),
  media: z
    .array(
      z.object({
        type: z.enum(["image", "video"]),
        url: z.string(),
        text: z.string().optional(),
        headline: z.string().optional(),
        cta: z.string().optional(),
        metaImageHash: z.string().optional(),
        metaVideoId: z.string().optional(),
      }),
    )
    .default([]),
});
export type ActivateSpec = z.infer<typeof ActivateSpec>;

export { VideoSpec } from "./video/spec";

export type ProposalKind = "campaign" | "change" | "post" | "budget" | "media" | "activate" | "video" | "adset" | "adset_copy";

/** What the chat UI renders for a proposal. Built server-side from the specs above. */
export type ProposalCard = {
  kind: ProposalKind;
  /** The card's label when it differs from its kind's (e.g. switching on an ad set, not a whole campaign). */
  label?: string;
  title: string;
  why: string;
  rows: { label: string; value: string }[];
  /** metaImageHash / metaVideoId: media already in the ad account, previewed through /api/meta/media. */
  media?: { type: "image" | "video"; url: string; text?: string; headline?: string; cta?: string; metaImageHash?: string; metaVideoId?: string }[];
  /** For media cards: what is being created, so the screen can show it forming. */
  generate?: { type: "image" | "video"; count: number; ratio: string };
  /** For video cards: the composition plays in the card before approval. */
  preview?: { ratio: string; seconds: number };
  approveLabel: string;
  changeLabel: string;
};
