import "server-only";
import { getConnection, type MetaConfig } from "./connections";
import { metaContext } from "./meta/context";
import { type FriendlyCampaign, type Period, readCampaigns } from "./meta/performance";

/**
 * Every ad platform behind one list. Meta works today; Google and TikTok are reserved so the campaigns page
 * and Mikee's plan already have a place for them.
 */
export type PlatformId = "meta" | "google" | "tiktok";
export const PLATFORMS: { id: PlatformId; name: string; sub: string; ready: boolean }[] = [
  { id: "meta", name: "מטא", sub: "פייסבוק ואינסטגרם", ready: true },
  { id: "google", name: "גוגל", sub: "חיפוש, יוטיוב ומפות", ready: false },
  { id: "tiktok", name: "טיקטוק", sub: "סרטונים קצרים", ready: false },
];

export type PlatformCampaign = FriendlyCampaign & { platform: PlatformId };

export async function allCampaigns(workspaceId: string, period: Period) {
  const meta = await getConnection<MetaConfig>(workspaceId, "meta");
  const out: { campaigns: PlatformCampaign[]; currency: string; connected: Record<PlatformId, boolean>; error: string | null } = {
    campaigns: [],
    currency: meta?.config.currency ?? "ILS",
    connected: { meta: !!meta?.secret && meta.status !== "broken", google: false, tiktok: false },
    error: null,
  };
  if (out.connected.meta) {
    try {
      const ctx = await metaContext(workspaceId);
      out.campaigns.push(...(await readCampaigns(ctx, period, true)).map((c) => ({ ...c, platform: "meta" as const })));
    } catch (e) {
      out.error = (e as Error).message;
    }
  }
  return out;
}
