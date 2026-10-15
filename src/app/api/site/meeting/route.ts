import { ne } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { assertSameOrigin, clientIp, guarded, limit, readJson, Refused } from "@/lib/guard";
import { isOpenSlot, slotLabel } from "@/lib/meetings";

export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().trim().min(2).max(80),
  business: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(/^[0-9+\-\s()]{9,20}$/),
  email: z.string().trim().email().max(160),
  link: z.string().trim().max(300).optional().default(""),
  plan: z.enum(["ai_299", "ai_499"]),
  slot: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/),
  notes: z.string().trim().max(1500).optional().default(""),
});

/**
 * A visitor books an intro meeting (the hybrid plan) from mikee.co.il/meeting. No account is needed, so the
 * guards are the origin check and a per-address limit. The slot is checked again here, and the unique index
 * on open slots stops two people from taking the same hour.
 */
export const POST = guarded(async (req: Request) => {
  assertSameOrigin(req);
  await limit(`meeting:${clientIp(req)}`, 5, 3600, "נשלחו כבר כמה בקשות מהכתובת הזו. נסו שוב בעוד שעה.");
  const b = await readJson(req, Body, 8 * 1024);
  const d = await db();
  const taken = (await d.select({ slot: schema.meetingRequests.slot }).from(schema.meetingRequests).where(ne(schema.meetingRequests.status, "cancelled"))).map((r) => r.slot);
  if (!isOpenSlot(b.slot, new Date(), taken)) throw new Refused("השעה הזו כבר לא פנויה. בחרו שעה אחרת.", 409);

  let id: number;
  try {
    const [row] = await d
      .insert(schema.meetingRequests)
      .values({ name: b.name, business: b.business, phone: b.phone, email: b.email, link: b.link || null, plan: b.plan, slot: b.slot, notes: b.notes || null })
      .returning({ id: schema.meetingRequests.id });
    id = row.id;
  } catch {
    throw new Refused("השעה הזו נתפסה הרגע. בחרו שעה אחרת.", 409);
  }

  // Our own inbox or Slack, from an env var; never an address the visitor gave.
  const hook = process.env.SITE_WEBHOOK_URL || process.env.SUPPORT_WEBHOOK_URL;
  if (hook) {
    const plan = b.plan === "ai_299" ? "₪299" : "₪499";
    await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `פגישת היכרות #${id}: ${slotLabel(b.slot)}\n${b.name}, ${b.business} (${plan} + ליווי)\n${b.phone} · ${b.email}${b.link ? `\n${b.link}` : ""}${b.notes ? `\n${b.notes}` : ""}`,
      }),
      signal: AbortSignal.timeout(8000),
    }).catch(() => undefined);
  }
  return Response.json({ ok: true, slot: b.slot, label: slotLabel(b.slot) });
});
