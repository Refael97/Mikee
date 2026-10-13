import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/** One business. The pilot has a single workspace, but every row is scoped so more can join later. */
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** connect -> scanning -> interview -> active */
  stage: text("stage").notNull().default("connect"),
  timezone: text("timezone").notNull().default("Asia/Jerusalem"),
  busyUntil: timestamp("busy_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** External accounts: meta, website, store. `secret` is encrypted at rest and never reaches the model. */
export const connections = pgTable(
  "connections",
  {
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    provider: text("provider").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    secret: text("secret"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.provider] })],
);

/** The client's "brain": everything Mikee knows about the business. */
export const brains = pgTable("brains", {
  workspaceId: uuid("workspace_id").primaryKey().references(() => workspaces.id),
  profile: jsonb("profile").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Monthly marketing budget the client sets by hand, in the ad account currency. */
export const budgets = pgTable("budgets", {
  workspaceId: uuid("workspace_id").primaryKey().references(() => workspaces.id),
  monthlyLimit: numeric("monthly_limit", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("ILS"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Extra budget Mikee asked for in a given month. Only approved rows count. */
export const budgetExtensions = pgTable("budget_extensions", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  month: text("month").notNull(),
  amount: numeric("amount", { mode: "number" }).notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

/**
 * The single ongoing conversation with Mikee, stored as Claude API turns.
 * kind: chat (visible), event (shown as a small note), kickoff (internal instruction, hidden).
 */
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  role: text("role").$type<"user" | "assistant">().notNull(),
  kind: text("kind").notNull().default("chat"),
  content: jsonb("content").$type<unknown[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Anything that spends money or goes public waits here for one tap from the client.
 * `card` is what she sees; `action` is the exact execution spec the server runs on approval.
 */
export const proposals = pgTable("proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("pending"),
  card: jsonb("card").$type<Record<string, unknown>>().notNull(),
  action: jsonb("action").$type<Record<string, unknown>>().notNull(),
  result: jsonb("result").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

/** Audit trail of every action Mikee performed outside the platform. */
export const activity = pgTable("activity", {
  id: serial("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  kind: text("kind").notNull(),
  summary: text("summary").notNull(),
  detail: jsonb("detail").$type<Record<string, unknown>>(),
  ok: boolean("ok").notNull().default(true),
  costMinor: integer("cost_minor"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
