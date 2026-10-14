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
import { totalSeconds, VideoSpecBase } from "../video/spec";
import { videoMedia, videoRenderer, VideoProblem } from "../video/render";
import { hit } from "../guard";
import { addLesson, agentIds, getPlaybook, PLAYBOOK_TEMPLATE, PlaybookProblem, playbookHistory, writePlaybook } from "../playbooks";
import { mediaAllowance } from "../usage";
import { inventory, salesSummary } from "../store";
import { publicProducts, scanWebsite } from "../website";
import { wrapStrings } from "./untrusted";
import { ITEMS, journeyStatus, setFocus, setJourney } from "../journey";
import { listLibrary } from "../library";
import { KPIS, setDashboard } from "../dashboard";
import type { KpiId } from "../db/schema";

export type ToolContext = {
  workspaceId: string;
  tz: string;
  /** The conversation the work belongs to (cards report their outcome there). */
  conversationId?: string;
  /** Who on the team is acting: "mikee" or a specialist id. Cards remember it, so feedback reaches the right playbook. */
  agent?: string;
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
  /** Results contain text written by others (sites, posts, comments, store data): wrapped as untrusted data. */
  untrusted?: string;
};

export const tool = <S extends z.ZodType>(def: ToolDef<S>) => def as unknown as ToolDef;

const Period = z.enum(["today", "yesterday", "last_7d", "last_14d", "last_30d", "this_month", "last_month", "maximum"]);

/**
 * meta_write may only create these things, on the business's own assets, with these fields. It is an allowlist:
 * anything not listed (budgets, statuses, ads, posts, the batch API, query strings smuggled in the path) is refused.
 */
type Asset = "adAccount" | "catalog" | "page" | "pixel";
export const META_WRITES: { path: RegExp; asset: Asset; params: string[] }[] = [
  { path: /^\/(act_\d+)\/customaudiences$/, asset: "adAccount", params: ["name", "description", "subtype", "rule", "retention_days", "prefill", "lookalike_spec", "origin_audience_id", "customer_file_source", "event_source_group", "pixel_id", "claim_objective", "content_type"] },
  { path: /^\/(act_\d+)\/customconversions$/, asset: "adAccount", params: ["name", "description", "rule", "event_source_id", "custom_event_type", "default_conversion_value"] },
  { path: /^\/(\d+)\/product_sets$/, asset: "catalog", params: ["name", "filter"] },
  { path: /^\/(\d+)\/leadgen_forms$/, asset: "page", params: ["name", "questions", "privacy_policy", "follow_up_action_url", "thank_you_page", "context_card", "locale", "block_display_for_non_targeted_viewer", "is_optimized_for_quality", "question_page_custom_headline"] },
];
/** Kept for the approval tests: these must never be reachable through meta_write. */
export const GUARDED_PATH =
  /\/(campaigns|adsets|ads|copies|feed|photos|videos|media|media_publish|live_videos|stories)\/?$|^\/?\d+\/?$|^\/?act_\d+\/?$/;
export const GUARDED_PARAM = /^(daily_budget|lifetime_budget|spend_cap|spend_cap_action|bid_amount|bid_strategy|status|end_time|stop_time|published)$/;

/** A Graph path the model may use: plain segments only, no query, fragments, encoding tricks or traversal. */
export const SAFE_PATH = /^\/(?:[A-Za-z0-9_]+)(?:\/[A-Za-z0-9_]+){0,3}$/;

export function checkMetaWrite(path: string, params: Record<string, unknown>, assets: Partial<Record<Asset, string | undefined>>): string | null {
  const via = " Anything that spends, changes what runs or publishes goes through a card (propose_campaign / propose_change / propose_post).";
  if (!SAFE_PATH.test(path)) return `Unsupported path.${via}`;
  const rule = META_WRITES.find((r) => r.path.test(path));
  if (!rule) return `This kind of change is not allowed here.${via}`;
  const owner = rule.path.exec(path)![1];
  if (!assets[rule.asset] || assets[rule.asset] !== owner) return `That object does not belong to this business's connected accounts.${via}`;
  const extra = Object.keys(params).filter((k) => !rule.params.includes(k));
  if (extra.length) return `These fields are not allowed here: ${extra.join(", ")}.${via}`;
  return null;
}

/** Strips any access token Meta might include in a response (page tokens, app tokens). */
export function stripTokens(value: unknown, depth = 0): unknown {
  if (depth > 8 || value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => stripTokens(v, depth + 1));
  return Object.fromEntries(Object.entries(value).filter(([k]) => !/token|secret/i.test(k)).map(([k, v]) => [k, stripTokens(v, depth + 1)]));
}

async function isClientRule(workspaceId: string, factId: string) {
  const d = await db();
  const f = await d.query.facts.findFirst({ where: (t, { and, eq }) => and(eq(t.id, factId), eq(t.workspaceId, workspaceId)) });
  return !!f && f.source === "client" && f.status === "confirmed";
}

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
      // A rule or preference the client set herself is never replaced by Mikee: the update waits for her.
      if (i.replaces && (await isClientRule(ctx.workspaceId, i.replaces))) {
        const row = await rememberFact(ctx.workspaceId, { ...i, replaces: undefined, source: i.source === "client" ? "mikee" : i.source });
        return { saved: row.id, status: row.status, note: "The client's own sentence stays until she confirms the change on the business page." };
      }
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
      if (await isClientRule(ctx.workspaceId, i.id)) return { error: "This is something the client told you herself. Only she can remove it (on the business page). Ask her if it changed." };
      await setFact(ctx.workspaceId, i.id, { status: "archived" });
      return { archived: i.id };
    },
  }),

  tool({
    name: "journey_status",
    effect: "read",
    description: "Where the business stands on its marketing path: business type, the client's focus, every building block (foundations, new customers, conversion, retention, growth) with its status, and the natural next moves.",
    input: z.object({}),
    run: async (ctx) => {
      const j = await journeyStatus(ctx.workspaceId);
      return { ...j, phases: j.phases.map((p) => ({ id: p.id, title: p.title, done: p.done, total: p.total, items: p.items.map((i) => ({ id: i.id, title: i.title, status: i.status, note: i.note })) })), nextUp: j.nextUp.map((i) => ({ id: i.id, title: i.title, why: i.why, how: i.how })), active: j.active.map((i) => i.id) };
    },
  }),

  tool({
    name: "update_journey",
    effect: "memory",
    description:
      "Keep the marketing path current. Mark building blocks done (it is in place), active (we are working on it now), next (agreed as the next move) or skipped (not relevant / the client declined), with a short note. " +
      "Set the client's focus in her words when she tells you what matters now, and the business type once you know it.",
    input: z.object({
      items: z.array(z.object({ id: z.enum(ITEMS.map((i) => i.id) as [string, ...string[]]), status: z.enum(["done", "active", "next", "skipped"]), note: z.string().max(200).optional() })).max(10).default([]),
      focus: z.string().max(200).optional(),
      businessType: z.enum(["ecommerce", "services", "local", "content"]).optional(),
    }),
    run: async (ctx, i) => {
      for (const it of i.items) await setJourney(ctx.workspaceId, it.id, it.status, it.note);
      if (i.focus !== undefined || i.businessType) await setFocus(ctx.workspaceId, i.focus ?? null, i.businessType);
      return { updated: i.items.map((x) => x.id), focus: i.focus, businessType: i.businessType };
    },
  }),

  tool({
    name: "set_dashboard",
    effect: "memory",
    description:
      "Choose what the client sees on her results page: the 3-4 numbers that matter most for this kind of business, and one short Hebrew headline about the month " +
      "(for example 'החודש: יותר פניות בפחות כסף'). Set it once you know the business type and update the headline after a weekly or monthly review. " +
      "KPIs: spend, leads, cost_per_lead, purchases, revenue, roas, cost_per_purchase, messages, calls, link_clicks, cost_per_click, reach, followers, store_orders, store_revenue.",
    input: z.object({
      kpis: z.array(z.enum(Object.keys(KPIS) as [KpiId, ...KpiId[]])).min(2).max(4).optional(),
      headline: z.string().max(120).optional(),
      note: z.string().max(300).optional().describe("One or two sentences of context under the numbers"),
    }),
    run: async (ctx, i) => {
      await setDashboard(ctx.workspaceId, i);
      return { saved: true };
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
      return i.stage === "active"
        ? { stage: i.stage, next: "Now prepare your team: write a playbook for each specialist with update_playbook (action write), from everything you learned about the business, before you delegate work to them." }
        : { stage: i.stage };
    },
  }),

  tool({
    name: "team_playbook",
    effect: "read",
    description:
      "Read a specialist's playbook for this business (the working file you write for it: the client for its purposes, standing instructions, what works, lessons from her feedback), with its recent change history.",
    input: z.object({ agent: z.enum(agentIds() as [string, ...string[]]) }),
    run: async (ctx, i) => {
      const [p, history] = await Promise.all([getPlaybook(ctx.workspaceId, i.agent), playbookHistory(ctx.workspaceId, i.agent, 8)]);
      if (!p) return { agent: i.agent, exists: false, template: PLAYBOOK_TEMPLATE };
      return { agent: i.agent, version: p.version, updated: p.updatedAt.toISOString().slice(0, 10), content: p.content, history };
    },
  }),

  tool({
    name: "update_playbook",
    effect: "memory",
    description:
      "Write or improve a specialist's playbook for this business; it reads it at the start of every task. " +
      "action write: the whole file (to prepare it, or to consolidate it), in the template's sections, in Hebrew, concrete and specific to this client. " +
      "action add_lesson: one dated line under the lessons section, after the client says what she did not like or wants differently (the general rule for next time, in her words, not just this one card). " +
      "Always give the reason. Keep it under 8000 characters: when lessons pile up, merge them into the standing instructions with action write.",
    input: z.object({
      agent: z.enum(agentIds() as [string, ...string[]]),
      action: z.enum(["write", "add_lesson"]),
      text: z.string().min(5).max(9000),
      reason: z.string().min(5).max(300).describe("Why it changed, e.g. 'הלקוחה ביקשה פחות טקסט על המסך'"),
    }),
    run: async (ctx, i) => {
      try {
        const r = i.action === "write" ? await writePlaybook(ctx.workspaceId, i.agent, i.text, i.reason) : await addLesson(ctx.workspaceId, i.agent, i.text, i.reason, ctx.tz);
        return { ...r, saved: true };
      } catch (e) {
        if (e instanceof PlaybookProblem) return { error: e.message };
        throw e;
      }
    },
  }),

  tool({
    name: "scan_website",
    effect: "read",
    description: "Read the business website: key pages (about, products, services, contact, FAQ) and, for online stores, the public product list with prices and stock.",
    input: z.object({ url: z.string().max(500).optional().describe("A page on the connected website; defaults to its home page. For other sites use web_fetch."), maxPages: z.number().int().min(1).max(40).default(15) }),
    untrusted: "website",
    run: async (ctx, i) => {
      const site = await getConnection<WebsiteConfig>(ctx.workspaceId, "website");
      if (!site?.config.url) return { error: "No website connected" };
      const home = new URL(/^https?:/.test(site.config.url) ? site.config.url : `https://${site.config.url}`);
      let url = home.toString();
      if (i.url) {
        const asked = new URL(/^https?:/.test(i.url) ? i.url : `https://${i.url}`);
        if (asked.host.replace(/^www\./, "") !== home.host.replace(/^www\./, "")) return { error: "scan_website only reads the business's own website. Use web_fetch for other sites." };
        url = asked.toString();
      }
      const res = await scanWebsite(url, i.maxPages);
      return { ...res, products: res.products.slice(0, 120) };
    },
  }),

  tool({
    name: "read_store",
    effect: "read",
    untrusted: "store",
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
    untrusted: "social",
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
    name: "search_library",
    effect: "read",
    description:
      "The business's own content library: photos and videos the client uploaded or imported from Google Drive, and media created earlier. " +
      "Search it by what is shown (Hebrew words like 'שמלה אדומה', 'צוות', 'חנות') before creating anything new; use the returned URLs in ads and posts.",
    input: z.object({ q: z.string().max(80).optional(), kind: z.enum(["image", "video", "audio"]).optional().describe("audio = music and sound files"), limit: z.number().int().min(1).max(60).default(24) }),
    untrusted: "library",
    run: async (ctx, i) => {
      const items = await listLibrary(ctx.workspaceId, { q: i.q, kind: i.kind, limit: i.limit });
      return { count: items.length, items: items.map((m) => ({ id: m.id, url: m.url, kind: m.kind, name: m.name, description: m.description, folder: m.folder, added: m.createdAt?.slice(0, 10) })) };
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
    input: z.object({ path: z.string().startsWith("/").max(200), params: z.record(z.string(), z.unknown()).default({}) }),
    untrusted: "meta",
    run: async (ctx, i) => {
      if (!SAFE_PATH.test(i.path) || /^\/me\/accounts/.test(i.path)) return { error: "Unsupported path" };
      const params = Object.fromEntries(Object.entries(i.params as Record<string, unknown>).filter(([k]) => !/token|secret|appsecret/i.test(k)));
      if (JSON.stringify(params).match(/access_token|token/i)) return { error: "Tokens are never read" };
      const meta = await metaContext(ctx.workspaceId);
      return stripTokens(await meta.graph.get(i.path, params));
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
      const meta = await metaContext(ctx.workspaceId);
      const problem = checkMetaWrite(i.path, params, { adAccount: meta.adAccountId, catalog: meta.catalogId, page: meta.pageId, pixel: meta.pixelId });
      if (problem) return { error: problem };
      // Page objects (instant forms) need the page's own token; account objects use the user token.
      const graph = /leadgen_forms$/.test(i.path) && meta.pageId ? await meta.graph.forPage(meta.pageId) : meta.graph;
      const res = stripTokens(await graph.post(i.path, params));
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
        agent: ctx.agent,
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
        agent: ctx.agent,
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
      const p = await createProposal({ workspaceId: ctx.workspaceId, conversationId: ctx.conversationId, agent: ctx.agent, kind: "post", action: spec, month: monthKey(ctx.tz), replaces, clientAsked });
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
        agent: ctx.agent,
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
    name: "propose_video",
    effect: "proposal",
    description:
      "Make a short branded video (reel, story, feed or wide) from designed templates, using the business's own photos, video clips and music from the library (search_library ids). " +
      "You write the scenes: title (photo or video background), product (photo or video, name, price), clip (a video from the library, trimmed with from/seconds, optional text over it, " +
      "sound: true to keep its own speech or ambience), text lines, gallery (photos or videos), customer quote, call to action. Add music (search_library kind audio) for the whole video; it dips under clips with sound. " +
      "Hebrew text, short lines, no emoji. Typical: 4-6 scenes, 15-30 seconds; reels open with a strong first scene and end with a cta. The client watches the preview (with sound) in the card and approves; " +
      "then it is rendered (free, about a minute) and saved to the library. Publishing it is a separate propose_post / propose_campaign with the video URL from the platform event.",
    input: VideoSpecBase.extend(proposalOptions),
    run: async (ctx, { replaces, clientAsked, ...spec }) => {
      if (!videoRenderer()) return { error: "Video rendering is not connected on this server yet. Use photos, or propose_media if it is connected." };
      if (totalSeconds(spec) > 60) return { error: "A video is at most 60 seconds. Shorten the scenes." };
      try {
        await videoMedia(ctx.workspaceId, spec);
      } catch (e) {
        if (e instanceof VideoProblem) return { error: e.message };
        throw e;
      }
      if (!(await hit(`video:${ctx.workspaceId}`, 30, 86400)).ok) return { error: "Enough videos for today (30). Continue tomorrow." };
      const p = await createProposal({ workspaceId: ctx.workspaceId, conversationId: ctx.conversationId, agent: ctx.agent, kind: "video", action: spec, month: monthKey(ctx.tz), replaces, clientAsked });
      return { proposalId: p.id, seconds: totalSeconds(spec), shown: "The client sees the video playing in the card and approves before it is rendered." };
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
        agent: ctx.agent,
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
    const raw = await def.run(ctx, parsed.data as never);
    const out = def.untrusted ? wrapStrings(def.untrusted, raw) : raw;
    const text = JSON.stringify(out ?? { ok: true });
    return { content: text.length > 60000 ? `${text.slice(0, 60000)}…(truncated)` : text, isError: false };
  } catch (err) {
    if (err instanceof BudgetExceeded || err instanceof ProposalConflict) return { content: err.message, isError: true };
    return { content: describeError(err), isError: true };
  }
}

/** Runs any base tool by name (used by tests and by specialists through their own subsets). */
export const runTool = (ctx: ToolContext, name: string, rawInput: unknown) => runToolIn(TOOLS as ToolDef[], ctx, name, rawInput);
