/**
 * A dress rehearsal of the reviewer instructions: sends each documented chat request to Mikee in the review
 * business (the account from review-account) and checks that it reaches the tool the instructions promise,
 * without asking questions back or saying it cannot. Cards it prepares stay pending; nothing is approved,
 * published or spent. It uses AI credits like a real conversation.
 * Usage (Railway shell): npm run review-rehearsal
 */
import { eq } from "drizzle-orm";
import { db, schema } from "../src/lib/db";
import { appendMessage } from "../src/lib/conversation";
import { runMikee } from "../src/lib/agent/run";

const BUSINESS = "Meta Review";
const SCENARIOS: { ask: string; expect: string[]; proves: string }[] = [
  { ask: "How did my ads do in the last 7 days?", expect: ["read_results", "read_insights"], proves: "ads_read, read_insights" },
  { ask: "Create a test campaign with 10 ILS a day", expect: ["propose_campaign"], proves: "ads_management, pages_manage_ads" },
  { ask: "Write a post for Facebook and Instagram", expect: ["propose_post"], proves: "pages_manage_posts, instagram_content_publish" },
  { ask: "Show me the latest leads from my lead forms", expect: ["meta_read"], proves: "leads_retrieval" },
  { ask: "Create an Instagram event reminder for our launch next Friday at 18:00", expect: ["meta_write"], proves: "instagram_manage_upcoming_events" },
];
const REFUSAL = /(I (can't|cannot|am unable|don't have)|not able to|אין לי (אפשרות|גישה|יכולת)|לא יכול)/i;

async function main() {
  const d = await db();
  const ws = (await d.select().from(schema.workspaces)).find((w) => w.name === BUSINESS);
  if (!ws) return console.log(`No "${BUSINESS}" business. Create it first: npm run review-account -- mikee`);
  let failed = 0;
  for (const s of SCENARIOS) {
    const [conv] = await d.insert(schema.conversations).values({ workspaceId: ws.id, title: `Rehearsal: ${s.ask.slice(0, 40)}` }).returning();
    await appendMessage(ws.id, conv.id, "user", "chat", [{ type: "text", text: s.ask }]);
    const tools = new Set<string>();
    let cards = 0;
    const reply = await runMikee({
      workspaceId: ws.id,
      conversationId: conv.id,
      emit: (e) => {
        if (e.t === "tool" && e.state === "done") tools.add(e.name);
        if (e.t === "proposal") cards++;
      },
    }).catch((e: Error) => `ERROR ${e.message}`);
    const hit = s.expect.some((t) => tools.has(t));
    const refused = REFUSAL.test(reply);
    const ok = hit && !refused;
    if (!ok) failed++;
    console.log(`\n${ok ? "ok  " : "FAIL"}  "${s.ask}"  (${s.proves})`);
    console.log(`      tools: ${[...tools].join(", ") || "none"}${cards ? `, cards: ${cards}` : ""}`);
    if (!hit) console.log(`      expected one of: ${s.expect.join(", ")}`);
    if (refused) console.log("      the reply sounds like a refusal");
    console.log(`      reply: ${reply.replace(/\s+/g, " ").slice(0, 240)}`);
    await d.update(schema.conversations).set({ archived: true }).where(eq(schema.conversations.id, conv.id));
  }
  console.log(failed ? `\n${failed} of ${SCENARIOS.length} requests did not do what the reviewer instructions promise.` : "\nEvery documented request reached the right tool.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
