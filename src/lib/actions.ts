"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "./auth";
import { db, schema } from "./db";
import { writeBrain, BRAIN_SECTIONS, type BrainSection } from "./brain";
import { removeConnection, saveConnection } from "./connections";
import { discoverAssets } from "./meta/context";
import { Graph } from "./meta/graph";

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

/** Pilot shortcut: paste a long-lived or system-user token instead of the Facebook login flow. */
export async function saveMetaToken(form: FormData) {
  const { workspace } = await requireSession();
  const token = str(form, "token");
  if (!token) return;
  const { me } = await discoverAssets(new Graph(token));
  await saveConnection(workspace.id, "meta", { userName: me.name, tokenExpiresAt: null }, token);
  revalidatePath("/", "layout");
}

export async function saveMetaAssets(form: FormData) {
  const { workspace } = await requireSession();
  const [adAccountId, adAccountName, currency] = str(form, "adAccount").split("|");
  const [pageId, pageName, igUserId, igUsername] = str(form, "page").split("|");
  await saveConnection(workspace.id, "meta", {
    adAccountId: adAccountId || undefined,
    adAccountName,
    currency: currency || "ILS",
    pageId: pageId || undefined,
    pageName,
    igUserId: igUserId || undefined,
    igUsername,
    pixelId: str(form, "pixel") || undefined,
    catalogId: str(form, "catalog") || undefined,
  });
  revalidatePath("/", "layout");
}

export async function disconnectMeta() {
  const { workspace } = await requireSession();
  await removeConnection(workspace.id, "meta");
  revalidatePath("/", "layout");
}

export async function saveWebsiteAndStore(form: FormData) {
  const { workspace } = await requireSession();
  const url = str(form, "website");
  if (url) {
    const platform = str(form, "storePlatform");
    await saveConnection(workspace.id, "website", {
      url,
      platform: platform === "shopify" || platform === "woocommerce" ? platform : "other",
    });
  }
  const platform = str(form, "storePlatform");
  const domain = str(form, "storeDomain");
  const secret = str(form, "storeSecret");
  if ((platform === "shopify" || platform === "woocommerce") && domain) {
    await saveConnection(
      workspace.id,
      "store",
      { platform, domain, consumerKey: str(form, "storeKey") || undefined },
      secret || undefined,
    );
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
  revalidatePath("/", "layout");
}

export async function startMikee() {
  const { workspace } = await requireSession();
  const d = await db();
  await d.update(schema.workspaces).set({ stage: "scanning" }).where(eq(schema.workspaces.id, workspace.id));
  redirect("/mikee");
}

export async function saveBrainSection(form: FormData) {
  const { workspace } = await requireSession();
  const section = str(form, "section") as BrainSection;
  if (!(section in BRAIN_SECTIONS)) return;
  await writeBrain(workspace.id, section, String(form.get("content") ?? ""), "replace");
  revalidatePath("/brand");
}
