import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { type AgentEvent, type Row, runMikee } from "./agent/run";
import { CHECKIN_KICKOFF, OUTCOME_KICKOFF, SCAN_KICKOFF } from "./agent/prompt";
import { deleteIfEmpty, markUnread } from "./conversations";
import { executeProposal } from "./executor";
import { describeMedia } from "./library";
import { handleInstagramMessage } from "./instagram/autoreply";
import { ensureTitle } from "./titles";
import { claimNext, finishJob, heartbeat, type Job, type JobKind, MAX_ATTEMPTS, pushEvent, saveState } from "./jobs";
import { newTask, runInTask, TaskLimit, type TaskScope, taskMetrics } from "./telemetry";
import { CREDIT_CONFIG, NOT_ENOUGH, release, reserve } from "./credits";

/** Runs one job to completion. Exported for tests; the worker loop below calls it. */
export async function runJob(job: Job) {
  // Preparation tasks reuse identical Meta reads within the task; executions always read fresh.
  const task = newTask({ jobId: job.id, kind: job.kind, memo: job.kind !== "execute" });
  return runInTask(task, () => runJobIn(job, task));
}

async function runJobIn(job: Job, task: TaskScope) {
  const beat = setInterval(
    () =>
      void heartbeat(job.id, job.lease)
        .then((ok) => {
          if (!ok) task.leaseLost = true;
        })
        .catch(() => undefined),
    20_000,
  );
  try {
    if (job.attempts > MAX_ATTEMPTS) {
      await pushEvent(job.id, { t: "error", message: "המשימה נכשלה כמה פעמים ונעצרה." });
      await pushEvent(job.id, { t: "done" });
      await finishJob(job.id, "failed", "too many attempts");
      return;
    }
    if (job.kind === "execute") {
      await executeProposal(String(job.input.proposalId), { cleanup: !!job.input.cleanup });
    } else if (job.kind === "igreply") {
      await handleInstagramMessage(String(job.input.messageId));
    } else if (job.kind === "describe") {
      const d = await db();
      const ws = await d.query.workspaces.findFirst({ where: eq(schema.workspaces.id, job.workspaceId) });
      await describeMedia(job.workspaceId, ws?.timezone ?? "Asia/Jerusalem", String(job.input.mediaId));
    } else {
      const kickoff =
        job.kind === "checkin"
          ? typeof job.input.kickoff === "string"
            ? job.input.kickoff
            : CHECKIN_KICKOFF
          : job.input.kickoff === "scan"
            ? SCAN_KICKOFF
            : job.input.kickoff === "outcome"
              ? OUTCOME_KICKOFF
              : null;
      const prepend: Row[] = kickoff ? [{ role: "user", kind: "kickoff", content: [{ type: "text", text: kickoff }] }] : [];
      // Text arrives token by token; store it in small batches so polling clients see it flow.
      let buffer = "";
      let last = Date.now();
      const flush = async () => {
        if (!buffer) return;
        const v = buffer;
        buffer = "";
        last = Date.now();
        await pushEvent(job.id, { t: "text", v });
      };
      const conversationId = String(job.input.conversationId);
      const silent = (t: string) => !t.trim() || t.trim() === "NOTHING";
      const discard = job.kind === "checkin" && job.input.mayStaySilent !== false ? silent : undefined;
      // The turn's credits are set aside first, so turns running at the same time cannot pass the quota.
      const tz = (await (await db()).query.workspaces.findFirst({ where: eq(schema.workspaces.id, job.workspaceId) }))?.timezone ?? "Asia/Jerusalem";
      const hold = await reserve(job.workspaceId, tz, `job:${job.id}`, CREDIT_CONFIG.turnHold(), { min: 1 });
      if (!hold) {
        // A check-in Mikee starts on his own just waits; a request from the client gets the plain answer.
        if (job.kind !== "checkin") await pushEvent(job.id, { t: "error", message: NOT_ENOUGH });
        await pushEvent(job.id, { t: "done" });
        if (job.kind === "checkin") await deleteIfEmpty(conversationId);
        await finishJob(job.id, "done", "quota used up", taskMetrics(task));
        return;
      }
      task.holdId = hold.id;
      const written = await runMikee({
        workspaceId: job.workspaceId,
        conversationId,
        prepend,
        resume: (job.state.pending as Row[] | undefined) ?? undefined,
        saveState: (pending) => saveState(job.id, { pending }),
        emit: async (e: AgentEvent) => {
          if (e.t === "text") {
            buffer += e.v;
            if (Date.now() - last > 400) await flush();
            return;
          }
          await flush();
          await pushEvent(job.id, e);
        },
        discardIf: discard,
      }).finally(() => release(hold.id));
      if (job.kind === "turn") {
        const ws = await (await db()).query.workspaces.findFirst({ where: eq(schema.workspaces.id, job.workspaceId) });
        await ensureTitle(job.workspaceId, conversationId, ws?.timezone ?? "Asia/Jerusalem").catch((e) => console.warn("[titles]", (e as Error).message));
      }
      if (job.kind === "checkin") {
        if (silent(written) && discard) {
          // Nothing worth saying: no empty conversation is left behind, and it does not count toward the daily limit.
          await deleteIfEmpty(conversationId);
          if (job.input.nudgeId) await markNudgeSilent(Number(job.input.nudgeId));
        } else {
          // Mikee wrote on his own: the conversation waits for the client, marked as new.
          await markUnread(conversationId);
        }
      }
    }
    if (!task.leaseLost) await finishJob(job.id, "done", undefined, taskMetrics(task));
  } catch (e) {
    console.error("[worker] job failed", job.id, e);
    // A copy that lost its lease leaves the job to the worker that now holds it.
    if (task.leaseLost) return;
    await pushEvent(job.id, { t: "error", message: e instanceof TaskLimit ? `עצרתי את המשימה: ${e.message}` : "משהו השתבש. נסי שוב בעוד רגע." }).catch(() => undefined);
    await pushEvent(job.id, { t: "done" }).catch(() => undefined);
    await finishJob(job.id, "failed", (e as Error).message, taskMetrics(task));
  } finally {
    clearInterval(beat);
  }
}

const g = globalThis as unknown as { mikeeWorker?: boolean };

/** In-process worker for the Railway server. Several instances are safe: claiming is atomic. */
export function startWorker(concurrency = 3) {
  if (g.mikeeWorker) return;
  g.mikeeWorker = true;
  // One lane only for Instagram messages, so a customer is answered at once even while long turns run.
  const lanes: (JobKind[] | undefined)[] = [...Array.from({ length: concurrency }, () => undefined), ["igreply"]];
  for (const kinds of lanes) {
    void (async function loop() {
      for (;;) {
        try {
          const job = await claimNext(kinds);
          if (job) await runJob(job);
          else await new Promise((r) => setTimeout(r, 1000));
        } catch (e) {
          console.error("[worker] loop error", e);
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
    })();
  }
}

async function markNudgeSilent(id: number) {
  const d = await db();
  await d.update(schema.nudges).set({ day: "-" }).where(eq(schema.nudges.id, id));
}

/** Marks a workspace stage; used when the client finishes onboarding. */
export async function setStage(workspaceId: string, stage: string) {
  const d = await db();
  await d.update(schema.workspaces).set({ stage }).where(eq(schema.workspaces.id, workspaceId));
}
