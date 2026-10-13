"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "./auth";
import { db, schema } from "./db";
import { remember, setFact, TOPICS, type Topic } from "./brain";
import { syncMetaSpendCap } from "./budget";
import { getConnection, removeConnection, saveConnection, type WebsiteConfig } from "./connections";
import { metaContext } from "./meta/context";
import { detectBusiness } from "./meta/detect";
import { Graph } from "./meta/graph";
import { checkMetaHealth } from "./meta/health";
import { updateSettings } from "./settings";

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

/** Pilot shortcut: paste an access token instead of the Facebook login flow. */
export async function saveMetaToken(form: FormData) {
  const { workspace } = await requireSession();
  const token = str(form, "token");
  if (!token) return;
  const me = await new Graph(token).get<{ name: string }>("/me", { fields: "name" });
  await saveConnection(workspace.id, "meta", { userName: me.name, tokenExpiresAt: null }, token);
  revalidatePath("/", "layout");
}

/** Saves the confirmed (or hand-picked) assets, then verifies the token really reaches each of them. */
export async function saveMetaAssets(form: FormData) {
  const { workspace } = await requireSession();
  const conn = await getConnection(workspace.id, "meta");
  if (!conn?.secret) return;
  const site = await getConnection<WebsiteConfig>(workspace.id, "website");
  const found = await detectBusiness(new Graph(conn.secret), workspace.name, site?.config.url);
  const account = found.adAccounts.find((a) => a.id === str(form, "adAccount"));
  const page = found.pages.find((p) => p.id === str(form, "page"));
  await saveConnection(workspace.id, "meta", {
    adAccountId: account?.id,
    adAccountName: account?.name,
    currency: account?.currency ?? "ILS",
    pageId: page?.id,
    pageName: page?.name,
    igUserId: page?.ig?.id,
    igUsername: page?.ig?.username,
    pixelId: str(form, "pixel") || undefined,
    catalogId: str(form, "catalog") || undefined,
  });
  await checkMetaHealth(workspace.id);
  revalidatePath("/", "layout");
}

export async function disconnectMeta() {
  const { workspace } = await requireSession();
  await removeConnection(workspace.id, "meta");
  revalidatePath("/", "layout");
}

export async function recheckMeta() {
  const { workspace } = await requireSession();
  await checkMetaHealth(workspace.id);
  revalidatePath("/", "layout");
}

export async function saveWebsiteAndStore(form: FormData) {
  const { workspace } = await requireSession();
  const url = str(form, "website");
  const platform = str(form, "storePlatform");
  if (url) {
    await saveConnection(workspace.id, "website", {
      url,
      platform: platform === "shopify" || platform === "woocommerce" ? platform : "other",
    });
  }
  const domain = str(form, "storeDomain");
  const secret = str(form, "storeSecret");
  if ((platform === "shopify" || platform === "woocommerce") && domain) {
    await saveConnection(workspace.id, "store", { platform, domain, consumerKey: str(form, "storeKey") || undefined }, secret || undefined);
  }
  revalidatePath("/", "layout");
}

export async function saveBudget(form: FormData) {
  const { workspace } = await requireSession();
  const amount = Number(str(form, "monthlyLimit").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return;
  const currency = str(form, "currency") || "ILS";
  const d = await db();
  await d
    .insert(schema.budgets)
    .values({ workspaceId: workspace.id, monthlyLimit: amount, currency })
    .onConflictDoUpdate({ target: schema.budgets.workspaceId, set: { monthlyLimit: amount, currency, updatedAt: sql`now()` } });
  const ctx = await metaContext(workspace.id).catch(() => null);
  if (ctx?.adAccountId) await syncMetaSpendCap(workspace.id, workspace.timezone, ctx);
  revalidatePath("/", "layout");
}

export async function saveLimits(form: FormData) {
  const { workspace } = await requireSession();
  const num = (k: string) => {
    const n = Number(str(form, k));
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  const media = num("mediaMonthlyCredits");
  const auto = num("mediaAutoCredits");
  await updateSettings(workspace.id, {
    aiMonthlyLimitUsd: num("aiMonthlyLimitUsd"),
    mediaMonthlyCredits: media,
    mediaAutoCredits: auto != null && media != null ? Math.min(auto, media) : auto,
    metaSpendCap: form.get("metaSpendCap") === "on",
  });
  if (form.get("metaSpendCap") === "on") {
    const ctx = await metaContext(workspace.id).catch(() => null);
    if (ctx?.adAccountId) await syncMetaSpendCap(workspace.id, workspace.timezone, ctx);
  }
  revalidatePath("/settings");
}

export async function startMikee() {
  const { workspace } = await requireSession();
  const d = await db();
  await d.update(schema.workspaces).set({ stage: "scanning" }).where(eq(schema.workspaces.id, workspace.id));
  redirect("/mikee");
}

export async function addFact(form: FormData) {
  const { workspace } = await requireSession();
  const topic = str(form, "topic") as Topic;
  const text = str(form, "text");
  if (!(topic in TOPICS) || !text) return;
  await remember(workspace.id, { topic, text, kind: topic === "rules" ? "rule" : "fact", source: "client" });
  revalidatePath("/brand");
}

export async function editFact(form: FormData) {
  const { workspace } = await requireSession();
  const text = str(form, "text");
  if (!text) await setFact(workspace.id, str(form, "id"), { status: "archived" });
  else await setFact(workspace.id, str(form, "id"), { text });
  revalidatePath("/brand");
}

export async function decideFact(form: FormData) {
  const { workspace } = await requireSession();
  const decision = str(form, "decision");
  await setFact(workspace.id, str(form, "id"), { status: decision === "confirm" ? "confirmed" : "archived" });
  revalidatePath("/brand");
}
