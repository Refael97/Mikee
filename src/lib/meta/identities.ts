import "server-only";
import { and, eq, isNull, or } from "drizzle-orm";
import { db, schema } from "../db";
import { logActivity } from "../activity";
import { describeError } from "./actions";
import type { MetaContext } from "./context";

/**
 * The advertiser (beneficiary) and payer Meta shows for this business's ads. Some accounts and locations
 * require them on every ad set (Meta error 100/3858634, "a verified advertiser is required"), sent as
 * regional_regulation_identities: { universal_beneficiary, universal_payer }.
 *
 * Nothing here is guessed: candidates come only from the account's own existing ad sets, a name is either
 * what Meta returns for the id or what the client confirms as Meta shows it, and every choice is the
 * client's, stored per business (never shared between businesses).
 */

export type IdentityScope = "ad_account" | "workspace" | "proposal";

export type IdentityCandidate = {
  id: string;
  /** From Meta (GET /{id}?fields=name). Null when Meta does not return it: the client confirms it instead. */
  name: string | null;
  nameUnavailable?: string;
  roles: ("beneficiary" | "payer")[];
  /** How many existing ad sets use it, and the fields it appeared in. */
  adsets: number;
  fields: string[];
};

export type Discovery =
  | { status: "ok"; adAccountId: string; candidates: IdentityCandidate[]; categories: string[]; scanned: number }
  | { status: "empty"; adAccountId: string; candidates: []; categories: string[]; scanned: number }
  | { status: "error"; adAccountId?: string; error: string };

const ID = /^\d{5,25}$/;

/** Reads the account's ad sets (all pages, up to 500) and collects the identity ids they already use. */
export async function discoverIdentities(ctx: MetaContext): Promise<Discovery> {
  const account = ctx.adAccountId;
  if (!account) return { status: "error", error: "No ad account is chosen for this business." };
  try {
    const adsets = await ctx.graph.all<{ id: string; regional_regulated_categories?: string[]; regional_regulation_identities?: Record<string, string> }>(
      `/${account}/adsets`,
      { fields: "id,regional_regulated_categories,regional_regulation_identities" },
      500,
    );
    const found = new Map<string, IdentityCandidate>();
    const categories = new Set<string>();
    for (const a of adsets) {
      for (const c of a.regional_regulated_categories ?? []) categories.add(c);
      for (const [field, value] of Object.entries(a.regional_regulation_identities ?? {})) {
        if (typeof value !== "string" || !ID.test(value)) continue;
        const c = found.get(value) ?? { id: value, name: null, roles: [], adsets: 0, fields: [] };
        const role = /payer/i.test(field) ? "payer" : /beneficiary/i.test(field) ? "beneficiary" : null;
        if (role && !c.roles.includes(role)) c.roles.push(role);
        if (!c.fields.includes(field)) c.fields.push(field);
        found.set(value, c);
      }
    }
    // Each id once; a name only when Meta returns one (some ids answer "Unsupported get request").
    for (const c of found.values()) {
      c.adsets = adsets.filter((a) => Object.values(a.regional_regulation_identities ?? {}).includes(c.id)).length;
      try {
        const r = await ctx.graph.get<{ name?: string }>(`/${c.id}`, { fields: "id,name" });
        c.name = typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, 120) : null;
        if (!c.name) c.nameUnavailable = "Meta returned no name";
      } catch (err) {
        c.nameUnavailable = describeError(err).slice(0, 200);
      }
    }
    const candidates = [...found.values()].sort((a, b) => b.adsets - a.adsets);
    return candidates.length
      ? { status: "ok", adAccountId: account, candidates, categories: [...categories], scanned: adsets.length }
      : { status: "empty", adAccountId: account, candidates: [], categories: [...categories], scanned: adsets.length };
  } catch (err) {
    return { status: "error", adAccountId: account, error: describeError(err) };
  }
}

export type SavedIdentity = typeof schema.advertiserIdentities.$inferSelect;

export async function listIdentities(workspaceId: string): Promise<SavedIdentity[]> {
  const d = await db();
  return d.query.advertiserIdentities.findMany({ where: eq(schema.advertiserIdentities.workspaceId, workspaceId) });
}

export class IdentityProblem extends Error {}

/**
 * Saves the client's choice. The ids must be among those the business's own account already uses (read again
 * now), so nothing typed or invented reaches Meta; only the names may come from the client.
 */
export async function saveIdentity(
  ctx: MetaContext,
  input: {
    workspaceId: string;
    scope: IdentityScope;
    proposalId?: string;
    beneficiary: { id: string; name: string };
    payer: { id: string; name: string };
  },
): Promise<SavedIdentity> {
  const { workspaceId, scope } = input;
  if (!ctx.adAccountId) throw new IdentityProblem("No ad account is connected.");
  const found = await discoverIdentities(ctx);
  if (found.status === "error") throw new IdentityProblem(`לא הצלחנו לקרוא את חשבון המודעות: ${found.error}`);
  const known = new Map(found.candidates.map((c) => [c.id, c]));
  for (const id of [input.beneficiary.id, input.payer.id]) {
    if (!known.has(id)) throw new IdentityProblem("הזהות הזאת לא נמצאה בחשבון המודעות של העסק.");
  }
  // A name Meta returned is the one kept; the client's text is used only where Meta gives none.
  const nameOf = (id: string, typed: string) => known.get(id)?.name ?? typed.trim();
  const fromMeta = known.get(input.beneficiary.id)?.name && known.get(input.payer.id)?.name;
  // Where Meta gives no name, the client confirms it as Meta shows it.
  for (const n of [nameOf(input.beneficiary.id, input.beneficiary.name), nameOf(input.payer.id, input.payer.name)]) {
    if (!n || n.length > 120) throw new IdentityProblem("צריך לאשר את השם כפי שהוא מופיע במטא, עד 120 תווים.");
  }

  const d = await db();
  if (scope === "proposal") {
    if (!input.proposalId) throw new IdentityProblem("Missing card.");
    const p = await d.query.proposals.findFirst({ where: and(eq(schema.proposals.id, input.proposalId), eq(schema.proposals.workspaceId, workspaceId)) });
    if (!p || p.kind !== "campaign") throw new IdentityProblem("Card not found.");
  }
  const key = {
    adAccountId: scope === "ad_account" ? ctx.adAccountId : null,
    proposalId: scope === "proposal" ? input.proposalId! : null,
  };
  const saved = await d.transaction(async (tx) => {
    await tx
      .delete(schema.advertiserIdentities)
      .where(
        and(
          eq(schema.advertiserIdentities.workspaceId, workspaceId),
          eq(schema.advertiserIdentities.scope, scope),
          key.adAccountId ? eq(schema.advertiserIdentities.adAccountId, key.adAccountId) : isNull(schema.advertiserIdentities.adAccountId),
          key.proposalId ? eq(schema.advertiserIdentities.proposalId, key.proposalId) : isNull(schema.advertiserIdentities.proposalId),
        ),
      );
    const [row] = await tx
      .insert(schema.advertiserIdentities)
      .values({
        workspaceId,
        scope,
        ...key,
        beneficiaryId: input.beneficiary.id,
        beneficiaryName: nameOf(input.beneficiary.id, input.beneficiary.name),
        payerId: input.payer.id,
        payerName: nameOf(input.payer.id, input.payer.name),
        nameSource: fromMeta ? "meta" : "client",
      })
      .returning();
    return row;
  });
  // Logged after the transaction: the log is written on its own connection.
  await logActivity(workspaceId, "setup", `נבחר מפרסם ומשלם במטא: ${saved.beneficiaryName}`, { scope, adAccountId: key.adAccountId });
  return saved;
}

export async function removeIdentity(workspaceId: string, id: string) {
  const d = await db();
  await d.delete(schema.advertiserIdentities).where(and(eq(schema.advertiserIdentities.id, id), eq(schema.advertiserIdentities.workspaceId, workspaceId)));
}

export type ResolvedIdentity = { row: SavedIdentity; regional_regulation_identities: { universal_beneficiary: string; universal_payer: string } };

/**
 * The identity for one campaign: the card's own choice, else this ad account's, else the business's. A
 * business-wide choice is used in an account only after checking that account already uses that identity.
 */
export async function resolveIdentity(ctx: MetaContext, workspaceId: string, proposalId?: string): Promise<ResolvedIdentity | null> {
  const d = await db();
  const rows = await d.query.advertiserIdentities.findMany({
    where: and(
      eq(schema.advertiserIdentities.workspaceId, workspaceId),
      or(
        proposalId ? eq(schema.advertiserIdentities.proposalId, proposalId) : undefined,
        ctx.adAccountId ? and(eq(schema.advertiserIdentities.scope, "ad_account"), eq(schema.advertiserIdentities.adAccountId, ctx.adAccountId)) : undefined,
        eq(schema.advertiserIdentities.scope, "workspace"),
      ),
    ),
  });
  const pick =
    rows.find((r) => r.scope === "proposal" && r.proposalId === proposalId) ??
    rows.find((r) => r.scope === "ad_account" && r.adAccountId === ctx.adAccountId) ??
    rows.find((r) => r.scope === "workspace");
  if (!pick) return null;
  if (pick.scope === "workspace") {
    const found = await discoverIdentities(ctx);
    const ids = found.status === "ok" ? new Set(found.candidates.map((c) => c.id)) : new Set<string>();
    if (!ids.has(pick.beneficiaryId) || !ids.has(pick.payerId)) return null;
  }
  return { row: pick, regional_regulation_identities: { universal_beneficiary: pick.beneficiaryId, universal_payer: pick.payerId } };
}

/** Meta's code for "a verified advertiser is required for the chosen locations". */
export const NEEDS_IDENTITY_SUBCODE = 3858634;
