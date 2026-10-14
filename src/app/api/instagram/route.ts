import { z } from "zod";
import { getSession } from "@/lib/auth";
import { assertSameOrigin, guarded, limit, readJson } from "@/lib/guard";
import { autoReplySettings, FACT_TOPICS, listFacts, saveFacts } from "@/lib/instagram/facts";
import { inbox, markHandled, replyFromOwner, resumeThread, switchAutoReply } from "@/lib/instagram/inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Topic = z.enum(FACT_TOPICS as [string, ...string[]]).transform((t) => t as (typeof FACT_TOPICS)[number]);

/** Automatic Instagram replies: the switch and topics, the approved facts, and the messages. */
export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const ws = session.workspace.id;
  const [settings, facts, box] = await Promise.all([autoReplySettings(ws), listFacts(ws), inbox(ws)]);
  return Response.json({ settings, facts: facts.map((f) => ({ id: f.id, topic: f.topic, label: f.label, value: f.value, approvedAt: f.approvedAt })), ...box });
}

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("settings"), enabled: z.boolean(), topics: z.array(Topic).max(5) }),
  z.object({ action: z.literal("facts"), facts: z.array(z.object({ topic: Topic, label: z.string().max(60).nullish(), value: z.string().min(1).max(400) })).max(40) }),
  z.object({ action: z.literal("reply"), messageId: z.string().uuid(), text: z.string().min(1).max(1000) }),
  z.object({ action: z.literal("handled"), messageId: z.string().uuid() }),
  z.object({ action: z.literal("resume"), customerId: z.string().regex(/^\d{5,30}$/) }),
]);

export const POST = guarded(async (req: Request) => {
  assertSameOrigin(req);
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const ws = session.workspace.id;
  const body = await readJson(req, Action);
  await limit(`instagram:${ws}`, 60, 3600);
  switch (body.action) {
    case "settings":
      return Response.json({ ok: true, settings: await switchAutoReply(ws, body.enabled, body.topics) });
    case "facts": {
      const facts = await saveFacts(ws, session.user.id, body.facts);
      return Response.json({ ok: true, facts: facts.map((f) => ({ id: f.id, topic: f.topic, label: f.label, value: f.value, approvedAt: f.approvedAt })) });
    }
    case "reply": {
      const sent = await replyFromOwner(ws, body.messageId, body.text);
      if (sent.status !== "sent") return Response.json({ ok: false, error: sent.reason === "outside_window" ? "עברו יותר מ־24 שעות מההודעה האחרונה של הלקוחה, אז אינסטגרם לא מאפשרת לענות מכאן. אפשר לענות באפליקציה." : `ההודעה לא נשלחה. ${sent.error}` }, { status: 400 });
      return Response.json({ ok: true });
    }
    case "handled":
      return Response.json({ ok: await markHandled(ws, body.messageId) });
    case "resume":
      await resumeThread(ws, body.customerId);
      return Response.json({ ok: true });
  }
});
