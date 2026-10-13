import { bigint, boolean, customType, integer, jsonb, numeric, pgTable, primaryKey, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

export type WorkspaceSettings = {
  /** Monthly cap on Claude usage, in USD. */
  aiMonthlyLimitUsd?: number;
  /** Monthly cap on Higgsfield credits; nothing beyond it can be generated. */
  mediaMonthlyCredits?: number;
  /** Credits Mikee may spend per month without asking. 0 = every generation needs a card. */
  mediaAutoCredits?: number;
  /** Mirror the monthly budget onto the ad account's spending limit at Meta (hard stop on charges). */
  metaSpendCap?: boolean;
  metaSpendCapStatus?: { ok: boolean; at: string; detail: string };
  /** Subscription plan (set by us, not by the client): storage and cost ceilings. */
  plan?: string;
  /** What the business wants to focus on now, in its own words, kept by Mikee. */
  focus?: { text: string; since: string };
  /** ecommerce | services | local | content: shapes the marketing path and the results page. */
  businessType?: "ecommerce" | "services" | "local" | "content";
  /** The results page Mikee chose for this kind of business. */
  dashboard?: DashboardSpec;
};

export type KpiId = "spend" | "leads" | "cost_per_lead" | "purchases" | "revenue" | "roas" | "cost_per_purchase" | "messages" | "calls" | "link_clicks" | "cost_per_click" | "reach" | "followers" | "store_orders" | "store_revenue";
export type DashboardSpec = { kpis: KpiId[]; headline?: string; note?: string; updatedAt: string };

export const DEFAULT_SETTINGS: Required<Pick<WorkspaceSettings, "aiMonthlyLimitUsd" | "mediaMonthlyCredits" | "mediaAutoCredits" | "metaSpendCap">> = {
  aiMonthlyLimitUsd: 150,
  mediaMonthlyCredits: 0,
  mediaAutoCredits: 0,
  metaSpendCap: true,
};

/** One business. Every row is scoped so more businesses can join after the pilot. */
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** connect -> scanning -> interview -> active */
  stage: text("stage").notNull().default("connect"),
  timezone: text("timezone").notNull().default("Asia/Jerusalem"),
  settings: jsonb("settings").$type<WorkspaceSettings>().notNull().default({}),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  /** Bumped on password change and "sign out everywhere": every older session stops working. */
  sessionVersion: integer("session_version").notNull().default(1),
  passwordChangedAt: ts("password_changed_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** Fixed-window counters for rate limits (login attempts, messages, uploads). */
export const rateLimits = pgTable(
  "rate_limits",
  { key: text("key").notNull(), windowStart: bigint("window_start", { mode: "number" }).notNull(), count: integer("count").notNull().default(0) },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

export const supportRequests = pgTable("support_requests", {
  id: serial("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  userId: uuid("user_id"),
  topic: text("topic").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** Where the business stands on its marketing path: one row per building block. */
export const journey = pgTable(
  "journey",
  {
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    item: text("item").notNull(),
    /** done | active | next | skipped */
    status: text("status").notNull(),
    note: text("note"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.item] })],
);

/** External accounts. `secret` is encrypted at rest and never reaches the model. */
export const connections = pgTable(
  "connections",
  {
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    provider: text("provider").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    secret: text("secret"),
    /** ok | broken (token revoked, asset access lost) */
    status: text("status").notNull().default("ok"),
    statusReason: text("status_reason"),
    checkedAt: ts("checked_at"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.provider] })],
);

/**
 * What Mikee knows about the business, one sentence per row, with where it came from and when.
 * kind: fact | preference | rule | insight. status: confirmed (by the client) | suggested | archived.
 */
export const facts = pgTable("facts", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  topic: text("topic").notNull(),
  text: text("text").notNull(),
  kind: text("kind").notNull().default("fact"),
  status: text("status").notNull().default("suggested"),
  source: text("source").notNull(),
  sourceDetail: text("source_detail"),
  observedAt: ts("observed_at").notNull().defaultNow(),
  confirmedAt: ts("confirmed_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const budgets = pgTable("budgets", {
  workspaceId: uuid("workspace_id").primaryKey().references(() => workspaces.id),
  monthlyLimit: numeric("monthly_limit", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("ILS"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Approved one-month increases. One row per approved proposal (unique), so a double approval cannot add twice. */
export const budgetExtensions = pgTable("budget_extensions", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  proposalId: uuid("proposal_id").unique(),
  month: text("month").notNull(),
  amount: numeric("amount", { mode: "number" }).notNull(),
  reason: text("reason").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export type Category = "campaigns" | "content" | "results" | "business" | "general";

/**
 * Separate conversations, filed automatically by topic. `auto` stays true until the client moves a
 * conversation herself; after that Mikee never re-files it.
 */
export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  title: text("title").notNull().default("שיחה חדשה"),
  category: text("category").$type<Category>().notNull().default("general"),
  auto: boolean("auto").notNull().default(true),
  archived: boolean("archived").notNull().default(false),
  /** Mikee wrote here on his own and the client has not opened it yet. */
  unread: boolean("unread").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Every time Mikee reached out on his own, so the same reason never triggers twice. */
export const nudges = pgTable("nudges", {
  id: serial("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  kind: text("kind").notNull(),
  key: text("key").notNull(),
  /** Local date in the business's timezone, for the daily limit. */
  day: text("day").notNull(),
  conversationId: uuid("conversation_id"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export type Attachment = { id: string; name: string; type: string; size: number; url: string };

/** Messages of a conversation, stored as Claude API turns. kind: chat | event | kickoff. */
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  conversationId: uuid("conversation_id").references(() => conversations.id),
  /** Files the client attached; expanded into image/document blocks when sent to the model. */
  attachments: jsonb("attachments").$type<Attachment[]>(),
  role: text("role").$type<"user" | "assistant">().notNull(),
  kind: text("kind").notNull().default("chat"),
  content: jsonb("content").$type<unknown[]>().notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/**
 * Anything that spends money or goes public. Immutable once created: `action` is exactly what runs,
 * `versionHash` binds the client's approval to it, and a change by Mikee means a new proposal.
 * status: pending -> executing -> done | failed (retryable) ; pending -> declined | superseded
 */
export const proposals = pgTable("proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  /** The conversation the card was created in; its outcome is reported there. */
  conversationId: uuid("conversation_id"),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("pending"),
  versionHash: text("version_hash").notNull(),
  dedupeKey: text("dedupe_key").notNull(),
  month: text("month").notNull(),
  /** Ad spend this card would add this month (held while pending). Credits for media cards. */
  reserved: numeric("reserved", { mode: "number" }).notNull().default(0),
  card: jsonb("card").$type<Record<string, unknown>>().notNull(),
  action: jsonb("action").$type<Record<string, unknown>>().notNull(),
  /** Execution checkpoints (ids created so far) so a retry resumes instead of duplicating. */
  progress: jsonb("progress").$type<Record<string, unknown>>().notNull().default({}),
  result: jsonb("result").$type<Record<string, unknown>>(),
  attempts: integer("attempts").notNull().default(0),
  supersededBy: uuid("superseded_by"),
  createdAt: ts("created_at").notNull().defaultNow(),
  decidedAt: ts("decided_at"),
  finishedAt: ts("finished_at"),
});

/** Background work that must survive disconnects, restarts and deploys. kind: turn | execute | checkin */
export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("queued"),
  input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
  state: jsonb("state").$type<Record<string, unknown>>().notNull().default({}),
  error: text("error"),
  attempts: integer("attempts").notNull().default(0),
  heartbeatAt: ts("heartbeat_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  finishedAt: ts("finished_at"),
});

export const jobEvents = pgTable("job_events", {
  id: serial("id").primaryKey(),
  jobId: uuid("job_id").notNull().references(() => jobs.id),
  event: jsonb("event").$type<Record<string, unknown>>().notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** Metered costs outside the ad account. kind: claude (USD) | higgsfield (credits) */
export const usage = pgTable("usage", {
  id: serial("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  kind: text("kind").notNull(),
  month: text("month").notNull(),
  amount: numeric("amount", { mode: "number" }).notNull(),
  detail: jsonb("detail").$type<Record<string, unknown>>(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** Generated media, served from our own public URL so the server and Meta can always fetch it. */
export const media = pgTable("media", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  contentType: text("content_type").notNull(),
  /** Bytes live here only without a bucket (local runs); otherwise `key` points into the bucket. */
  bytes: bytea("bytes"),
  storage: text("storage").notNull().default("db"),
  key: text("key"),
  size: integer("size").notNull(),
  /** upload | higgsfield | drive | generated */
  source: text("source").notNull(),
  sourceRef: text("source_ref"),
  filename: text("filename"),
  /** image | video | pdf | text */
  kind: text("kind"),
  /** What is in it, written once by Mikee so he can find it later ("תמונת מוצר של השמלה האדומה על רקע לבן"). */
  description: text("description"),
  tags: jsonb("tags").$type<string[]>(),
  folder: text("folder"),
  /** Shown in the content library (chat attachments that are documents are not). */
  inLibrary: boolean("in_library").notNull().default(true),
  deletedAt: ts("deleted_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** Every task Mikee handed to a specialist: what was asked, what came back, which cards it made. */
export const agentRuns = pgTable("agent_runs", {
  id: serial("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  agent: text("agent").notNull(),
  task: text("task").notNull(),
  output: text("output").notNull(),
  proposalIds: jsonb("proposal_ids").$type<string[]>().notNull().default([]),
  steps: integer("steps").notNull().default(0),
  error: text("error"),
  startedAt: ts("started_at").notNull(),
  finishedAt: ts("finished_at").notNull().defaultNow(),
});

export const activity = pgTable("activity", {
  id: serial("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  kind: text("kind").notNull(),
  summary: text("summary").notNull(),
  detail: jsonb("detail").$type<Record<string, unknown>>(),
  ok: boolean("ok").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
});
