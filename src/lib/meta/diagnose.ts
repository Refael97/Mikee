import { Graph, MetaError, NEEDED_SCOPES, type TokenInfo } from "./graph";

/**
 * One log entry per Facebook connection attempt, so a failed connection says exactly why: the token Meta
 * returned (type, permissions and the assets each was granted for, never the token itself) and what each
 * asset read answered. Ids of businesses, ad accounts and pages are not secrets.
 */
export async function connectDiagnosis(
  token: string,
  info: TokenInfo | null,
  businessId: string | null,
) {
  const graph = new Graph(token);
  const probe = async (path: string, fields: string) => {
    try {
      const rows = await graph.all<{ id: string; name?: string }>(path, {
        fields,
      });
      return {
        ok: true,
        count: rows.length,
        ids: rows.slice(0, 10).map((r) => r.id),
      };
    } catch (e) {
      const err = e as MetaError;
      return {
        ok: false,
        code: err.code,
        subcode: err.subcode,
        error: err.message?.slice(0, 200),
        trace: err.fbtraceId,
      };
    }
  };
  const me = await graph
    .get<{ id: string; name?: string }>("/me", { fields: "id,name" })
    .then(
      (r) => ({ ok: true, id: r.id }),
      (e: MetaError) => ({
        ok: false,
        code: e.code,
        error: e.message?.slice(0, 200),
      }),
    );
  const reads = await Promise.all([
    probe("/me/adaccounts", "id,name"),
    probe("/me/accounts", "id,name"),
    probe("/me/businesses", "id,name"),
    ...(businessId
      ? [
          probe(`/${businessId}/owned_ad_accounts`, "id,name"),
          probe(`/${businessId}/client_ad_accounts`, "id,name"),
          probe(`/${businessId}/owned_pages`, "id,name"),
        ]
      : []),
  ]);
  const names = [
    "me/adaccounts",
    "me/accounts",
    "me/businesses",
    "business/owned_ad_accounts",
    "business/client_ad_accounts",
    "business/owned_pages",
  ];
  return {
    token: info
      ? {
          type: info.type,
          valid: info.valid,
          rightApp: info.appId === process.env.META_APP_ID,
          missing: NEEDED_SCOPES.filter((s) => !info.scopes.includes(s)),
          granted: info.granularScopes.map((g) => ({
            scope: g.scope,
            targets: g.target_ids ?? "all",
          })),
          expiresAt: info.expiresAt,
          issuedAt: info.issuedAt ?? null,
          userId: info.userId ?? null,
        }
      : "not inspected",
    clientBusinessId: businessId,
    me,
    reads: Object.fromEntries(reads.map((r, i) => [names[i], r])),
  };
}

export async function logConnectDiagnosis(
  token: string,
  info: TokenInfo | null,
  businessId: string | null,
) {
  console.info(
    "[meta] connect diagnosis",
    JSON.stringify(await connectDiagnosis(token, info, businessId)),
  );
}
