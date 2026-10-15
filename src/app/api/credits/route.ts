import { z } from "zod";
import { getSession } from "@/lib/auth";
import { assertSameOrigin, guarded, limit, readJson } from "@/lib/guard";
import { logActivity } from "@/lib/activity";
import { dueNotice, noticeSeen, quota, THRESHOLDS } from "@/lib/credits";
import { GUIDANCE, planOf } from "@/lib/plans";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The client's usage, as she sees it: the share of the included quota used, what is left, when it renews and
 * bought credits apart. No prices, tokens, providers or model calls ever leave the server.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const ws = session.workspace;
  const [q, s] = await Promise.all([quota(ws.id, ws.timezone), getSettings(ws.id)]);
  return Response.json({
    percent: q.percent,
    included: q.included,
    includedLeft: q.includedLeft,
    purchasedLeft: q.purchasedLeft,
    renewsOn: q.renewsOn,
    cycle: q.cycle,
    plan: planOf(s).name,
    guidance: s.guidance ? GUIDANCE[s.guidance].name : null,
    notice: await dueNotice(ws.id, q),
  });
}

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("seen"), cycle: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), threshold: z.number().refine((t) => THRESHOLDS.includes(t)) }),
  // A request only: nothing is bought or charged here. We get back to her with the options.
  z.object({ action: z.literal("request"), kind: z.enum(["credits", "upgrade"]) }),
]);

export const POST = guarded(async (req: Request) => {
  assertSameOrigin(req);
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const ws = session.workspace;
  const body = await readJson(req, Action);
  if (body.action === "seen") {
    await noticeSeen(ws.id, body.cycle, body.threshold);
    return Response.json({ ok: true });
  }
  await limit(`billing-request:${ws.id}`, 5, 86400);
  console.info(`[billing] ${ws.name} asked for ${body.kind === "credits" ? "more credits" : "an upgrade"}`);
  await logActivity(ws.id, "billing_request", body.kind === "credits" ? "ביקשה להוסיף קרדיטים" : "ביקשה לשדרג את המנוי", { by: session.user.email });
  return Response.json({ ok: true });
});
