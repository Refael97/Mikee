import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db";
import { BRAIN_SECTIONS, type BrainSection, writeBrain } from "../brain";
import { assertWithinBudget, budgetStatus, BudgetExceeded, dailyCommit } from "../budget";
import { getConnection, type WebsiteConfig } from "../connections";
import { logActivity } from "../activity";
import { metaContext, money, requireAdAccount } from "../meta/context";
import { currentDailyBudget, describeError } from "../meta/actions";
import { insights, readCampaigns } from "../meta/performance";
import { budgetCard, campaignCard, changeCard, createProposal, postCard } from "../proposals";
import { CampaignSpec, ChangeSpec, PostSpec } from "../specs";
import { inventory, salesSummary } from "../store";
import { publicProducts, scanWebsite } from "../website";

export type ToolContext = { workspaceId: string; tz: string };

type ToolDef<S extends z.ZodType> = {
  name: string;
  description: string;
  input: S;
  run: (ctx: ToolContext, input: z.infer<S>) => Promise<unknown>;
};

const tool = <S extends z.ZodType>(def: ToolDef<S>) => def;

const Period = z.enum(["today", "yesterday", "last_7d", "last_14d", "last_30d", "this_month", "last_month", "maximum"]);

/** Spending and audience-changing endpoints must go through proposal cards. */
const GUARDED_PATH = /\/(campaigns|adsets|ads|copies)\/?$|^\/?\d+\/?$/;
const GUARDED_PARAM = /^(daily_budget|lifetime_budget|spend_cap|bid_amount|bid_strategy|status|end_time|stop_time)$/;

export const TOOLS = [
  tool({
    name: "remember",
    description: "Save something lasting about the business into the brain (long-term memory). Use replace to rewrite a whole section, append to add a note.",
    input: z.object({
      section: z.enum(Object.keys(BRAIN_SECTIONS) as [BrainSection, ...BrainSection[]]),
      content: z.string().min(1),
      mode: z.enum(["replace", "append"]).default("append"),
    }),
    run: async (ctx, i) => {
      await writeBrain(ctx.workspaceId, i.section, i.content, i.mode);
      return { saved: true };
    },
  }),

  tool({
    name: "set_stage",
    description: "Move the onboarding forward: 'interview' after the first scan, 'active' once goals are clear.",
    input: z.object({ stage: z.enum(["interview", "active"]) }),
    run: async (ctx, i) => {
      const d = await db();
      await d.update(schema.workspaces).set({ stage: i.stage }).where(eq(schema.workspaces.id, ctx.workspaceId));
      return { stage: i.stage };
    },
  }),

  tool({
    name: "scan_website",
    description: "Read the business website: key pages (about, products, services, contact, FAQ) and, for online stores, the public product list with prices and stock.",
    input: z.object({ url: z.string().optional().describe("Defaults to the connected website"), maxPages: z.number().int().min(1).max(40).default(15) }),
    run: async (ctx, i) => {
      const site = await getConnection<WebsiteConfig>(ctx.workspaceId, "website");
      const url = i.url ?? site?.config.url;
      if (!url) return { error: "No website connected" };
      const res = await scanWebsite(url, i.maxPages);
      return { ...res, products: res.products.slice(0, 120) };
    },
  }),

  tool({
    name: "read_store",
    description: "Online store data: 'sales' = orders, revenue, monthly trend, best sellers, returning customers; 'products' = products with price and stock (exact stock when the store admin is connected).",
    input: z.object({ what: z.enum(["sales", "products"]), days: z.number().int().min(7).max(730).default(180) }),
    run: async (ctx, i) => {
      if (i.what === "sales") return salesSummary(ctx.workspaceId, i.days);
      const exact = await inventory(ctx.workspaceId).catch((e) => ({ error: describeError(e) }));
      if (Array.isArray(exact)) return { source: "store admin", products: exact.slice(0, 200) };
      const site = await getConnection<WebsiteConfig>(ctx.workspaceId, "website");
      if (!site?.config.url) return { error: "No store or website connected" };
      const origin = new URL(/^https?:/.test(site.config.url) ? site.config.url : `https://${site.config.url}`).origin;
      return { source: "public website", products: (await publicProducts(origin, site.config.platform ?? "other")).slice(0, 200) };
    },
  }),

  tool({
    name: "read_results",
    description: "Campaigns in plain terms: goal, audience, budget, dates, results and every ad with its performance verdict (star/ok/weak/new). Includes internal ids you need for propose_change.",
    input: z.object({ period: Period.default("last_7d"), includeEnded: z.boolean().default(false) }),
    run: async (ctx, i) => {
      const meta = await metaContext(ctx.workspaceId);
      const campaigns = await readCampaigns(meta, i.period, i.includeEnded);
      return { currency: meta.currency, period: i.period, campaigns };
    },
  }),

  tool({
    name: "read_insights",
    description: "Detailed performance numbers for deeper analysis: by level, custom date range, breakdowns (age, gender, region, publisher_platform, platform_position, device_platform) or daily trend (timeIncrement '1').",
    input: z.object({
      level: z.enum(["account", "campaign", "adset", "ad"]),
      period: Period.optional(),
      since: z.string().optional().describe("YYYY-MM-DD"),
      until: z.string().optional().describe("YYYY-MM-DD"),
      breakdowns: z.string().optional(),
      timeIncrement: z.string().optional(),
    }),
    run: async (ctx, i) => insights(await metaContext(ctx.workspaceId), i),
  }),

  tool({
    name: "read_social",
    description: "Recent organic posts from Instagram or the Facebook page, with engagement, to learn voice and what content works. Media URLs can be reused in ads and posts.",
    input: z.object({ channel: z.enum(["instagram", "facebook"]), limit: z.number().int().min(1).max(100).default(30) }),
    run: async (ctx, i) => {
      const meta = await metaContext(ctx.workspaceId);
      if (i.channel === "instagram") {
        if (!meta.igUserId) return { error: "Instagram not connected" };
        return meta.graph.all(`/${meta.igUserId}/media`, {
          fields: "caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
        }, i.limit);
      }
      if (!meta.pageId) return { error: "Facebook page not connected" };
      const page = await meta.graph.forPage(meta.pageId);
      return page.all(`/${meta.pageId}/posts`, {
        fields: "message,created_time,full_picture,permalink_url,shares,reactions.summary(true).limit(0),comments.summary(true).limit(0)",
      }, i.limit);
    },
  }),

  tool({
    name: "budget_status",
    description: "This month's marketing budget: the ceiling the client set (plus approved increases), spent so far, what running campaigns will spend until month end, and the room left.",
    input: z.object({}),
    run: async (ctx) => budgetStatus(ctx.workspaceId, ctx.tz, await metaContext(ctx.workspaceId)),
  }),

  tool({
    name: "search_targeting",
    description: "Find audience building blocks: interests (type adinterest) or places like cities and regions (type adgeolocation). Returns ids to use in propose_campaign.",
    input: z.object({ type: z.enum(["adinterest", "adgeolocation"]), q: z.string().min(2), countryCode: z.string().length(2).default("IL") }),
    run: async (ctx, i) => {
      const meta = await metaContext(ctx.workspaceId);
      return meta.graph.get("/search", {
        type: i.type,
        q: i.q,
        limit: 15,
        ...(i.type === "adgeolocation" ? { location_types: JSON.stringify(["city", "region"]), country_code: i.countryCode } : {}),
      });
    },
  }),

  tool({
    name: "list_audiences",
    description: "Saved audiences on the ad account (website visitors, customers, lookalikes, engagers), for targeting or exclusion.",
    input: z.object({}),
    run: async (ctx) => {
      const meta = await metaContext(ctx.workspaceId);
      return meta.graph.all(`/${requireAdAccount(meta)}/customaudiences`, {
        fields: "id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound,time_updated",
      });
    },
  }),

  tool({
    name: "meta_read",
    description: "Read anything else from Meta (Graph API GET), e.g. product catalogs and sets, lead forms and leads, pixel stats, ad previews, page info. Path like '/act_123/product_catalogs' or '/{id}'. Use the ids from connections or other results.",
    input: z.object({ path: z.string().startsWith("/"), params: z.record(z.string(), z.unknown()).default({}) }),
    run: async (ctx, i) => {
      const meta = await metaContext(ctx.workspaceId);
      const { access_token: _, ...params } = i.params as Record<string, unknown>;
      return meta.graph.get(i.path, params);
    },
  }),

  tool({
    name: "meta_write",
    description: "Set things up on Meta that do not spend money and are not public (Graph API POST): custom and lookalike audiences, product sets, catalog items, lead forms, pixel custom conversions. Anything that spends, changes budgets or status, or publishes must use the propose_* tools instead.",
    input: z.object({
      path: z.string().startsWith("/"),
      params: z.record(z.string(), z.unknown()).default({}),
      purpose: z.string().describe("One line, for the activity log"),
    }),
    run: async (ctx, i) => {
      const params = i.params as Record<string, unknown>;
      if (GUARDED_PATH.test(i.path) || Object.keys(params).some((k) => GUARDED_PARAM.test(k))) {
        return { error: "This changes spend, status or ads. Use propose_campaign / propose_change so the client approves it." };
      }
      const meta = await metaContext(ctx.workspaceId);
      const { access_token: _, ...clean } = params;
      const res = await meta.graph.post(i.path, clean);
      await logActivity(ctx.workspaceId, "setup", i.purpose, { path: i.path });
      return res;
    },
  }),

  tool({
    name: "propose_campaign",
    description: "Prepare a new campaign and show the client a friendly card to approve. Nothing runs until she taps approve; then the platform builds it exactly as specified. Checks the monthly budget first.",
    input: CampaignSpec,
    run: async (ctx, spec) => {
      const meta = await metaContext(ctx.workspaceId);
      await assertWithinBudget(ctx.workspaceId, ctx.tz, meta, dailyCommit(spec.dailyBudget, ctx.tz, spec.endTime, spec.startTime));
      const p = await createProposal(ctx.workspaceId, "campaign", campaignCard(spec, meta.currency ?? "ILS"), spec);
      return { proposalId: p.id, shown: "The card is now in front of the client. Wait for her decision." };
    },
  }),

  tool({
    name: "propose_change",
    description: "Suggest a change to something running (pause, resume, daily budget, end date) as a card the client approves with one tap. Use ids from read_results. For budget changes include the previous amount.",
    input: ChangeSpec,
    run: async (ctx, spec) => {
      const meta = await metaContext(ctx.workspaceId);
      const c = spec.change;
      if ((c.kind === "daily_budget" || c.kind === "resume") && spec.target.type !== "ad") {
        const now = await currentDailyBudget(meta, spec.target.type, spec.target.id);
        const delta = c.kind === "daily_budget" ? c.amount - now.daily : now.daily;
        await assertWithinBudget(ctx.workspaceId, ctx.tz, meta, dailyCommit(Math.max(0, delta), ctx.tz, now.end));
        if (c.kind === "daily_budget" && c.previous == null) c.previous = now.daily;
      }
      const p = await createProposal(ctx.workspaceId, "change", changeCard(spec, meta.currency ?? "ILS"), spec);
      return { proposalId: p.id, shown: "The card is now in front of the client." };
    },
  }),

  tool({
    name: "propose_post",
    description: "Prepare an organic post (Facebook page and/or Instagram, image, video/reel or carousel) and show it to the client for approval before publishing.",
    input: PostSpec,
    run: async (ctx, spec) => {
      const p = await createProposal(ctx.workspaceId, "post", postCard(spec), spec);
      return { proposalId: p.id, shown: "The post preview is now in front of the client." };
    },
  }),

  tool({
    name: "request_budget_increase",
    description: "Ask the client for extra marketing budget for this month only, with a clear business reason. Only an approved increase raises the ceiling.",
    input: z.object({ amount: z.number().positive(), reason: z.string().min(10) }),
    run: async (ctx, i) => {
      const meta = await metaContext(ctx.workspaceId).catch(() => null);
      const currency = meta?.currency ?? "ILS";
      const p = await createProposal(ctx.workspaceId, "budget", budgetCard(i.amount, i.reason, currency), i);
      return { proposalId: p.id, amount: money(i.amount, currency) };
    },
  }),
];

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

function jsonSchema(s: z.ZodType): Anthropic.Beta.BetaTool.InputSchema {
  const { $schema: _, ...rest } = z.toJSONSchema(s, { io: "input" }) as Record<string, unknown>;
  return rest as Anthropic.Beta.BetaTool.InputSchema;
}

export const TOOL_DEFINITIONS: Anthropic.Beta.BetaTool[] = TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: jsonSchema(t.input),
  eager_input_streaming: true,
}));

/** Validates the model's input against the tool's schema, runs it, and turns failures into readable results. */
export async function runTool(ctx: ToolContext, name: string, rawInput: unknown): Promise<{ content: string; isError: boolean }> {
  const def = BY_NAME.get(name);
  if (!def) return { content: `Unknown tool ${name}`, isError: true };
  const parsed = def.input.safeParse(rawInput);
  if (!parsed.success) {
    return { content: `Invalid input: ${z.prettifyError(parsed.error)}`, isError: true };
  }
  try {
    const out = await def.run(ctx, parsed.data as never);
    const text = JSON.stringify(out ?? { ok: true });
    return { content: text.length > 60000 ? `${text.slice(0, 60000)}…(truncated)` : text, isError: false };
  } catch (err) {
    if (err instanceof BudgetExceeded) return { content: err.message, isError: true };
    return { content: describeError(err), isError: true };
  }
}
