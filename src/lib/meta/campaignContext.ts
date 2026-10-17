import "server-only";
import { catalogContext } from "./catalog";
import { budgetStatus } from "../budget";
import { listLibrary } from "../library";
import { describeError } from "./actions";
import { metaContext } from "./context";
import { listIdentities } from "./identities";
import { metaMedia } from "./media";

/**
 * Everything a campaign needs, in one short answer: the connected assets, this month's budget room, the
 * page's lead forms, media already in the ad account and in Mikee's library, and the chosen advertiser.
 * Each part says ok, empty or error on its own, so one failure never hides the others. Reads repeated in
 * the same task come from the task's memo (src/lib/telemetry.ts), not from Meta again.
 */
export async function campaignContext(workspaceId: string, tz: string) {
  const meta = await metaContext(workspaceId).catch((e) => e as Error);
  if (meta instanceof Error) return { status: "error" as const, error: meta.message };

  const part = async <T>(fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (err) {
      return { status: "error" as const, error: describeError(err).slice(0, 300) };
    }
  };
  const [budget, forms, images, videos, library, identities, catalog] = await Promise.all([
    part(async () => {
      const b = await budgetStatus(workspaceId, tz, meta);
      return {
        status: "ok" as const,
        configured: b.configured,
        currency: b.currency,
        limit: b.limit,
        spent: b.spent,
        runningUntilMonthEnd: b.committed,
        waitingCards: b.reserved,
        room: b.headroom,
        daysLeft: b.daysLeft,
        running: b.running.length,
      };
    }),
    part(() => metaMedia(workspaceId, "lead_forms", 20)),
    part(() => metaMedia(workspaceId, "images", 12)),
    part(() => metaMedia(workspaceId, "videos", 8)),
    part(async () => {
      const items = await listLibrary(workspaceId, { limit: 8 });
      return { status: items.length ? ("ok" as const) : ("empty" as const), items: items.map((m) => ({ id: m.id, url: m.url, kind: m.kind, description: m.description })) };
    }),
    part(async () => {
      const rows = await listIdentities(workspaceId);
      const here = rows.filter((r) => r.scope === "workspace" || (r.scope === "ad_account" && r.adAccountId === meta.adAccountId));
      return { status: here.length ? ("ok" as const) : ("empty" as const), chosen: here.map((r) => ({ scope: r.scope, advertiser: r.beneficiaryName, payer: r.payerName })) };
    }),
    part(() => catalogContext(meta)),
  ]);

  // Lists come back short: what a campaign spec needs from each item, no more.
  const slim = (r: any, pick: (i: any) => unknown) => (r?.status === "ok" ? { status: "ok", items: r.items.map(pick), more: !!r.next } : r);
  return {
    status: "ok" as const,
    assets: { adAccountId: meta.adAccountId, adAccountName: meta.adAccountName, currency: meta.currency, pageId: meta.pageId, pageName: meta.pageName, instagram: meta.igUsername, pixelId: meta.pixelId },
    budget,
    catalog,
    leadForms: slim(forms, (f) => ({ id: f.id, name: f.name, status: f.status })),
    adImages: slim(images, (i) => ({ hash: i.hash, url: i.url, name: i.name, width: i.width, height: i.height })),
    adVideos: slim(videos, (v) => ({ id: v.id, title: v.title, picture: v.picture, length: v.length })),
    library,
    advertiserIdentity: identities,
  };
}
