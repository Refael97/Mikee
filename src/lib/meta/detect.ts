import "server-only";
import { Graph } from "./graph";

export type Detected = {
  me: { id: string; name: string };
  adAccounts: { id: string; name: string; currency: string; active: boolean; spent: number }[];
  pages: { id: string; name: string; website?: string; ig?: { id: string; username?: string } }[];
  pixels: { id: string; name: string; adAccountId: string; lastFired?: string }[];
  catalogs: { id: string; name: string }[];
  /** The best guess of which assets belong to this business, shown as one question to confirm. */
  guess: { adAccountId?: string; pageId?: string; pixelId?: string; catalogId?: string; confident: boolean };
  /** What Meta refused to show (e.g. ad accounts when the ads permissions were not granted). */
  blocked: { adAccounts?: string; pages?: string };
};

const norm = (s = "") => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const host = (u?: string) => {
  if (!u) return "";
  try {
    return new URL(/^https?:/.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

function similarity(a: string, b: string) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.8;
  return 0;
}

/**
 * Finds the business among everything the login can reach: the page whose website matches, or whose
 * name matches the business; the ad account named like it (or the one that actually spends); the pixel
 * that fired most recently on that account.
 */
export async function detectBusiness(graph: Graph, businessName: string, websiteUrl?: string): Promise<Detected> {
  const blocked: Detected["blocked"] = {};
  // One refused list must not hide the other: a login without the ads permissions still reaches the page and Instagram.
  const soft = (key: keyof Detected["blocked"], p: Promise<any[]>) =>
    p.catch((e: Error) => {
      blocked[key] = e.message;
      return [] as any[];
    });
  const [me, rawAccounts, rawPages, businesses, assignedCatalogs] = await Promise.all([
    graph.get<{ id: string; name: string }>("/me", { fields: "id,name" }),
    soft("adAccounts", graph.all<any>("/me/adaccounts", { fields: "id,name,currency,account_status,amount_spent" })),
    soft("pages", graph.all<any>("/me/accounts", { fields: "id,name,website,instagram_business_account{id,username}" })),
    graph.all<any>("/me/businesses", { fields: "id,name,owned_product_catalogs{id,name},client_product_catalogs{id,name}" }).catch(() =>
      graph.all<any>("/me/businesses", { fields: "id,name,owned_product_catalogs{id,name}" }).catch(() => []),
    ),
    // A system user (Login for Business) sees the catalogs assigned to it, even when /me/businesses lists none.
    graph.all<any>("/me/assigned_product_catalogs", { fields: "id,name" }).catch(() => []),
  ]);
  if (blocked.adAccounts && blocked.pages) throw new Error(blocked.adAccounts);
  const adAccounts = rawAccounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency, active: a.account_status === 1, spent: Number(a.amount_spent ?? 0) }));
  const pages = rawPages.map((p) => ({
    id: p.id,
    name: p.name,
    website: p.website,
    ig: p.instagram_business_account ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username } : undefined,
  }));
  const catalogs = [
    ...businesses.flatMap((b: any) => [...(b.owned_product_catalogs?.data ?? []), ...(b.client_product_catalogs?.data ?? [])]),
    ...assignedCatalogs,
  ]
    .filter((k: any, i: number, all: any[]) => k?.id && all.findIndex((x) => x.id === k.id) === i)
    .map((k: any) => ({ id: k.id, name: k.name ?? k.id }));

  const site = host(websiteUrl);
  const scorePage = (p: Detected["pages"][number]) =>
    (site && host(p.website?.split(/\s/)[0]) === site ? 3 : 0) + similarity(p.name, businessName) * 2 + (p.ig ? 0.5 : 0);
  const page = [...pages].sort((a, b) => scorePage(b) - scorePage(a))[0];

  const scoreAccount = (a: Detected["adAccounts"][number]) =>
    (a.active ? 2 : 0) + Math.max(similarity(a.name, businessName), page ? similarity(a.name, page.name) : 0) * 2 + (a.spent > 0 ? 0.5 : 0);
  const account = [...adAccounts].sort((a, b) => scoreAccount(b) - scoreAccount(a))[0];

  const pixels = (
    await Promise.all(
      adAccounts.slice(0, 5).map((a) =>
        graph
          .all<any>(`/${a.id}/adspixels`, { fields: "id,name,last_fired_time" })
          .then((list) => list.map((p) => ({ id: p.id, name: p.name, adAccountId: a.id, lastFired: p.last_fired_time })))
          .catch(() => []),
      ),
    )
  ).flat();
  const pixel = pixels
    .filter((p) => p.adAccountId === account?.id)
    .sort((a, b) => (b.lastFired ?? "").localeCompare(a.lastFired ?? ""))[0];

  const confident =
    !!page && !!account && (pages.length === 1 || scorePage(page) >= 2) && (adAccounts.length === 1 || scoreAccount(account) >= 3);
  return {
    me,
    adAccounts,
    pages,
    pixels,
    catalogs,
    blocked,
    guess: { adAccountId: account?.id, pageId: page?.id, pixelId: pixel?.id, catalogId: catalogs.length === 1 ? catalogs[0].id : undefined, confident },
  };
}
