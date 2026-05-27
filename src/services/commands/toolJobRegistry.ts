/**
 * Tool-job promise registry — module-level glue between the AI tool loop
 * and the job executor.
 *
 * When `executeToolCall` (in tools.ts) queues a job for a tool call, it
 * registers a `{resolve, reject}` pair here keyed by jobId, then awaits.
 * The job executor (useJobExecutor) calls `resolveToolJob` / `rejectToolJob`
 * when the job terminates, unblocking the tool loop.
 *
 * `watchChildJob` is the same mechanism for commands that spawn child jobs.
 *
 * §3.6 of MVP_AUDIT_AND_REFACTOR_PLAN.md — extracted from tools.ts.
 */
import { registry } from "./registry";

// ── Timeouts ───────────────────────────────────────

/** 12s default — most non-child-job commands complete in <2s. Long-running
 *  ones declare `spawnsChildJobs` or `timeoutMs` on the CommandDefinition. */
const TOOL_JOB_TIMEOUT_MS = 12_000;
/** 3-minute default for commands that spawn child jobs. */
const JOB_RUNNER_TIMEOUT_MS = 180_000;

// ── Pending Tool Job Registry ──────────────────────

interface PendingToolJob {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
}

const pendingToolJobs = new Map<string, PendingToolJob>();

/**
 * Register a pending tool job. The caller awaits the returned promise; the
 * job executor calls `resolveToolJob` / `rejectToolJob` to settle it.
 */
export function registerPendingToolJob(jobId: string, pending: PendingToolJob): void {
  pendingToolJobs.set(jobId, pending);
}

/** Whether a jobId is currently being awaited by a tool call. */
export function hasPendingToolJob(jobId: string): boolean {
  return pendingToolJobs.has(jobId);
}

/** Remove a pending tool-job entry without settling it (e.g. on timeout). */
export function deletePendingToolJob(jobId: string): boolean {
  return pendingToolJobs.delete(jobId);
}

/**
 * Reset all module-level state. Pending tool-job promises that have not
 * resolved by logout/workspace-switch are rejected so awaiters unblock
 * cleanly. See §2.1 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
export function clearAll(): void {
  for (const pending of pendingToolJobs.values()) {
    try {
      pending.reject(new Error("Runtime reset (logout or workspace switch)"));
    } catch {
      // ignore — caller may have already detached
    }
  }
  pendingToolJobs.clear();
}

/**
 * Pick the tool-call wait timeout for a given command.
 *
 * Resolution order:
 *   1. Explicit `command.timeoutMs` on the definition.
 *   2. `JOB_RUNNER_TIMEOUT_MS` when the definition sets `spawnsChildJobs`.
 *   3. `TOOL_JOB_TIMEOUT_MS` otherwise.
 *
 * Falls back to the short timeout if the command id is unknown (the
 * registry only knows about installed commands, but the tool adapter
 * receives whatever the LLM tries to call).
 */
export function resolveToolTimeout(toolName: string): number {
  const def = registry.get(toolName);
  if (def?.timeoutMs != null) return def.timeoutMs;
  if (def?.spawnsChildJobs) return JOB_RUNNER_TIMEOUT_MS;
  return TOOL_JOB_TIMEOUT_MS;
}

/** Called by the job executor when a tool-initiated job completes. */
export function resolveToolJob(jobId: string, result: unknown): boolean {
  const pending = pendingToolJobs.get(jobId);
  if (pending) {
    pending.resolve(result);
    pendingToolJobs.delete(jobId);
    return true;
  }
  return false;
}

/** Called by the job executor when a tool-initiated job fails. */
export function rejectToolJob(jobId: string, error: string): boolean {
  const pending = pendingToolJobs.get(jobId);
  if (pending) {
    pending.reject(new Error(error));
    pendingToolJobs.delete(jobId);
    return true;
  }
  return false;
}

/**
 * Watch a child job spawned by a command (e.g. studio_run_job).
 * Returns a Promise that resolves when the child job completes or rejects on failure.
 * The job executor already calls resolveToolJob/rejectToolJob for every job,
 * so registering here piggy-backs on that mechanism.
 */
export function watchChildJob(childJobId: string, timeoutMs = JOB_RUNNER_TIMEOUT_MS): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    pendingToolJobs.set(childJobId, { resolve, reject });
    setTimeout(() => {
      if (pendingToolJobs.has(childJobId)) {
        pendingToolJobs.delete(childJobId);
        resolve({ _childTimeout: true, message: `Child job ${childJobId.slice(0, 12)} is still running after ${timeoutMs / 1000}s. Check the job history for results.` });
      }
    }, timeoutMs);
  });
}
