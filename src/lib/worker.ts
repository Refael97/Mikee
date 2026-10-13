import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { type AgentEvent, type Row, runMikee } from "./agent/run";
import { CHECKIN_KICKOFF, SCAN_KICKOFF } from "./agent/prompt";
import { executeProposal } from "./executor";
import { claimNext, finishJob, heartbeat, type Job, MAX_ATTEMPTS, pushEvent, saveState } from "./jobs";

/** Runs one job to completion. Exported for tests; the worker loop below calls it. */
export async function runJob(job: Job) {
  const beat = setInterval(() => void heartbeat(job.id).catch(() => undefined), 20_000);
  try {
    if (job.attempts > MAX_ATTEMPTS) {
      await pushEvent(job.id, { t: "error", message: "המשימה נכשלה כמה פעמים ונעצרה." });
      await pushEvent(job.id, { t: "done" });
      await finishJob(job.id, "failed", "too many attempts");
      return;
    }
    if (job.kind === "execute") {
      await executeProposal(String(job.input.proposalId), { cleanup: !!job.input.cleanup });
    } else {
      const kickoff = job.kind === "checkin" ? CHECKIN_KICKOFF : job.input.kickoff === "scan" ? SCAN_KICKOFF : null;
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
      await runMikee({
        workspaceId: job.workspaceId,
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
        discardIf: job.kind === "checkin" ? (t) => t.trim() === "NOTHING" : undefined,
      });
    }
    await finishJob(job.id, "done");
  } catch (e) {
    console.error("[worker] job failed", job.id, e);
    await pushEvent(job.id, { t: "error", message: "משהו השתבש. נסי שוב בעוד רגע." }).catch(() => undefined);
    await pushEvent(job.id, { t: "done" }).catch(() => undefined);
    await finishJob(job.id, "failed", (e as Error).message);
  } finally {
    clearInterval(beat);
  }
}

const g = globalThis as unknown as { mikeeWorker?: boolean };

/** In-process worker for the Railway server. Several instances are safe: claiming is atomic. */
export function startWorker(concurrency = 3) {
  if (g.mikeeWorker) return;
  g.mikeeWorker = true;
  for (let i = 0; i < concurrency; i++) {
    void (async function loop() {
      for (;;) {
        try {
          const job = await claimNext();
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

/** Marks a workspace stage; used when the client finishes onboarding. */
export async function setStage(workspaceId: string, stage: string) {
  const d = await db();
  await d.update(schema.workspaces).set({ stage }).where(eq(schema.workspaces.id, workspaceId));
}
