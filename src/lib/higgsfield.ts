import "server-only";
import type { MediaSpec } from "./specs";

/**
 * Server-side Higgsfield access. Mikee never calls Higgsfield directly (no MCP connector on the model),
 * so every generation goes through a card or the client's pre-approved monthly allowance.
 */
export interface MediaGenerator {
  /** Credits the generation would cost (Higgsfield's get_cost preflight; submits nothing). */
  quote(spec: MediaSpec, refs: string[]): Promise<number>;
  /** Submits and returns job ids. Never retried automatically: an unknown outcome is surfaced instead. */
  submit(spec: MediaSpec, refs: string[]): Promise<string[]>;
  /** One long-poll round. */
  poll(jobIds: string[]): Promise<{ terminal: boolean; urls: string[]; failed: string[] }>;
  /** Imports a public product photo so it can be used as a reference. */
  importUrl(url: string): Promise<string>;
}

let override: MediaGenerator | null = null;
export function setMediaGeneratorForTests(g: MediaGenerator | null) {
  override = g;
}

export function mediaGenerator(): MediaGenerator | null {
  if (override) return override;
  if (!process.env.HIGGSFIELD_MCP_URL) return null;
  return new HiggsfieldMcp(process.env.HIGGSFIELD_MCP_URL, process.env.HIGGSFIELD_MCP_TOKEN);
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Walks a tool result looking for values by key name. Higgsfield's responses are JSON, shape varies by tool. */
function findValues(node: unknown, keys: RegExp, out: unknown[] = []): unknown[] {
  if (Array.isArray(node)) node.forEach((n) => findValues(n, keys, out));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (keys.test(k) && (typeof v === "string" || typeof v === "number")) out.push(v);
      findValues(v, keys, out);
    }
  }
  return out;
}

function parseResult(res: { content?: unknown; structuredContent?: unknown; isError?: boolean }) {
  const texts = Array.isArray(res.content) ? res.content.filter((c: any) => c?.type === "text").map((c: any) => c.text as string) : [];
  const json = texts.flatMap((t) => {
    try {
      return [JSON.parse(t)];
    } catch {
      return [];
    }
  });
  const data = res.structuredContent ?? (json.length === 1 ? json[0] : json);
  if (res.isError) throw new Error(`Higgsfield: ${texts.join(" ").slice(0, 300)}`);
  return { data, text: texts.join("\n") };
}

class HiggsfieldMcp implements MediaGenerator {
  constructor(private url: string, private token?: string) {}

  private async call(name: string, args: Record<string, unknown>) {
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
    const client = new Client({ name: "mikee", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(this.url), {
      requestInit: this.token ? { headers: { Authorization: `Bearer ${this.token}` } } : undefined,
    });
    await client.connect(transport);
    try {
      return parseResult((await client.callTool({ name, arguments: args })) as any);
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  private params(spec: MediaSpec, refs: string[]) {
    return {
      model: spec.model,
      prompt: spec.prompt,
      aspect_ratio: spec.aspectRatio,
      count: spec.count,
      ...(spec.duration ? { duration: spec.duration } : {}),
      ...(refs.length ? { medias: refs.map((value) => ({ value, role: spec.referenceRole ?? "image" })) } : {}),
      // Pay with credits explicitly; never let the server switch to a different balance silently.
      use_unlim: false,
    };
  }

  async quote(spec: MediaSpec, refs: string[]) {
    const tool = spec.type === "video" ? "generate_video" : "generate_image";
    const { data, text } = await this.call(tool, { params: { ...this.params(spec, refs), get_cost: true } });
    const cost = findValues(data, /^(credits|cost|total_cost|price|credits_cost)$/i).map(Number).find((n) => Number.isFinite(n));
    if (cost == null) throw new Error(`Could not read the price from Higgsfield (${text.slice(0, 200)})`);
    return cost;
  }

  async submit(spec: MediaSpec, refs: string[]) {
    const tool = spec.type === "video" ? "generate_video" : "generate_image";
    const { data, text } = await this.call(tool, { params: this.params(spec, refs), context: "Marketing content for a small business" });
    const ids = findValues(data, /^(job_id|jobId|id)$/).map(String).filter((v) => /^[0-9a-f-]{36}$/i.test(v));
    const unique = [...new Set(ids.length ? ids : (text.match(UUID) ?? []))];
    if (!unique.length) throw new Error(`Higgsfield returned no job (${text.slice(0, 200)})`);
    return unique;
  }

  async poll(jobIds: string[]) {
    const { data } = await this.call("jobs_wait", {
      jobs: jobIds.map((job_id, index) => ({ index, job_id })),
      timeout_seconds: 15,
    });
    const terminal = findValues(data, /^all_terminal$/).some((v) => String(v) === "true") || findValues(data, /^all_terminal$/).length === 0;
    const urls = findValues(data, /url/i).map(String).filter((u) => /^https:\/\//.test(u));
    const failed = findValues(data, /^status$/).map(String).filter((s) => /fail|error|cancel/i.test(s));
    return { terminal, urls: [...new Set(urls)], failed };
  }

  async importUrl(url: string) {
    const { data, text } = await this.call("media_import_url", { url, type: "image" });
    const id = findValues(data, /^(media_id|id)$/).map(String).find((v) => /^[0-9a-f-]{36}$/i.test(v)) ?? text.match(UUID)?.[0];
    if (!id) throw new Error("Higgsfield did not return a media id for the reference image");
    return id;
  }
}
