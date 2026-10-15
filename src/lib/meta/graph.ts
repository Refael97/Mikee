import "server-only";
import { createHash, createHmac } from "crypto";
import { currentTask } from "../telemetry";

const VERSION = process.env.META_GRAPH_VERSION || "v26.0";
// MIKEE_META_GRAPH_BASE points at a local stand-in for performance testing; production leaves it unset.
const BASE = process.env.MIKEE_META_GRAPH_BASE ? `${process.env.MIKEE_META_GRAPH_BASE}/${VERSION}` : `https://graph.facebook.com/${VERSION}`;

/** Minutes until Meta lifts a business-use-case throttle, from X-Business-Use-Case-Usage (docs: rate-limiting). */
function regainMinutes(headers: Headers): number | undefined {
  const raw = headers.get("x-business-use-case-usage");
  if (!raw) return undefined;
  try {
    const all = Object.values(JSON.parse(raw) as Record<string, { estimated_time_to_regain_access?: number }[]>).flat();
    const max = Math.max(0, ...all.map((u) => Number(u.estimated_time_to_regain_access ?? 0)));
    return Number.isFinite(max) ? max : undefined;
  } catch {
    return undefined;
  }
}

export type TokenKind = "user" | "system_user" | "page";

export class MetaError extends Error {
  /** Meta marked the error as temporary (is_transient, or codes 1/2). */
  transient = false;
  /** When throttled: minutes until access returns, if Meta said. */
  regainMinutes?: number;
  /** Meta's id for the failed call, to quote to Meta support. */
  fbtraceId?: string;
  /** The call that failed, e.g. "POST /act_1/campaigns" (ids only, never a token). */
  operation?: string;
  tokenKind?: TokenKind;
  /** A write whose answer never came (timeout or dropped connection): it may or may not exist at Meta. */
  outcomeUnknown = false;
  /** Selected fields of the failed request as sent (never tokens), e.g. an ad set's targeting. */
  request?: Record<string, unknown>;

  constructor(
    message: string,
    public code?: number,
    public subcode?: number,
    public userMessage?: string,
    public status?: number,
  ) {
    super(message);
  }

  /**
   * The token itself is dead or revoked (190, 102). A permission error on one object (10, 200-299, e.g.
   * audience terms not accepted, 200/1870034) is not: the hourly health check probes the token and each
   * asset and marks the connection when access to an asset is really gone.
   */
  get isAccessLost(): boolean {
    return this.code === 190 || this.code === 102;
  }

  /** Meta asks to slow down (docs: graph-api rate-limiting, marketing-api rate-limiting). */
  get isThrottled(): boolean {
    const c = this.code ?? -1;
    return [4, 17, 32, 341, 613].includes(c) || (c >= 80000 && c <= 80014);
  }

  /**
   * Whether reconnecting Facebook would fix this. Only a dead token (190, 102) or a permission the token
   * lacks (10, or 200-299 that says so) is fixed by reconnecting; everything else is about the request or the
   * object, and reconnecting would not help.
   */
  get reconnect(): "needed" | "only_if_permission_missing" | "not_needed" {
    if (this.isAccessLost) return "needed";
    const c = this.code ?? -1;
    if (c === 10 || (c >= 200 && c <= 299 && !this.subcode && /permission/i.test(this.message))) return "only_if_permission_missing";
    return "not_needed";
  }

  /** Meta's original error fields, as they came (tokens never included). */
  details() {
    return {
      operation: this.operation,
      token: this.tokenKind,
      message: this.message,
      code: this.code,
      error_subcode: this.subcode,
      error_user_msg: this.userMessage,
      fbtrace_id: this.fbtraceId,
      http_status: this.status,
      outcome_unknown: this.outcomeUnknown || undefined,
      request: this.request,
      reconnect: this.reconnect,
    };
  }

  /** Model-readable description used in tool results and failed cards: the original fields, nothing guessed. */
  describe(): string {
    const d = this.details();
    return [
      `Meta error on ${d.operation ?? "a call"}${d.token ? ` (${d.token} token)` : ""}`,
      `message: ${d.message}`,
      d.code != null ? `code: ${d.code}` : "",
      d.error_subcode != null ? `error_subcode: ${d.error_subcode}` : "",
      d.error_user_msg ? `error_user_msg: ${d.error_user_msg}` : "",
      d.fbtrace_id ? `fbtrace_id: ${d.fbtrace_id}` : "",
      d.outcome_unknown ? "outcome unknown: the request may have been carried out at Meta; check before trying again" : "",
      `reconnect: ${d.reconnect}`,
    ]
      .filter(Boolean)
      .join(" | ");
  }
}

type Params = Record<string, unknown>;

/**
 * Proof that a call comes from our server and not from someone holding a copied token: an HMAC-SHA256 of
 * the token keyed with the app secret (docs: graph-api/guides/secure-requests). With it, "Require App
 * Secret" can be switched on in the App Dashboard.
 */
export function appSecretProof(token: string): string | undefined {
  const secret = process.env.META_APP_SECRET;
  return secret ? createHmac("sha256", secret).update(token).digest("hex") : undefined;
}

/** The one redirect address, used both in the login dialog and in the code exchange (Meta requires an exact match). */
export function metaRedirectUri(): string {
  return new URL("/api/meta/callback", process.env.APP_URL).toString();
}

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
    readonly kind: TokenKind = "user",
  ) {}

  /**
   * Reads are retried a couple of times with backoff when Meta reports a temporary problem or asks to slow
   * down briefly. Writes are never retried here: execution checkpoints decide that, so nothing is created twice.
   */
  private async call<T>(method: "GET" | "POST" | "DELETE", path: string, params: Params = {}): Promise<T> {
    const task = currentTask();
    if (method !== "GET") {
      // A copy of the task that lost its lease must not write; the worker holding the lease does.
      if (task?.leaseLost) throw new MetaError("This task was taken over by another worker; nothing was sent to Meta.");
      task?.memo?.clear(); // after a write, earlier reads may be stale
    } else if (task?.memo) {
      // The same read twice in one preparation task is answered once (budget, forms, media).
      const key = `${createHash("sha256").update(this.token).digest("hex").slice(0, 12)} ${path} ${JSON.stringify(Object.entries(params).sort())}`;
      const hit = task.memo.get(key);
      if (hit) {
        task.metaMemoHits++;
        return hit as Promise<T>;
      }
      const pending = this.callUncached<T>(method, path, params);
      task.memo.set(key, pending);
      pending.catch(() => task.memo?.delete(key));
      return pending;
    }
    return this.callUncached<T>(method, path, params);
  }

  private async callUncached<T>(method: "GET" | "POST" | "DELETE", path: string, params: Params = {}): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.once<T>(method, path, params);
      } catch (e) {
        const err = e as MetaError;
        const retry = method === "GET" && attempt < 2 && err instanceof MetaError && (err.transient || (err.isThrottled && (err.regainMinutes ?? 0) <= 1) || (err.status ?? 0) >= 500);
        if (!retry) throw e;
        const wait = Number(process.env.MIKEE_META_BACKOFF_MS ?? 2000) * 2 ** attempt * (0.75 + Math.random() / 2);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }

  private async once<T>(method: "GET" | "POST" | "DELETE", path: string, params: Params = {}): Promise<T> {
    const clean = path.startsWith("/") ? path : `/${path}`;
    // Paths are plain segments: a query string or traversal smuggled into the path could change the request.
    if (!/^\/[A-Za-z0-9_./-]*$/.test(clean) || clean.includes("..")) throw new MetaError("Invalid Graph path");
    const { access_token: _ignored, appsecret_proof: _proof, ...rest } = params;
    const query = encode({ ...rest, appsecret_proof: appSecretProof(this.token) });
    const url = method === "GET" || method === "DELETE" ? `${BASE}${clean}?${query}` : `${BASE}${clean}`;
    const operation = `${method} ${clean}`;
    const task = currentTask();
    if (task) {
      if (method === "GET") task.metaGets++;
      else task.metaPosts++;
    }
    // The token travels in a header, never in a URL that could end up in logs.
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        body: method === "POST" ? query : undefined,
        headers: { Authorization: `Bearer ${this.token}`, ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
        cache: "no-store",
        signal: AbortSignal.timeout(Number(process.env.MIKEE_META_TIMEOUT_MS ?? 90_000)),
      });
    } catch (e) {
      // No answer: a read can simply be tried again, but a write may already exist at Meta.
      const err = new MetaError(`No answer from Meta (${(e as Error)?.name === "TimeoutError" ? "timed out" : "connection failed"})`);
      err.operation = operation;
      err.tokenKind = this.kind;
      err.transient = method === "GET";
      err.outcomeUnknown = method !== "GET";
      throw err;
    }
    const json = (await res.json().catch(() => ({}))) as {
      error?: { message: string; code?: number; error_subcode?: number; error_user_msg?: string; error_user_title?: string; is_transient?: boolean; fbtrace_id?: string };
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
      err.transient = !!e?.is_transient || e?.code === 1 || e?.code === 2;
      err.fbtraceId = e?.fbtrace_id;
      err.operation = operation;
      err.tokenKind = this.kind;
      err.regainMinutes = regainMinutes(res.headers);
      if (e?.fbtrace_id) console.warn(`[meta] ${clean} ${e.code ?? ""}/${e.error_subcode ?? ""} trace ${e.fbtrace_id}`);
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

  /**
   * Page actions (posting, lead forms) need a Page access token derived from the user's token. Without one
   * the call would fail later with a vaguer error, so say clearly what is missing.
   */
  async forPage(pageId: string): Promise<Graph> {
    const page = await this.get<{ access_token?: string }>(`/${pageId}`, { fields: "access_token" });
    if (!page.access_token) throw new MetaError("No Page access token: the connected person needs a role on the Page that allows posting and advertising", 200);
    return new Graph(page.access_token, this.onAccessLost, "page");
  }
}

export const GRAPH_VERSION = VERSION;

/**
 * The Facebook Login for Business dialog. The app is a Business app: what it asks for (token type, assets,
 * permissions) lives in a configuration in the App Dashboard, passed as config_id instead of a scope list.
 * System-user (business integration) tokens need the authorization-code grant, so the response type is
 * forced to code (docs: facebook-login/facebook-login-for-business).
 */
export function oauthDialogUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    redirect_uri: metaRedirectUri(),
    state,
    config_id: process.env.META_LOGIN_CONFIG_ID!,
    response_type: "code",
    override_default_response_type: "true",
  });
  // Every time, not only on a reconnect: a business that installed the integration before (with fewer assets
  // or permissions) is otherwise handed the old grant again without seeing the choice.
  params.set("auth_type", "rerequest");
  return `https://www.facebook.com/${VERSION}/dialog/oauth?${params}`;
}

/** Exchanges the login code for a long-lived (~60 day) user token. */
export async function exchangeCode(code: string): Promise<{ token: string; expiresAt: string | null }> {
  const base = {
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
  };
  const short = await fetch(`${BASE}/oauth/access_token?${new URLSearchParams({ ...base, redirect_uri: metaRedirectUri(), code })}`, { cache: "no-store" }).then((r) => r.json());
  if (!short.access_token) throw new MetaError(short.error?.message ?? "Login failed", short.error?.code, short.error?.error_subcode);
  // A user token is extended to ~60 days. A system-user token is already long-lived and cannot be extended.
  const long = await fetch(`${BASE}/oauth/access_token?${new URLSearchParams({ ...base, grant_type: "fb_exchange_token", fb_exchange_token: short.access_token })}`, {
    cache: "no-store",
  }).then((r) => r.json());
  if (long.error) console.warn("[meta] token not extended:", long.error.message);
  const token = long.access_token ?? short.access_token;
  const expiresIn = long.expires_in ?? short.expires_in;
  return { token, expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null };
}

export type TokenInfo = {
  appId: string;
  valid: boolean;
  scopes: string[];
  /** Which assets each permission was granted for (Login for Business); a scope without target_ids covers everything. */
  granularScopes: { scope: string; target_ids?: string[] }[];
  expiresAt: string | null;
  dataAccessExpiresAt: string | null;
  type?: string;
  /** When Meta issued it: a token from an earlier install is handed back again instead of a new one. */
  issuedAt?: string | null;
  /** The (system) user the token acts as. */
  userId?: string;
};

/**
 * Checks what a token really is, with the app's own credentials: which app issued it, whether it is valid,
 * its scopes and expiry. A token belongs to the app that issued it; one from an older app (or a test app)
 * is refused instead of failing later in the middle of a campaign.
 */
export async function inspectToken(token: string): Promise<TokenInfo | null> {
  const appId = process.env.META_APP_ID;
  const secret = process.env.META_APP_SECRET;
  if (!appId || !secret) return null;
  // The documented form: the app token as access_token (server to server only; this URL is never logged).
  const res = await fetch(`${BASE}/debug_token?${new URLSearchParams({ input_token: token, access_token: `${appId}|${secret}` })}`, { cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as {
    data?: { app_id?: string; is_valid?: boolean; scopes?: string[]; granular_scopes?: { scope: string; target_ids?: string[] }[]; expires_at?: number; data_access_expires_at?: number; type?: string; issued_at?: number; user_id?: string };
  };
  const d = json.data;
  if (!d) throw new MetaError("Could not inspect the token");
  const when = (s?: number) => (s ? new Date(s * 1000).toISOString() : null);
  return {
    appId: String(d.app_id ?? ""),
    valid: !!d.is_valid,
    scopes: d.scopes ?? [],
    granularScopes: d.granular_scopes ?? [],
    expiresAt: when(d.expires_at),
    dataAccessExpiresAt: when(d.data_access_expires_at),
    type: d.type,
    issuedAt: when(d.issued_at),
    userId: d.user_id,
  };
}

/**
 * The permissions Mikee's features rely on (the same list the Login for Business configuration must carry);
 * the settings page shows which of them the token lacks. instagram_basic depends on pages_read_user_content.
 */
export const NEEDED_SCOPES = [
  "ads_read",
  "ads_management",
  "business_management",
  "pages_show_list",
  "pages_read_engagement",
  "pages_read_user_content",
  "pages_manage_ads",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
  "instagram_manage_messages",
  "pages_manage_metadata",
  "leads_retrieval",
  "catalog_management",
  "read_insights",
  "instagram_manage_comments",
  "instagram_manage_engagement",
  "instagram_manage_contents",
  "instagram_manage_upcoming_events",
  "pages_manage_engagement",
];

/**
 * Business integration system-user tokens belong to the client's business portfolio. A 60-day one is
 * renewed before it expires by asking that business for a fresh token (docs: Business Integration System
 * User Access Token Management API).
 */
export async function clientBusinessId(token: string): Promise<string | null> {
  const me = await new Graph(token).get<{ client_business_id?: string }>("/me", { fields: "client_business_id" }).catch(() => ({}) as { client_business_id?: string });
  return me.client_business_id ?? null;
}

export async function renewSystemUserToken(token: string, businessId: string): Promise<string> {
  const r = await new Graph(token).post<{ access_token?: string }>(`/${businessId}/system_user_access_tokens`, { set_token_expires_in_60_days: true });
  if (!r.access_token) throw new MetaError("Meta did not return a renewed token");
  return r.access_token;
}
