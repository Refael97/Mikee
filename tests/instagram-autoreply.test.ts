import { createHmac } from "crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { GET, POST } from "@/app/api/meta/webhook/route";
import { setAnthropicForTests } from "@/lib/agent/loop";
import { getConnection, saveConnection } from "@/lib/connections";
import { db, schema } from "@/lib/db";
import { groundedReply } from "@/lib/instagram/autoreply";
import { saveFacts, setAutoReply } from "@/lib/instagram/facts";
import { replyFromOwner } from "@/lib/instagram/inbox";
import { sendInstagramMessage } from "@/lib/instagram/send";
import { FakeMeta } from "./support/fake-meta";
import { createBusiness, drainJobs, fakeClaude, NOW } from "./support/setup";

const SECRET = "test-app-secret";
let meta: FakeMeta;
let uninstall: () => void;
let seq = 0;
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  uninstall?.();
  meta = new FakeMeta();
  uninstall = meta.install();
  vi.stubEnv("META_APP_SECRET", SECRET);
});
afterEach(() => {
  vi.unstubAllEnvs();
  setAnthropicForTests(null);
});

/** A business with its own Instagram account (ids are unique per test, as they are per business at Meta). */
async function business(opts: { enabled?: boolean; topics?: ("address" | "hours" | "phone" | "website" | "other")[] } = {}) {
  const ws = await createBusiness();
  const ig = `1784${++seq}000`;
  const conn = await getConnection(ws, "meta");
  await saveConnection(ws, "meta", { ...conn!.config, igUserId: ig }, "user-token");
  meta.nodes.get("page_1")!.instagram_business_account = { id: ig };
  const facts = await saveFacts(ws, "00000000-0000-0000-0000-000000000001", [
    { topic: "address", label: "תל אביב", value: "דיזנגוף 120, תל אביב" },
    { topic: "hours", value: "א׳ עד ה׳ 10:00 עד 19:00" },
  ]);
  await setAutoReply(ws, { enabled: opts.enabled ?? true, topics: opts.topics ?? ["address", "hours"] });
  return { ws, ig, facts };
}

function delivery(ig: string, m: { mid: string; from: string; to: string; text?: string; echo?: boolean; at?: number }) {
  const body = JSON.stringify({
    object: "instagram",
    entry: [{ id: ig, time: Date.now(), messaging: [{ sender: { id: m.from }, recipient: { id: m.to }, timestamp: m.at ?? Date.now(), message: { mid: m.mid, text: m.text, ...(m.echo ? { is_echo: true } : {}) } }] }],
  });
  return { body, sig: `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}` };
}

async function deliver(ig: string, m: Parameters<typeof delivery>[1], sig?: string) {
  const d = delivery(ig, m);
  return POST(new Request("https://mikee.example/api/meta/webhook", { method: "POST", body: d.body, headers: { "x-hub-signature-256": sig ?? d.sig, "content-type": "application/json" } }));
}

/** The model's decision, answering with the fact whose topic label appears in the prompt. */
const decides = (pick: (prompt: string) => object) => () => {
  const claude = fakeClaude([
    (req) => {
      const prompt = req.messages[0].content[0].text as string;
      return { content: [{ type: "text", text: JSON.stringify(pick(prompt)) }], stop_reason: "end_turn" };
    },
  ]);
  setAnthropicForTests(claude);
  return claude;
};
const factId = (prompt: string, topic: string) => prompt.match(new RegExp(`id (\\S+) \\| ${topic}`))![1];

async function row(mid: string) {
  const d = await db();
  return (await d.query.igMessages.findFirst({ where: eq(schema.igMessages.mid, mid) }))!;
}
const sent = () => meta.list("sentdm");

describe("Instagram webhook", () => {
  it("answers Meta's subscription check only with the right verify token", async () => {
    vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "verify-me");
    const ok = await GET(new Request("https://mikee.example/api/meta/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42"));
    expect(await ok.text()).toBe("42");
    expect((await GET(new Request("https://mikee.example/api/meta/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42"))).status).toBe(403);
  });

  it("refuses a delivery that is not signed by Meta, and stores nothing", async () => {
    const { ig } = await business();
    const res = await deliver(ig, { mid: "mid_forged", from: "5550001", to: ig, text: "איפה החנות?" }, "sha256=" + "0".repeat(64));
    expect(res.status).toBe(401);
    const d = await db();
    expect(await d.query.igMessages.findFirst({ where: eq(schema.igMessages.mid, "mid_forged") })).toBeUndefined();
  });
});

describe("automatic replies from approved facts", () => {
  it("'where is the store?' gets the approved address at once, once, even if Meta delivers it twice", async () => {
    const { ig } = await business();
    const claude = decides((p) => ({ answer: true, factIds: [factId(p, "כתובת")], reply: "החנות נמצאת בדיזנגוף 120, תל אביב.", reason: "address" }))();
    expect((await deliver(ig, { mid: "mid_1", from: "5550001", to: ig, text: "איפה החנות?" })).status).toBe(200);
    await deliver(ig, { mid: "mid_1", from: "5550001", to: ig, text: "איפה החנות?" });
    await drainJobs();
    expect(sent()).toHaveLength(1);
    expect(sent()[0]).toMatchObject({ recipient: "5550001", text: "החנות נמצאת בדיזנגוף 120, תל אביב." });
    expect(await row("mid_1")).toMatchObject({ status: "answered", replyMid: `m_${sent()[0].id}` });
    // One short call to the light model; the customer's text reaches it as data, not instructions.
    expect(claude.requests).toHaveLength(1);
    expect(claude.requests[0].messages[0].content[0].text).toMatch(/<untrusted source="instagram_message">/);

    // Meta echoes Mikee's own reply back: recognized, and the conversation stays with Mikee.
    await deliver(ig, { mid: `m_${sent()[0].id}`, from: ig, to: "5550001", text: "החנות נמצאת בדיזנגוף 120, תל אביב.", echo: true });
    await drainJobs();
    const d = await db();
    const thread = await d.query.igThreads.findFirst({ where: eq(schema.igThreads.customerId, "5550001") });
    expect(thread?.humanAt).toBeNull();
  });

  it("sends nothing when the facts do not answer it; the message waits for the client", async () => {
    const { ig } = await business();
    decides(() => ({ answer: false, factIds: [], reply: "", reason: "price not in facts" }))();
    await deliver(ig, { mid: "mid_price", from: "5550002", to: ig, text: "כמה עולה השמלה הירוקה?" });
    await drainJobs();
    expect(sent()).toHaveLength(0);
    expect(await row("mid_price")).toMatchObject({ status: "pending" });
  });

  it("blocks a reply that adds anything not in the approved facts", async () => {
    const { ig } = await business();
    decides((p) => ({ answer: true, factIds: [factId(p, "כתובת")], reply: "דיזנגוף 120, תל אביב. אפשר גם להתקשר 050-1234567.", reason: "address" }))();
    await deliver(ig, { mid: "mid_invent", from: "5550003", to: ig, text: "איפה אתם?" });
    await drainJobs();
    expect(sent()).toHaveLength(0);
    expect(await row("mid_invent")).toMatchObject({ status: "pending", reason: "number not in the approved facts" });
  });

  it("does not answer outside the chosen topics, when switched off, or for a photo without text", async () => {
    const off = await business({ enabled: false });
    await deliver(off.ig, { mid: "mid_off", from: "5550004", to: off.ig, text: "איפה החנות?" });
    const photo = await business();
    await deliver(photo.ig, { mid: "mid_photo", from: "5550005", to: photo.ig });
    await drainJobs();
    expect(await row("mid_off")).toMatchObject({ status: "off" });
    expect(await row("mid_photo")).toMatchObject({ status: "pending" });
    expect(sent()).toHaveLength(0);

    const hoursOnly = await business({ topics: ["hours"] });
    const decision = { answer: true, factIds: [hoursOnly.facts.find((f) => f.topic === "address")!.id], reply: "דיזנגוף 120, תל אביב", reason: "" };
    const allowed = hoursOnly.facts.filter((f) => f.topic === "hours");
    expect(groundedReply(decision, allowed)).toMatchObject({ ok: false });
  });

  it("stops when a person answers from the business's account, until the client gives it back", async () => {
    const { ig } = await business();
    await deliver(ig, { mid: "mid_a", from: "5550006", to: ig, text: "היי" });
    await deliver(ig, { mid: "mid_human", from: ig, to: "5550006", text: "היי, מה שלומך?", echo: true });
    setAnthropicForTests(fakeClaude([() => ({ content: [{ type: "text", text: '{"answer":false,"factIds":[],"reply":"","reason":"greeting"}' }], stop_reason: "end_turn" })]));
    await drainJobs();
    const claude = fakeClaude([]);
    setAnthropicForTests(claude);
    await deliver(ig, { mid: "mid_b", from: "5550006", to: ig, text: "איפה החנות?" });
    await drainJobs();
    expect(await row("mid_b")).toMatchObject({ status: "human" });
    expect(claude.requests).toHaveLength(0);
    expect(sent()).toHaveLength(0);
  });

  it("an Instagram account connected to two businesses is answered for neither", async () => {
    const a = await business();
    const other = await createBusiness();
    const conn = await getConnection(other, "meta");
    await saveConnection(other, "meta", { ...conn!.config, igUserId: a.ig }, "user-token");
    await deliver(a.ig, { mid: "mid_shared", from: "5550007", to: a.ig, text: "איפה החנות?" });
    const d = await db();
    expect(await d.query.igMessages.findFirst({ where: eq(schema.igMessages.mid, "mid_shared") })).toBeUndefined();
  });
});

describe("send_instagram_message", () => {
  it("sends only to a customer of this business who wrote in the last 24 hours", async () => {
    const { ws, ig } = await business();
    expect(await sendInstagramMessage(ws, "5550100", "שלום")).toMatchObject({ status: "error", reason: "not_this_business" });
    expect(await sendInstagramMessage(ws, ig, "שלום")).toMatchObject({ status: "error", reason: "not_this_business" });

    const d = await db();
    await d.insert(schema.igThreads).values({ workspaceId: ws, customerId: "5550101", lastCustomerAt: new Date(Date.now() - 25 * 3600 * 1000) });
    expect(await sendInstagramMessage(ws, "5550101", "שלום")).toMatchObject({ status: "error", reason: "outside_window" });

    await d.update(schema.igThreads).set({ lastCustomerAt: new Date(Date.now() - 3600 * 1000) }).where(and(eq(schema.igThreads.workspaceId, ws), eq(schema.igThreads.customerId, "5550101")));
    expect(await sendInstagramMessage(ws, "5550101", "שלום")).toMatchObject({ status: "sent" });
  });

  it("the client's own reply from the inbox sends it and takes the conversation over", async () => {
    const { ws, ig } = await business();
    decides(() => ({ answer: false, factIds: [], reply: "", reason: "unclear" }))();
    await deliver(ig, { mid: "mid_owner", from: "5550200", to: ig, text: "יש משלוחים לאילת?" });
    await drainJobs();
    const r = await row("mid_owner");
    expect(await replyFromOwner(ws, r.id, "כן, תוך 3 ימי עסקים")).toMatchObject({ status: "sent" });
    expect(await row("mid_owner")).toMatchObject({ status: "handled" });
    const d = await db();
    const thread = await d.query.igThreads.findFirst({ where: and(eq(schema.igThreads.workspaceId, ws), eq(schema.igThreads.customerId, "5550200")) });
    expect(thread?.humanAt).toBeTruthy();
    // Another business cannot act on this message.
    const stranger = await createBusiness();
    expect(await replyFromOwner(stranger, r.id, "היי")).toMatchObject({ status: "error" });
  });
});
