import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { saveConnection } from "@/lib/connections";
import { claimNext } from "@/lib/jobs";
import { runJob } from "@/lib/worker";
import type { MediaGenerator } from "@/lib/higgsfield";

export const TZ = "Asia/Jerusalem";
/** Tuesday 20 Oct 2026, 12:00 in Israel: 12 days left in the month including today. */
export const NOW = new Date("2026-10-20T09:00:00Z");

let n = 0;
export async function createBusiness(opts: { budget?: number; stage?: string; settings?: Record<string, unknown> } = {}) {
  const d = await db();
  const [ws] = await d
    .insert(schema.workspaces)
    .values({ name: `Studio ${++n}`, stage: opts.stage ?? "active", settings: opts.settings ?? {} })
    .returning();
  await saveConnection(
    ws.id,
    "meta",
    { userName: "Noa", adAccountId: "act_1", adAccountName: "Studio Noa", currency: "ILS", pageId: "page_1", pageName: "Studio Noa", igUserId: "ig_1", igUsername: "studionoa", pixelId: "px_1" },
    "user-token",
  );
  if (opts.budget != null) await d.insert(schema.budgets).values({ workspaceId: ws.id, monthlyLimit: opts.budget, currency: "ILS" });
  return ws.id;
}

export async function setBudget(workspaceId: string, amount: number) {
  const d = await db();
  await d.update(schema.budgets).set({ monthlyLimit: amount }).where(eq(schema.budgets.workspaceId, workspaceId));
}

/** Runs every queued job, like the background worker would. */
export async function drainJobs(max = 50) {
  for (let i = 0; i < max; i++) {
    const job = await claimNext();
    if (!job) return i;
    await runJob(job);
  }
  throw new Error("jobs did not settle");
}

export async function proposal(id: string) {
  const d = await db();
  return (await d.query.proposals.findFirst({ where: eq(schema.proposals.id, id) }))!;
}

export const campaignSpec = (over: Record<string, unknown> = {}) => ({
  title: "נותנים לקולקציה החדשה את הבמה",
  why: "הקולקציה עלתה לאתר אתמול",
  goal: "traffic",
  dailyBudget: 50,
  audience: { description: "קהל חדש בישראל, עם התאמה אוטומטית", countries: ["IL"], genders: "all", advantage: true },
  ads: [
    { primaryText: "הקולקציה החדשה כאן", headline: "סתיו 2026", link: "https://studio.example/new", cta: "SHOP_NOW", media: { type: "image", url: "https://cdn.example/a.jpg" } },
    { primaryText: "מה לובשים כשמתקרר?", headline: "סתיו 2026", link: "https://studio.example/new", cta: "SHOP_NOW", media: { type: "image", url: "https://cdn.example/b.jpg" } },
  ],
  ...over,
});

/** A scripted stand-in for the Claude client: each call returns the next scripted message. */
export function fakeClaude(script: ((req: any) => { content: any[]; stop_reason: string })[]) {
  const requests: any[] = [];
  return {
    requests,
    beta: {
      messages: {
        stream(req: any) {
          requests.push(structuredClone(req));
          const next = script.shift();
          if (!next) throw new Error("fake Claude ran out of scripted replies");
          const msg = { id: `msg_${requests.length}`, model: req.model, usage: { input_tokens: 1000, output_tokens: 200 }, ...next(req) };
          const handlers: ((t: string) => void)[] = [];
          return {
            on(event: string, cb: (t: string) => void) {
              if (event === "text") handlers.push(cb);
              return this;
            },
            async finalMessage() {
              for (const b of msg.content) if (b.type === "text") handlers.forEach((h) => h(b.text));
              return msg;
            },
          };
        },
      },
    },
  };
}

export const toolUse = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input });

/** Higgsfield stand-in that counts submissions (each one costs real credits). */
export function fakeGenerator(opts: { cost?: number; terminalAfter?: number } = {}) {
  const state = { submits: 0, polls: 0, quotes: 0 };
  const gen: MediaGenerator = {
    async quote() {
      state.quotes++;
      return opts.cost ?? 8;
    },
    async submit() {
      state.submits++;
      return ["11111111-1111-4111-8111-111111111111"];
    },
    async poll() {
      state.polls++;
      const terminal = state.polls >= (opts.terminalAfter ?? 1);
      return { terminal, urls: terminal ? ["https://cdn.higgsfield.example/out.jpg"] : [], failed: [] };
    },
    async importUrl() {
      return "22222222-2222-4222-8222-222222222222";
    },
  };
  return { gen, state };
}

const ROLE_MARKERS: [string, string][] = [
  ["# Your role: copywriter", "copywriter"],
  ["# Your role: media buyer", "media_buyer"],
  ["# Your role: creative director", "creative"],
  ["# Your role: social media manager", "social"],
  ["# Your role: performance analyst", "analyst"],
  ["You are Mikee", "mikee"],
];

/** Like fakeClaude, but with a separate script per agent, recognised from its system prompt. */
export function fakeTeam(scripts: Record<string, ((req: any) => { content: any[]; stop_reason: string })[]>) {
  const requests: { agent: string; req: any }[] = [];
  const agentOf = (req: any) => {
    const sys = req.system.map((b: any) => b.text).join("\n");
    return ROLE_MARKERS.find(([marker]) => sys.includes(marker))?.[1] ?? "unknown";
  };
  return {
    requests,
    beta: {
      messages: {
        stream(req: any) {
          const agent = agentOf(req);
          requests.push({ agent, req: structuredClone(req) });
          const next = scripts[agent]?.shift();
          if (!next) throw new Error(`fake Claude ran out of scripted replies for ${agent}`);
          const msg = { id: `msg_${requests.length}`, model: req.model, usage: { input_tokens: 1000, output_tokens: 200 }, ...next(req) };
          return {
            on() {
              return this;
            },
            async finalMessage() {
              return msg;
            },
          };
        },
      },
    },
  };
}
