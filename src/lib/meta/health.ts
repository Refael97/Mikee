import "server-only";
import { getConnection, markConnection, type MetaConfig } from "../connections";
import { Graph, MetaError } from "./graph";

const PERMISSIONS_NEEDED = ["ads_management", "pages_manage_posts", "instagram_content_publish"];

/**
 * A token with no planned expiry can still be revoked (password change, removed from the business,
 * app permission withdrawn). This checks the token itself and every asset the client picked.
 */
export async function checkMetaHealth(workspaceId: string): Promise<{ ok: boolean; problems: string[] }> {
  const conn = await getConnection<MetaConfig>(workspaceId, "meta");
  if (!conn?.secret) return { ok: false, problems: ["not connected"] };
  const graph = new Graph(conn.secret);
  const c = conn.config;
  const problems: string[] = [];

  const probe = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      problems.push(`${label}: ${e instanceof MetaError ? e.message : String(e)}`);
    }
  };

  await probe("token", () => graph.get("/me", { fields: "id" }));
  if (!problems.length) {
    await probe("permissions", async () => {
      const perms = await graph.get<{ data: { permission: string; status: string }[] }>("/me/permissions");
      const granted = new Set(perms.data.filter((p) => p.status === "granted").map((p) => p.permission));
      const missing = PERMISSIONS_NEEDED.filter((p) => !granted.has(p));
      // System-user tokens report business permissions differently; only flag an explicit decline.
      const declined = perms.data.filter((p) => p.status === "declined" && PERMISSIONS_NEEDED.includes(p.permission));
      if (declined.length) throw new Error(`declined: ${declined.map((p) => p.permission).join(", ")}`);
      return missing;
    });
    if (c.adAccountId) {
      await probe("ad account", async () => {
        const a = await graph.get<{ account_status: number }>(`/${c.adAccountId}`, { fields: "account_status" });
        // 1 = active. 2 disabled, 3 unsettled, 7/8/9 pending review/closure, 101 closed.
        if (a.account_status !== 1) throw new Error(`account status ${a.account_status} (not active)`);
      });
    }
    if (c.pageId) await probe("page", () => graph.get(`/${c.pageId}`, { fields: "id,access_token" }));
    if (c.igUserId) await probe("instagram", () => graph.get(`/${c.igUserId}`, { fields: "id" }));
  }

  if (problems.length) await markConnection(workspaceId, "meta", "broken", problems.join("; "));
  else await markConnection(workspaceId, "meta", "ok");
  return { ok: problems.length === 0, problems };
}
