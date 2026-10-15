import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { GET } from "@/app/api/jobs/[id]/route";
import { db, schema } from "@/lib/db";
import { enqueue, pushEvent } from "@/lib/jobs";
import { createBusiness } from "./support/setup";

async function signIn(ws: string) {
  const auth = await import("@/lib/auth");
  const d = await db();
  const w = await d.query.workspaces.findFirst({ where: eq(schema.workspaces.id, ws) });
  return vi.spyOn(auth, "getSession").mockResolvedValue({ user: { id: "00000000-0000-0000-0000-000000000001", email: "o@x.co", name: "O" }, workspace: w } as any);
}
const poll = async (id: string, after: unknown) => (await GET(new Request(`https://mikee.test/api/jobs/${id}?after=${after}`), { params: Promise.resolve({ id }) })).json();

describe("following a job", () => {
  it("a card event keeps its own id, and the cursor stays a number, so the 'done' that comes later is seen", async () => {
    const ws = await createBusiness();
    const spy = await signIn(ws);
    const job = await enqueue(ws, "execute", { proposalId: "x" });
    const card = "6d8c0f8e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
    await pushEvent(job.id, { t: "text", v: "מכין" });
    await pushEvent(job.id, { t: "proposal", id: card });
    // The screen polls here: it has the card, not yet the end.
    const first = await poll(job.id, 0);
    expect(first.events.map((e: any) => e.t)).toEqual(["text", "proposal"]);
    expect(first.events[1].id).toBe(card); // the card's id, for loading the card
    const cursor = first.events[1].seq;
    expect(Number.isSafeInteger(cursor)).toBe(true); // the position, never the card's id
    await pushEvent(job.id, { t: "done" });
    const next = await poll(job.id, cursor);
    expect(next.events.map((e: any) => e.t)).toEqual(["done"]);
    // A cursor that is not a number (an old screen) is read as the start, never an error.
    expect((await poll(job.id, card)).events).toHaveLength(3);
    spy.mockRestore();
  });
});
