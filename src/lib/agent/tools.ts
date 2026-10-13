import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db";
import { remember as rememberFact, setFact, TOPICS, type Topic } from "../brain";
import { assertWithinBudget, budgetStatus, BudgetExceeded, dailyCommit, monthKey } from "../budget";
import { getConnection, type WebsiteConfig } from "../connections";
import { logActivity } from "../activity";
import { metaContext, money, requireAdAccount } from "../meta/context";
import { currentDailyBudget, describeError } from "../meta/actions";
import { insights, readCampaigns } from "../meta/performance";
import { fileConversation } from "../conversations";
import { mediaGenerator } from "../higgsfield";
import { approveProposal, createProposal, ProposalConflict } from "../proposals";
import { CampaignSpec, ChangeSpec, MediaSpec, PostSpec } from "../specs";
import { mediaAllowance } from "../usage";
import { inventory, salesSummary } from "../store";
import { publicProducts, scanWebsite } from "../website";

export type ToolContext = {
  workspaceId: string;
  tz: string;
  /** The conversation the work belongs to (cards report their outcome there). */
  conversationId?: string;
  /** Lets a tool surface progress (e.g. a card created by a specialist) to the client's screen. */
  emit?: (e: { t: "proposal"; id: string } | { t: "tool"; name: string; state: "start" | "done" | "error" }) => void | Promise<void>;
};

/**
 * read: looks only. memory: writes Mikee's notes. setup: non-spending, non-public Meta configuration.
 * proposal: creates a card; nothing happens outside the platform until the client approves it.
 * No tool spends money or publishes by itself (enforced by tests in tests/approvals.test.ts).
 */
export type Effect = "read" | "memory" | "setup" | "proposal" | "delegate";

export type ToolDef<S extends z.ZodType = z.ZodType> = {
  name: string;
  effect: Effect;
  description: string;
  input: S;
  run: (ctx: ToolContext, input: z.infer<S>) => Promise<unknown>;
};

export const tool = <S extends z.ZodType>(def: ToolDef<S>) => def as unknown as ToolDef;

const Period = z.enum(["today", "yesterday", "last_7d", "last_14d", "last_30d", "this_month", "last_month", "maximum"]);

/** Endpoints that spend, change what runs, publish, or change the account: only through cards. */
export const GUARDED_PATH =
  /\/(campaigns|adsets|ads|copies|feed|photos|videos|media|media_publish|live_videos|stories)\/?$|^\/?\d+\/?$|^\/?act_\d+\/?$/;
export const GUARDED_PARAM = /^(daily_budget|lifetime_budget|spend_cap|spend_cap_action|bid_amount|bid_strategy|status|end_time|stop_time|published)$/;

const proposalOptions = {
  replaces: z.string().uuid().optional().describe("Id of a waiting card this one replaces (when the client asked for a change)"),
  clientAsked: z.boolean().optional().describe("True only when the client explicitly asked for this in the conversation"),
};

export const TOOLS = [
  tool({
    name: "remember",
    effect: "memory",
    description:
      "Save one short sentence about the business. source=client only for what the client herself said or approved; " +
      "anything you read or concluded is a suggestion she can confirm. Results-based learnings are kind=insight with the evidence and dates in the text, never rules. " +
      "Do not store prices, stock levels or running promotions: they change, so read them fresh before using them.",
    input: z.object({
      topic: z.enum(Object.keys(TOPICS) as [Topic, ...Topic[]]),
      text: z.string().min(3).max(400),
      kind: z.enum(["fact", "preference", "rule", "insight"]),
      source: z.enum(["client", "website", "store", "meta", "mikee"]),
      sourceDetail: z.string().max(200).optional().describe("e.g. the page URL, the period of the results"),
      replaces: z.string().uuid().optional().describe("Id of an outdated sentence this one replaces"),
    }),
    run: async (ctx, i) => {
      const row = await rememberFact(ctx.workspaceId, i);
      return { saved: row.id, status: row.status };
    },
  }),

  tool({
    name: "forget",
    effect: "memory",
    description: "Archive a sentence in the brain that is wrong or no longer true.",
    input: z.object({ id: z.string().uuid() }),
    run: async (ctx, i) => {
      await setFact(ctx.workspaceId, i.id, { status: "archived" });
      return { archived: i.id };
    },
  }),

  tool({
    name: "file_conversation",
    effect: "memory",
    description:
      "Give the current conversation a short title (2-5 words, Hebrew, like a folder label) and file it under a category: " +
      "campaigns (paid ads, budgets, audiences), content (posts, reels, copy, visuals), results (performance, reports, recommendations), " +
      "business (products, goals, brand), general. Call it in your first turn of a new conversation, and again only if the topic clearly changes.",
    input: z.object({
      title: z.string().min(2).max(60),
      category: z.enum(["campaigns", "content", "results", "business", "general"]),
    }),
    run: async (ctx, i) => {
      if (!ctx.conversationId) return { error: "No conversation" };
      const c = await fileConversation(ctx.workspaceId, ctx.conversationId, i);
      return { title: c?.title, category: c?.category, note: c && !c.auto ? "The client filed this conversation herself; the category stays." : undefined };
    },
  }),

  tool({
    name: "set_stage",
    effect: "memory",
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
    effect: "read",
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
    effect: "read",
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
    effect: "read",
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
    effect: "read",
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
    effect: "read",
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
    effect: "read",
    description: "This month's marketing budget: the ceiling the client set (plus approved increases), spent so far, what running campaigns will spend until month end, and the room left.",
    input: z.object({}),
    run: async (ctx) => budgetStatus(ctx.workspaceId, ctx.tz, await metaContext(ctx.workspaceId)),
  }),

  tool({
    name: "search_targeting",
    effect: "read",
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
    effect: "read",
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
    effect: "read",
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
    effect: "setup",
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
    effect: "proposal",
    description:
      "Prepare a new campaign and show the client a card. Nothing runs until she approves that exact card; the platform then builds it exactly as specified. " +
      "Checks the monthly budget (including other waiting cards) first. If she asks for a change, send a new card with replaces.",
    input: CampaignSpec.extend(proposalOptions),
    run: async (ctx, { replaces, clientAsked, ...spec }) => {
      const meta = await metaContext(ctx.workspaceId);
      const reserved = dailyCommit(spec.dailyBudget, ctx.tz, spec.endTime, spec.startTime);
      await assertWithinBudget(ctx.workspaceId, ctx.tz, meta, reserved, { excludeProposalId: replaces });
      const p = await createProposal({
        workspaceId: ctx.workspaceId,
        conversationId: ctx.conversationId,
        kind: "campaign",
        action: spec,
        month: monthKey(ctx.tz),
        currency: meta.currency,
        reserved,
        replaces,
        clientAsked,
      });
      return { proposalId: p.id, shown: "The card is in front of the client. Wait for her decision." };
    },
  }),

  tool({
    name: "propose_change",
    effect: "proposal",
    description:
      "Suggest a change to something running (pause, resume, daily budget, end date) as a card the client approves with one tap. Use ids from read_results. " +
      "Only one waiting card per campaign/ad at a time.",
    input: ChangeSpec.extend(proposalOptions),
    run: async (ctx, { replaces, clientAsked, ...spec }) => {
      const meta = await metaContext(ctx.workspaceId);
      const c = spec.change;
      let reserved = 0;
      if ((c.kind === "daily_budget" || c.kind === "resume") && spec.target.type !== "ad") {
        const now = await currentDailyBudget(meta, spec.target.type, spec.target.id);
        const node = await meta.graph.get<{ effective_status?: string }>(`/${spec.target.id}`, { fields: "effective_status" });
        const live = node.effective_status === "ACTIVE";
        const delta = c.kind === "daily_budget" ? (live ? c.amount - now.daily : 0) : live ? 0 : now.daily;
        reserved = dailyCommit(Math.max(0, delta), ctx.tz, now.end);
        await assertWithinBudget(ctx.workspaceId, ctx.tz, meta, reserved, { excludeProposalId: replaces });
        if (c.kind === "daily_budget" && c.previous == null) c.previous = now.daily;
      }
      const p = await createProposal({
        workspaceId: ctx.workspaceId,
        conversationId: ctx.conversationId,
        kind: "change",
        action: spec,
        month: monthKey(ctx.tz),
        currency: meta.currency,
        reserved,
        replaces,
        clientAsked,
      });
      return { proposalId: p.id, shown: "The card is in front of the client." };
    },
  }),

  tool({
    name: "propose_post",
    effect: "proposal",
    description: "Prepare an organic post (Facebook page and/or Instagram, image, video/reel or carousel) and show it to the client before publishing.",
    input: PostSpec.extend(proposalOptions),
    run: async (ctx, { replaces, clientAsked, ...spec }) => {
      const p = await createProposal({ workspaceId: ctx.workspaceId, conversationId: ctx.conversationId, kind: "post", action: spec, month: monthKey(ctx.tz), replaces, clientAsked });
      return { proposalId: p.id, shown: "The post preview is in front of the client." };
    },
  }),

  tool({
    name: "propose_media",
    effect: "proposal",
    description:
      "Create an image or a short video with Higgsfield (costs credits). Gets the exact price first. Within the monthly amount the client pre-approved it runs right away; " +
      "otherwise she sees a card with the price. Models: marketing_studio_image (products/ads), gpt_image_2_5 (general, text in image), " +
      "marketing_studio_video (product video ads), seedance_2_5 (general video). Use real product photos as referenceUrls when relevant. " +
      "When it is ready you get its URLs in a platform event; use them in propose_post / propose_campaign.",
    input: MediaSpec.extend(proposalOptions),
    run: async (ctx, { replaces, clientAsked, ...spec }) => {
      const gen = mediaGenerator();
      if (!gen) return { error: "Media generation is not connected yet. Use existing photos and videos from the website or Instagram." };
      const refs = await Promise.all(spec.referenceUrls.map((u) => gen.importUrl(u)));
      const credits = await gen.quote(spec, refs);
      const allowance = await mediaAllowance(ctx.workspaceId, ctx.tz);
      if (credits > allowance.remaining) {
        return { error: `This costs ${credits} credits; ${allowance.remaining} are left in this month's media budget (set by the client in Settings).` };
      }
      const p = await createProposal({
        workspaceId: ctx.workspaceId,
        conversationId: ctx.conversationId,
        kind: "media",
        action: spec,
        month: monthKey(ctx.tz),
        reserved: credits,
        credits,
        replaces,
        clientAsked,
      });
      if (credits <= allowance.autoRemaining) {
        await approveProposal(ctx.workspaceId, p.id, p.versionHash, { auto: true });
        return { proposalId: p.id, credits, autoApproved: true, shown: "Within the client's pre-approved media allowance: generating now." };
      }
      return { proposalId: p.id, credits, shown: "The client sees the price and approves before anything is generated." };
    },
  }),

  tool({
    name: "request_budget_increase",
    effect: "proposal",
    description: "Ask the client for extra marketing budget for this month only, with a clear business reason. Only an approved increase raises the ceiling.",
    input: z.object({ amount: z.number().positive(), reason: z.string().min(10), ...proposalOptions }),
    run: async (ctx, { replaces, clientAsked, ...i }) => {
      const meta = await metaContext(ctx.workspaceId).catch(() => null);
      const month = monthKey(ctx.tz);
      const p = await createProposal({
        workspaceId: ctx.workspaceId,
        conversationId: ctx.conversationId,
        kind: "budget",
        action: { ...i, month },
        month,
        currency: meta?.currency,
        replaces,
        clientAsked,
      });
      return { proposalId: p.id, amount: money(i.amount, meta?.currency ?? "ILS") };
    },
  }),
];

export const BASE_TOOLS = new Map(TOOLS.map((t) => [t.name, t]));

/** The subset of tools with these names, in the given order. Throws on a typo so a role never silently loses a tool. */
export function pick(names: string[]): ToolDef[] {
  return names.map((n) => {
    const t = BASE_TOOLS.get(n);
    if (!t) throw new Error(`Unknown tool ${n}`);
    return t;
  });
}

function jsonSchema(s: z.ZodType): Anthropic.Beta.BetaTool.InputSchema {
  const { $schema: _, ...rest } = z.toJSONSchema(s, { io: "input" }) as Record<string, unknown>;
  return rest as Anthropic.Beta.BetaTool.InputSchema;
}

export function toolDefinitions(tools: ToolDef[]): Anthropic.Beta.BetaTool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: jsonSchema(t.input),
    eager_input_streaming: true,
  }));
}

/** Validates the model's input against the tool's schema, runs it, and turns failures into readable results. */
export async function runToolIn(tools: ToolDef[], ctx: ToolContext, name: string, rawInput: unknown): Promise<{ content: string; isError: boolean }> {
  const def = tools.find((t) => t.name === name);
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
    if (err instanceof BudgetExceeded || err instanceof ProposalConflict) return { content: err.message, isError: true };
    return { content: describeError(err), isError: true };
  }
}

/** Runs any base tool by name (used by tests and by specialists through their own subsets). */
export const runTool = (ctx: ToolContext, name: string, rawInput: unknown) => runToolIn(TOOLS as ToolDef[], ctx, name, rawInput);
