import "server-only";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { db, schema } from "./db";

export type JobKind = "turn" | "execute" | "checkin" | "describe" | "igreply";
export type Job = typeof schema.jobs.$inferSelect;

/** A running job that has not sent a heartbeat for this long is considered dead and is picked up again. */
export const STALE_AFTER_MS = 90_000;
export const MAX_ATTEMPTS = 3;

export class TurnInProgress extends Error {
  constructor(public jobId: string) {
    super("Mikee is already working on something");
  }
}

export const MAX_PARALLEL_TURNS = 4;
export class TooBusy extends Error {
  constructor() {
    super("מייקי עובד כרגע על כמה דברים במקביל. אפשר לשלוח שוב בעוד רגע.");
  }
}

/** A business can have a few conversations working at once, not an unbounded number. */
export async function assertCapacity(workspaceId: string) {
  const d = await db();
  const [{ n }] = await d
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.workspaceId, workspaceId), inArray(schema.jobs.kind, ["turn", "checkin"]), inArray(schema.jobs.status, ["queued", "running"])));
  if (n >= MAX_PARALLEL_TURNS) throw new TooBusy();
}

export async function enqueue(workspaceId: string, kind: JobKind, input: Record<string, unknown> = {}) {
  const d = await db();
  if (kind === "turn" || kind === "checkin") {
    // One turn at a time per conversation, so two turns never write to the same conversation together.
    // Different conversations run in parallel; only one scheduled check-in runs per business.
    const active = kind === "checkin" ? await activeCheckin(workspaceId) : await activeTurn(workspaceId, String(input.conversationId));
    if (active) throw new TurnInProgress(active.id);
    await assertCapacity(workspaceId);
  }
  const [job] = await d.insert(schema.jobs).values({ workspaceId, kind, input }).returning();
  return job;
}

export async function activeTurn(workspaceId: string, conversationId: string): Promise<Job | undefined> {
  const d = await db();
  return d.query.jobs.findFirst({
    where: and(
      eq(schema.jobs.workspaceId, workspaceId),
      inArray(schema.jobs.kind, ["turn", "checkin"]),
      inArray(schema.jobs.status, ["queued", "running"]),
      sql`${schema.jobs.input}->>'conversationId' = ${conversationId}`,
    ),
    orderBy: asc(schema.jobs.createdAt),
  });
}

async function activeCheckin(workspaceId: string): Promise<Job | undefined> {
  const d = await db();
  return d.query.jobs.findFirst({
    where: and(eq(schema.jobs.workspaceId, workspaceId), eq(schema.jobs.kind, "checkin"), inArray(schema.jobs.status, ["queued", "running"])),
  });
}

/**
 * Atomically claims the oldest runnable job: queued, or running with a stale heartbeat (its worker died
 * in a restart or deploy). Safe with several workers: the row lock means each job goes to one worker.
 */
export async function claimNext(kinds?: JobKind[]): Promise<Job | null> {
  const d = await db();
  const kindFilter = kinds?.length ? sql`AND kind IN (${sql.join(kinds.map((k) => sql`${k}`), sql`, `)})` : sql``;
  const res = await d.execute(sql`
    UPDATE jobs SET status = 'running', heartbeat_at = now(), attempts = attempts + 1, lease = gen_random_uuid()::text
    WHERE id = (
      SELECT id FROM jobs
      WHERE ((status IN ('queued', 'waiting') AND not_before <= now()) OR (status = 'running' AND heartbeat_at < now() - make_interval(secs => ${STALE_AFTER_MS / 1000})))
      ${kindFilter}
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`);
  const rows = ((res as any).rows ?? res) as { id: string }[];
  if (!rows.length) return null;
  return (await d.query.jobs.findFirst({ where: eq(schema.jobs.id, rows[0].id) })) ?? null;
}

/**
 * Keeps the job ours. The heartbeat runs on a timer, so a single slow call (a Meta request may take up to
 * 90 s) does not stop it. If another worker reclaimed the job (its lease changed), this returns false and
 * the caller stops before its next model call or Meta write.
 */
export async function heartbeat(jobId: string, lease?: string | null): Promise<boolean> {
  const d = await db();
  const rows = await d
    .update(schema.jobs)
    .set({ heartbeatAt: new Date() })
    .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.status, "running"), lease ? eq(schema.jobs.lease, lease) : sql`true`))
    .returning({ id: schema.jobs.id });
  return rows.length > 0;
}

export async function saveState(jobId: string, state: Record<string, unknown>) {
  const d = await db();
  await d.update(schema.jobs).set({ state, heartbeatAt: new Date() }).where(eq(schema.jobs.id, jobId));
}

export async function finishJob(jobId: string, status: "done" | "failed", error?: string, metrics?: Record<string, unknown>) {
  const d = await db();
  await d
    .update(schema.jobs)
    .set({ status, error: error ?? null, finishedAt: new Date(), ...(metrics ? { metrics } : {}) })
    .where(eq(schema.jobs.id, jobId));
}

export async function pushEvent(jobId: string, event: Record<string, unknown>) {
  const d = await db();
  await d.insert(schema.jobEvents).values({ jobId, event });
}

/** Events after a cursor, for clients that poll (and can reconnect at any time without losing anything). */
export async function eventsSince(jobId: string, after = 0) {
  const d = await db();
  return d
    .select({ id: schema.jobEvents.id, event: schema.jobEvents.event })
    .from(schema.jobEvents)
    .where(and(eq(schema.jobEvents.jobId, jobId), gt(schema.jobEvents.id, after)))
    .orderBy(asc(schema.jobEvents.id))
    .limit(500);
}

export async function getJob(workspaceId: string, jobId: string) {
  const d = await db();
  return d.query.jobs.findFirst({ where: and(eq(schema.jobs.id, jobId), eq(schema.jobs.workspaceId, workspaceId)) });
}

/** Defer a job claimed under clock skew; never mark its future action as completed. */
export async function deferJob(job: Job, until: Date) {
  const d = await db();
  await d.update(schema.jobs).set({ status: "waiting", notBefore: new Date(until.getTime() + 1000), heartbeatAt: null })
    .where(and(eq(schema.jobs.id, job.id), eq(schema.jobs.status, "running"), job.lease ? eq(schema.jobs.lease, job.lease) : sql`true`));
}
