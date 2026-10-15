/**
 * An in-memory stand-in for the Meta Graph API, enough to exercise everything Mikee writes:
 * campaigns, ad sets, ads, creatives, images, account spending limit, page posts, Instagram publishing.
 * It records every call and can fail chosen calls, so tests can prove what is (and is not) sent to Meta.
 */
type Node = Record<string, any> & { id: string; type: string };

export type Call = { method: string; path: string; params: Record<string, any> };

export class FakeMeta {
  nodes = new Map<string, Node>();
  calls: Call[] = [];
  account = { id: "act_1", currency: "ILS", amount_spent: "1000000", spend_cap: "0", account_status: 1 };
  monthSpend = 0;
  /** What debug_token reports for the business's token (when the app's credentials are set). */
  token = { valid: true, scopes: ["ads_management", "pages_show_list", "pages_manage_metadata", "instagram_basic", "instagram_manage_messages"] };
  private seq = 1000;
  private failures: { match: (c: Call) => boolean; times: number; message: string; code?: number; subcode?: number }[] = [];

  constructor() {
    this.nodes.set("page_1", { id: "page_1", type: "page", name: "Studio Noa", access_token: "page-token", instagram_business_account: { id: "ig_1" } });
    this.nodes.set("ig_1", { id: "ig_1", type: "ig" });
  }

  /** Make the next `times` matching calls fail. */
  failOn(match: (c: Call) => boolean, times = 1, message = "Simulated Meta failure", code = 2, subcode?: number) {
    this.failures.push({ match, times, message, code, subcode });
  }

  writes(pathPattern?: RegExp) {
    return this.calls.filter((c) => c.method !== "GET" && (!pathPattern || pathPattern.test(c.path)));
  }

  list(type: string) {
    return [...this.nodes.values()].filter((n) => n.type === type && !n.deleted);
  }

  add(type: string, props: Record<string, any>): Node {
    const id = props.id ?? `${type}_${this.seq++}`;
    const node = { id, type, status: "ACTIVE", created_time: new Date().toISOString(), ...props };
    this.nodes.set(id, node);
    return node;
  }

  effective(n: Node): string {
    if (n.deleted) return "DELETED";
    if (n.type === "adset") {
      const c = this.nodes.get(n.campaign_id);
      if (c && c.status === "PAUSED") return "CAMPAIGN_PAUSED";
    }
    if (n.type === "ad") {
      const s = this.nodes.get(n.adset_id);
      if (s && this.effective(s) !== "ACTIVE") return s.status === "PAUSED" ? "ADSET_PAUSED" : this.effective(s);
    }
    return n.status;
  }

  private view(n: Node): Node & { effective_status: string } {
    return { ...n, effective_status: this.effective(n) };
  }

  private filter(items: Node[], params: Record<string, any>) {
    let out = items.map((n) => this.view(n));
    if (params.effective_status) {
      const allowed: string[] = JSON.parse(params.effective_status);
      out = out.filter((n) => allowed.includes(n.effective_status));
    }
    if (params.filtering) {
      const f: { field: string; operator: string; value: string }[] = JSON.parse(params.filtering);
      for (const rule of f) if (rule.operator === "CONTAIN") out = out.filter((n) => String(n[rule.field] ?? "").includes(rule.value));
    }
    return { data: out, paging: {} };
  }

  handle(method: string, path: string, params: Record<string, any>): unknown {
    const call = { method, path, params };
    this.calls.push(call);
    const fail = this.failures.find((f) => f.times > 0 && f.match(call));
    if (fail) {
      fail.times--;
      return { __error: { message: fail.message, code: fail.code, error_subcode: fail.subcode } };
    }
    const parts = path.split("/").filter(Boolean);
    const [root, edge] = parts;

    if (root === "debug_token") return { data: { app_id: process.env.META_APP_ID, is_valid: this.token.valid, scopes: this.token.scopes } };
    if (root === "me") {
      if (edge === "permissions") return { data: ["ads_management", "pages_manage_posts", "instagram_content_publish"].map((permission) => ({ permission, status: "granted" })) };
      if (edge === "accounts") return { data: [{ id: "page_1", name: "Studio Noa", instagram_business_account: { id: "ig_1", username: "studio.noa" } }] };
      return { id: "user_1", name: "Noa" };
    }

    if (root === "act_1" && !edge && method === "GET" && params.fields === "business{name}") return { id: "act_1", business: { id: "biz_1", name: "אדרט גרופ בע״מ" } };
    if (root === "act_1" && !edge) {
      if (method === "POST") {
        if (params.spend_cap != null) this.account.spend_cap = String(Math.round(Number(params.spend_cap) * 100)); // written in main units, read in minor
        return { success: true };
      }
      return this.account;
    }
    if (root === "act_1") {
      if (method === "GET") {
        if (edge === "insights") return { data: [{ spend: String(this.monthSpend) }] };
        if (edge === "campaigns") return this.filter(this.list("campaign"), params);
        if (edge === "adsets") return this.filter(this.list("adset"), params);
        if (edge === "customaudiences") return { data: [] };
        if (edge === "adimages") {
          const hashes: string[] | null = params.hashes ? JSON.parse(params.hashes) : null;
          return { data: this.list("adimage").filter((i) => !hashes || hashes.includes(i.hash)), paging: {} };
        }
        if (edge === "advideos") return { data: this.list("advideo"), paging: {} };
        if (edge === "ads") return { data: this.list("pastad"), paging: {} };
        return { data: [] };
      }
      switch (edge) {
        case "campaigns":
          return { id: this.add("campaign", { name: params.name, status: params.status, objective: params.objective, account_id: "1" }).id };
        case "adsets":
          return {
            id: this.add("adset", {
              name: params.name,
              account_id: "1",
              campaign_id: params.campaign_id,
              status: params.status,
              daily_budget: params.daily_budget,
              optimization_goal: params.optimization_goal,
              destination_type: params.destination_type,
              start_time: params.start_time,
              end_time: params.end_time,
              targeting: params.targeting ? JSON.parse(params.targeting) : undefined,
              regional_regulation_identities: params.regional_regulation_identities ? JSON.parse(params.regional_regulation_identities) : undefined,
            }).id,
          };
        case "adcreatives":
          return { id: this.add("creative", { name: params.name }).id };
        case "ads":
          return { id: this.add("ad", { name: params.name, adset_id: params.adset_id, status: params.status, account_id: "1" }).id };
        case "adimages":
          return { images: { img: { hash: `hash_${this.seq++}` } } };
        case "customaudiences":
          return { id: this.add("audience", { name: params.name }).id };
      }
      return { id: this.add("other", params).id };
    }

    if (root === "page_1") {
      if (method === "GET" && !edge) return this.nodes.get("page_1");
      if (method === "POST" && edge === "messages") {
        const recipient = JSON.parse(params.recipient);
        const message = JSON.parse(params.message);
        const sent = this.add("sentdm", { recipient: recipient.id, text: message.text });
        return { recipient_id: recipient.id, message_id: `m_${sent.id}` };
      }
      if (method === "POST" && edge === "subscribed_apps") {
        // As at Meta: the page's "messages" field is Messenger's and needs pages_messaging, which Mikee's token lacks.
        if (String(params.subscribed_fields).split(",").includes("messages"))
          return { __error: { message: "(#200) To subscribe to the messages field, one of these permissions is needed: pages_messaging", code: 200 } };
        this.add("pagesub", { fields: params.subscribed_fields });
        return { success: true };
      }
      if (method === "GET" && edge === "conversations") {
        const convs = params.platform === "instagram" ? this.list("igconv") : [];
        return { data: convs.map((c) => ({ id: c.id, updated_time: c.updated_time, participants: { data: c.participants } })), paging: {} };
      }
      if (method === "GET" && edge === "leadgen_forms") return { data: this.list("leadform"), paging: {} };
      if (method === "GET" && edge === "posts") return { data: this.list("fbpost").map((p) => ({ id: p.id, message: p.message, created_time: p.created_time })) };
      if (method === "POST" && (edge === "photos" || edge === "feed" || edge === "videos")) {
        if (params.published === "false") return { id: this.add("fbphoto", {}).id };
        return { id: this.add("fbpost", { message: params.message ?? params.description }).id };
      }
    }
    if (root === "ig_1") {
      if (method === "GET" && !edge) return { id: "ig_1" };
      if (method === "GET" && edge === "media") return { data: this.list("igpost").map((p) => ({ id: p.id, caption: p.caption, timestamp: p.created_time })) };
      if (method === "POST" && edge === "media") return { id: this.add("igcontainer", { caption: params.caption }).id };
      if (method === "POST" && edge === "media_publish") {
        const c = this.nodes.get(params.creation_id);
        return { id: this.add("igpost", { caption: c?.caption }).id };
      }
    }

    const node = this.nodes.get(root);
    // Ad set copies, answered like Meta's real /copies (copied_adset_id, then ad_object_ids with the ad set and each ad).
    if (node && node.type === "adset" && edge === "copies" && method === "POST") {
      const deep = params.deep_copy === "true";
      const status = params.status_option === "PAUSED" ? "PAUSED" : params.status_option === "ACTIVE" ? "ACTIVE" : node.status;
      const { id: _id, created_time: _t, ...rest } = node;
      const copy = this.add("adset", { ...rest, name: `${node.name} - Copy`, campaign_id: params.campaign_id ?? node.campaign_id, status });
      const objects = [{ ad_object_type: "ad_set", source_id: node.id, copied_id: copy.id }];
      if (deep) {
        for (const ad of this.list("ad").filter((a) => a.adset_id === node.id)) {
          const { id: _a, created_time: _c, ...adRest } = ad;
          const c = this.add("ad", { ...adRest, name: `${ad.name} - Copy`, adset_id: copy.id, status });
          objects.push({ ad_object_type: "ad", source_id: ad.id, copied_id: c.id });
        }
      }
      return { copied_adset_id: copy.id, ad_object_ids: objects };
    }
    if (node && !edge) {
      if (method === "DELETE") {
        node.deleted = true;
        return { success: true };
      }
      if (method === "POST") {
        Object.assign(node, params);
        return { success: true };
      }
      if (node.type === "igcontainer") return { status_code: "FINISHED" };
      if (node.type === "igconv") {
        const msgs = this.list("igmsg").filter((m) => m.conversation === node.id).sort((a, b) => b.created_time.localeCompare(a.created_time));
        return { id: node.id, participants: { data: node.participants }, messages: { data: msgs.map((m) => ({ id: m.id, created_time: m.created_time })) } };
      }
      if (node.type === "igmsg") return { id: node.id, created_time: node.created_time, from: node.from, to: node.to, message: node.message };
      return this.view(node);
    }
    if (node && edge === "adsets") return this.filter(this.list("adset").filter((a) => a.campaign_id === root), params);
    if (node && edge === "ads") return this.filter(this.list("ad").filter((a) => a.adset_id === root), params);
    if (node?.deleted || !node) return { __error: { message: `Unsupported get request. Object ${root} does not exist`, code: 100 } };
    return { data: [] };
  }

  /** Installs a fetch that answers graph.facebook.com and serves media downloads. */
  install() {
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: any, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      if (url.hostname !== "graph.facebook.com") {
        return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), { headers: { "content-type": url.pathname.endsWith(".mp4") ? "video/mp4" : "image/jpeg" } });
      }
      const method = (init?.method ?? "GET").toUpperCase();
      const params: Record<string, any> = {};
      const source = method === "POST" ? new URLSearchParams(String(init?.body ?? "")) : url.searchParams;
      source.forEach((v, k) => {
        if (k !== "access_token" && k !== "appsecret_proof") params[k] = v;
      });
      const path = url.pathname.replace(/^\/v\d+\.\d+/, "");
      const out = this.handle(method, path, params) as any;
      if (out?.__error) return Response.json({ error: out.__error }, { status: 400 });
      return Response.json(out);
    }) as typeof fetch;
    return () => {
      globalThis.fetch = original;
    };
  }
}
