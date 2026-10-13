import "server-only";

const VERSION = process.env.META_GRAPH_VERSION || "v26.0";
const BASE = `https://graph.facebook.com/${VERSION}`;

export class MetaError extends Error {
  constructor(
    message: string,
    public code?: number,
    public subcode?: number,
    public userMessage?: string,
    public status?: number,
  ) {
    super(message);
  }

  /** Token expired or revoked (190), or the app/user lost permission to the object (10, 200-299). */
  get isAccessLost(): boolean {
    return this.code === 190 || this.code === 102 || this.code === 10 || (this.code != null && this.code >= 200 && this.code < 300);
  }

  /** Short, model-readable description used in tool results. */
  describe(): string {
    return [
      `Meta error${this.code ? ` ${this.code}` : ""}${this.subcode ? `/${this.subcode}` : ""}: ${this.message}`,
      this.userMessage ? `Detail: ${this.userMessage}` : "",
    ]
      .filter(Boolean)
      .join(" | ");
  }
}

type Params = Record<string, unknown>;

function encode(params: Params): URLSearchParams {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    body.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  return body;
}

/** Thin Graph API client. Tokens stay server-side; the model only ever sees results. */
export class Graph {
  constructor(
    private token: string,
    /** Called when Meta says the token or an asset is no longer accessible. */
    private onAccessLost?: (err: MetaError) => void | Promise<void>,
  ) {}

  private async call<T>(method: "GET" | "POST" | "DELETE", path: string, params: Params = {}): Promise<T> {
    const clean = path.startsWith("/") ? path : `/${path}`;
    // Paths are plain segments: a query string or traversal smuggled into the path could change the request.
    if (!/^\/[A-Za-z0-9_./-]*$/.test(clean) || clean.includes("..")) throw new MetaError("Invalid Graph path");
    const { access_token: _ignored, ...rest } = params;
    const query = encode(rest);
    const url = method === "GET" || method === "DELETE" ? `${BASE}${clean}?${query}` : `${BASE}${clean}`;
    // The token travels in a header, never in a URL that could end up in logs.
    const res = await fetch(url, {
      method,
      body: method === "POST" ? query : undefined,
      headers: { Authorization: `Bearer ${this.token}`, ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: { message: string; code?: number; error_subcode?: number; error_user_msg?: string; error_user_title?: string };
    } & T;
    if (!res.ok || json.error) {
      const e = json.error;
      const err = new MetaError(
        e?.message ?? `HTTP ${res.status}`,
        e?.code,
        e?.error_subcode,
        e?.error_user_msg ?? e?.error_user_title,
        res.status,
      );
      if (err.isAccessLost) await this.onAccessLost?.(err);
      throw err;
    }
    return json;
  }

  get<T = any>(path: string, params?: Params) {
    return this.call<T>("GET", path, params);
  }

  post<T = any>(path: string, params?: Params) {
    return this.call<T>("POST", path, params);
  }

  delete<T = any>(path: string, params?: Params) {
    return this.call<T>("DELETE", path, params);
  }

  /** Follows paging.next up to `max` items. */
  async all<T = any>(path: string, params: Params = {}, max = 500): Promise<T[]> {
    const out: T[] = [];
    let after: string | undefined;
    while (out.length < max) {
      const page = await this.get<{ data: T[]; paging?: { cursors?: { after?: string }; next?: string } }>(path, {
        limit: Math.min(100, max - out.length),
        ...params,
        ...(after ? { after } : {}),
      });
      out.push(...(page.data ?? []));
      if (!page.paging?.next || !page.paging.cursors?.after) break;
      after = page.paging.cursors.after;
    }
    return out;
  }

  /** Page actions (posting) need a page access token derived from the user token. */
  async forPage(pageId: string): Promise<Graph> {
    const page = await this.get<{ access_token?: string }>(`/${pageId}`, { fields: "access_token" });
    return page.access_token ? new Graph(page.access_token, this.onAccessLost) : this;
  }
}

export const GRAPH_VERSION = VERSION;

export function oauthDialogUrl(state: string): string {
  const appId = process.env.META_APP_ID!;
  const redirect = `${process.env.APP_URL}/api/meta/callback`;
  const params = new URLSearchParams({ client_id: appId, redirect_uri: redirect, state, response_type: "code" });
  if (process.env.META_LOGIN_CONFIG_ID) {
    params.set("config_id", process.env.META_LOGIN_CONFIG_ID);
  } else {
    params.set(
      "scope",
      [
        "ads_management",
        "ads_read",
        "business_management",
        "pages_show_list",
        "pages_read_engagement",
        "pages_manage_posts",
        "pages_manage_ads",
        "pages_manage_metadata",
        "instagram_basic",
        "instagram_content_publish",
        "instagram_manage_insights",
        "catalog_management",
        "leads_retrieval",
      ].join(","),
    );
  }
  return `https://www.facebook.com/${VERSION}/dialog/oauth?${params}`;
}

/** Exchanges the login code for a long-lived (~60 day) user token. */
export async function exchangeCode(code: string): Promise<{ token: string; expiresAt: string | null }> {
  const base = {
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
  };
  const short = await fetch(
    `${BASE}/oauth/access_token?${new URLSearchParams({ ...base, redirect_uri: `${process.env.APP_URL}/api/meta/callback`, code })}`,
  ).then((r) => r.json());
  if (!short.access_token) throw new MetaError(short.error?.message ?? "Login failed");
  const long = await fetch(
    `${BASE}/oauth/access_token?${new URLSearchParams({ ...base, grant_type: "fb_exchange_token", fb_exchange_token: short.access_token })}`,
  ).then((r) => r.json());
  const token = long.access_token ?? short.access_token;
  const expiresIn = long.expires_in ?? short.expires_in;
  return { token, expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null };
}

export type TokenInfo = { appId: string; valid: boolean; scopes: string[]; expiresAt: string | null; dataAccessExpiresAt: string | null; type?: string };

/**
 * Checks what a token really is, with the app's own credentials: which app issued it, whether it is valid,
 * its scopes and expiry. A token belongs to the app that issued it; one from an older app (or a test app)
 * is refused instead of failing later in the middle of a campaign.
 */
export async function inspectToken(token: string): Promise<TokenInfo | null> {
  const appId = process.env.META_APP_ID;
  const secret = process.env.META_APP_SECRET;
  if (!appId || !secret) return null;
  const res = await fetch(`${BASE}/debug_token?${new URLSearchParams({ input_token: token })}`, {
    headers: { Authorization: `Bearer ${appId}|${secret}` },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { data?: { app_id?: string; is_valid?: boolean; scopes?: string[]; expires_at?: number; data_access_expires_at?: number; type?: string } };
  const d = json.data;
  if (!d) throw new MetaError("Could not inspect the token");
  const when = (s?: number) => (s ? new Date(s * 1000).toISOString() : null);
  return { appId: String(d.app_id ?? ""), valid: !!d.is_valid, scopes: d.scopes ?? [], expiresAt: when(d.expires_at), dataAccessExpiresAt: when(d.data_access_expires_at), type: d.type };
}

/** The permissions Mikee's features rely on; the settings page shows which of them the token lacks. */
export const NEEDED_SCOPES = ["ads_read", "ads_management", "pages_show_list", "pages_read_engagement", "pages_manage_ads", "pages_manage_posts", "business_management", "instagram_basic", "instagram_content_publish", "instagram_manage_insights", "leads_retrieval"];
