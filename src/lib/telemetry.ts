import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Everything one task (a job) does, counted where it happens: model calls, Meta requests, cost and time.
 * The scope also holds the task's limits and a short-lived memo of identical Meta reads, so the same GET
 * within one preparation task is answered once.
 */
export type TaskScope = {
  jobId?: string;
  /** Credits set aside for this task (src/lib/credits.ts); its charges count against them. */
  holdId?: string;
  kind?: string;
  startedAt: number;
  modelCalls: number;
  costUsd: number;
  metaGets: number;
  metaPosts: number;
  metaMemoHits: number;
  /** Identical GETs within the task are served from here; any write clears it. Off for executions. */
  memo?: Map<string, Promise<unknown>>;
  /** Set when another worker took over the job: stop before the next model call or Meta write. */
  leaseLost?: boolean;
  maxMs: number;
  maxUsd: number;
};

const store = new AsyncLocalStorage<TaskScope>();

export function currentTask(): TaskScope | undefined {
  return store.getStore();
}

export function newTask(opts: { jobId?: string; kind?: string; memo?: boolean }): TaskScope {
  return {
    jobId: opts.jobId,
    kind: opts.kind,
    startedAt: Date.now(),
    modelCalls: 0,
    costUsd: 0,
    metaGets: 0,
    metaPosts: 0,
    metaMemoHits: 0,
    memo: opts.memo ? new Map() : undefined,
    maxMs: Number(process.env.MIKEE_TASK_MAX_MS ?? 10 * 60_000),
    maxUsd: Number(process.env.MIKEE_TASK_MAX_USD ?? 2),
  };
}

export function runInTask<T>(scope: TaskScope, fn: () => Promise<T>): Promise<T> {
  return store.run(scope, fn);
}

export class TaskLimit extends Error {}

/** Called before each model call: a task that ran too long, cost too much, or lost its lease stops here. */
export function assertTaskWithinLimits() {
  const t = currentTask();
  if (!t) return;
  if (t.leaseLost) throw new TaskLimit("Another worker took over this task; this copy stops.");
  if (Date.now() - t.startedAt > t.maxMs) throw new TaskLimit(`The task ran longer than ${Math.round(t.maxMs / 60000)} minutes and was stopped.`);
  if (t.costUsd > t.maxUsd) throw new TaskLimit(`The task's AI cost passed $${t.maxUsd} and it was stopped.`);
}

export function taskMetrics(t: TaskScope) {
  return {
    modelCalls: t.modelCalls,
    costUsd: Math.round(t.costUsd * 1e6) / 1e6,
    metaGets: t.metaGets,
    metaPosts: t.metaPosts,
    metaMemoHits: t.metaMemoHits,
    ms: Date.now() - t.startedAt,
  };
}
