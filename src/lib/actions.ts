"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession, revokeSessions, startSession } from "./auth";
import { hashPassword, passwordProblem, verifyPassword } from "./crypto";
import { logActivity } from "./activity";
import { db, schema } from "./db";
import { remember, setFact, TOPICS, type Topic } from "./brain";
import { syncMetaSpendCap } from "./budget";
import { getConnection, removeConnection, saveConnection, type WebsiteConfig } from "./connections";
import { metaContext } from "./meta/context";
import { detectBusiness } from "./meta/detect";
import { Graph, inspectToken } from "./meta/graph";
import { fillAssetNames } from "./meta/assets";
import { checkMetaHealth } from "./meta/health";
import { getSettings, updateSettings } from "./settings";
import { cleanClientText, hit, LIMITS } from "./guard";
import { checkUrl } from "./net";
import { planOf } from "./plans";
import { shopifyDomain } from "./store";
import { cleanUsername, usernameProblem, usernameTaken } from "./username";

/** Every form value is capped and cleaned before use. */
const str = (form: FormData, key: string, max = 500) => cleanClientText(String(form.get(key) ?? ""), max);
const isId = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

/** Pilot shortcut: paste an access token instead of the Facebook login flow. */
export async function saveMetaToken(form: FormData) {
  const { workspace } = await requireSession();
  const token = String(form.get("token") ?? "").trim();
  if (!token || token.length > 1000 || !/^[A-Za-z0-9_|.-]+$/.test(token)) return;
  // A pasted token must come from this app (not an older or test app) and still be valid.
  // A token that cannot be inspected is refused: it may come from another app.
  const info = await inspectToken(token).catch(() => null);
  if (!info || !info.valid || info.appId !== process.env.META_APP_ID) redirect("/settings?error=meta_wrong_app");
  const me = await new Graph(token).get<{ name: string }>("/me", { fields: "name" }).catch(() => null);
  if (!me) redirect("/settings?error=meta_token");
  await saveConnection(workspace.id, "meta", { userName: me.name, tokenExpiresAt: info.expiresAt ?? null, scopes: info.scopes, appId: info.appId, tokenType: info.type }, token);
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
    pixelName: found.pixels.find((p) => p.id === str(form, "pixel"))?.name,
    catalogId: str(form, "catalog") || undefined,
    catalogName: found.catalogs.find((k) => k.id === str(form, "catalog"))?.name,
    businessName: undefined,
  });
  await checkMetaHealth(workspace.id);
  await fillAssetNames(workspace.id).catch(() => undefined);
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
  const raw = str(form, "website", 300);
  const platform = str(form, "storePlatform", 20);
  let url = "";
  if (raw) {
    try {
      url = checkUrl(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).toString();
    } catch {
      redirect("/settings?error=bad_website");
    }
  }
  if (url) {
    await saveConnection(workspace.id, "website", {
      url,
      platform: platform === "shopify" || platform === "woocommerce" ? platform : "other",
    });
  }
  let domain = str(form, "storeDomain", 300) || (platform === "woocommerce" && url ? new URL(url).origin : "");
  const secret = String(form.get("storeSecret") ?? "").trim().slice(0, 300);
  if (domain) {
    try {
      domain = platform === "shopify" ? shopifyDomain(domain) : checkUrl(/^https?:\/\//i.test(domain) ? domain : `https://${domain}`).origin;
    } catch {
      redirect("/settings?error=bad_store");
    }
  }
  if ((platform === "shopify" || platform === "woocommerce") && domain) {
    await saveConnection(workspace.id, "store", { platform, domain, consumerKey: str(form, "storeKey") || undefined }, secret || undefined);
  }
  revalidatePath("/", "layout");
}

export async function saveBudget(form: FormData) {
  const { workspace } = await requireSession();
  const amount = Number(str(form, "monthlyLimit").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return;
  const currency = /^[A-Z]{3}$/.test(str(form, "currency", 3)) ? str(form, "currency", 3) : "ILS";
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
  // The plan sets the ceiling; the business may only lower it.
  const plan = planOf(await getSettings(workspace.id));
  const cap = (v: number | undefined, max: number) => (v == null ? undefined : Math.min(v, max));
  const media = cap(num("mediaMonthlyCredits"), plan.mediaCredits);
  const auto = num("mediaAutoCredits");
  await updateSettings(workspace.id, {
    aiMonthlyLimitUsd: cap(num("aiMonthlyLimitUsd"), plan.aiUsd),
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
  const topic = str(form, "topic", 30) as Topic;
  const text = str(form, "text", 500);
  if (!(topic in TOPICS) || !text) return;
  await remember(workspace.id, { topic, text, kind: topic === "rules" ? "rule" : "fact", source: "client" });
  revalidatePath("/brand");
}

export async function editFact(form: FormData) {
  const { workspace } = await requireSession();
  const text = str(form, "text", 500);
  const id = str(form, "id", 40);
  if (!isId(id)) return;
  if (!text) await setFact(workspace.id, id, { status: "archived" });
  else await setFact(workspace.id, id, { text });
  revalidatePath("/brand");
}

export async function decideFact(form: FormData) {
  const { workspace } = await requireSession();
  const decision = str(form, "decision", 20);
  const id = str(form, "id", 40);
  if (!isId(id)) return;
  await setFact(workspace.id, id, { status: decision === "confirm" ? "confirmed" : "archived" });
  revalidatePath("/brand");
}

/* ---------- Account ---------- */

export type FormState = { ok?: string; error?: string } | null;

export async function updateProfile(_: FormState, form: FormData): Promise<FormState> {
  const { user } = await requireSession();
  const name = str(form, "name", 80);
  if (name.length < 2) return { error: "השם קצר מדי" };
  const raw = String(form.get("username") ?? "").trim();
  let username = user.username;
  if (raw && cleanUsername(raw) !== (user.username ?? "").toLowerCase()) {
    const problem = usernameProblem(raw);
    if (problem) return { error: problem };
    if (await usernameTaken(raw, user.id)) return { error: "שם המשתמש תפוס. אפשר לנסות אחר." };
    username = cleanUsername(raw);
  }
  const d = await db();
  await d.update(schema.users).set({ name, username }).where(eq(schema.users.id, user.id));
  revalidatePath("/account");
  return { ok: "נשמר" };
}

export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  const { user } = await requireSession();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const r = await hit(`pw:${user.id}`, 5, 900);
  if (!r.ok) return { error: "יותר מדי ניסיונות. נסי שוב בעוד רבע שעה." };
  if (!verifyPassword(current, user.passwordHash)) return { error: "הסיסמה הנוכחית לא נכונה" };
  const problem = passwordProblem(next);
  if (problem) return { error: problem };
  if (next !== String(form.get("confirm") ?? "")) return { error: "הסיסמאות לא זהות" };
  const d = await db();
  await d.update(schema.users).set({ passwordHash: hashPassword(next), passwordChangedAt: new Date() }).where(eq(schema.users.id, user.id));
  // Every other device is signed out; this one continues with a fresh session.
  const version = await revokeSessions(user.id);
  await startSession(user.id, version);
  await logActivity(user.workspaceId, "security", "הסיסמה הוחלפה");
  return { ok: "הסיסמה הוחלפה. כל שאר המכשירים נותקו." };
}

export async function signOutEverywhere() {
  const { user } = await requireSession();
  await revokeSessions(user.id);
  await logActivity(user.workspaceId, "security", "יציאה מכל המכשירים");
  redirect("/login");
}

export async function disconnectDrive() {
  const { workspace } = await requireSession();
  await removeConnection(workspace.id, "google_drive");
  revalidatePath("/", "layout");
}

/* ---------- Help ---------- */

export async function sendSupport(_: FormState, form: FormData): Promise<FormState> {
  const { user, workspace } = await requireSession();
  const topic = str(form, "topic", 40) || "general";
  const body = str(form, "body", 4000);
  if (body.length < 5) return { error: "כתבי לנו כמה מילים על מה שקרה" };
  const r = await hit(`support:${workspace.id}`, LIMITS.supportPerDay, 86400);
  if (!r.ok) return { error: "שלחת כבר כמה פניות היום. נחזור אלייך בהקדם." };
  const d = await db();
  const [row] = await d.insert(schema.supportRequests).values({ workspaceId: workspace.id, userId: user.id, topic, body }).returning();
  // Optional: forward to the team's inbox or Slack. The address is ours (an env var), never the client's.
  const hook = process.env.SUPPORT_WEBHOOK_URL;
  if (hook) {
    await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `פנייה #${row.id} מ${workspace.name} (${user.email}) [${topic}]\n${body}` }),
      signal: AbortSignal.timeout(8000),
    }).catch(() => undefined);
  }
  return { ok: `קיבלנו (פנייה #${row.id}). נחזור אלייך תוך יום עסקים, בדרך כלל מהר יותר.` };
}
