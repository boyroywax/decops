/**
 * Bridges that adapt the existing jobs + automations stores into
 * publishers on the activity bus. Mount these hooks once in
 * AuthenticatedApp; they emit lifecycle events whenever the underlying
 * state changes.
 *
 * Bridges are diff-based: they keep a ref of the previous snapshot and
 * publish exactly the deltas, so we don't spam the bus on unrelated
 * re-renders.
 */
import { useEffect, useRef } from "react";
import { useJobsContext } from "@/context/JobsContext";
import { useAutomations } from "@/context/AutomationsContext";
import { activityBus } from "./bus";
import type { ActivitySeverity } from "./types";
import type { Job, JobStatus } from "@/types";

// ─── Jobs ───────────────────────────────────────────────────────────────

function jobSeverity(status: JobStatus): ActivitySeverity {
  if (status === "failed") return "error";
  if (status === "awaiting-input") return "warn";
  return "info";
}

function jobChannel(status: JobStatus): string {
  return `lifecycle.${status}`;
}

function jobTitle(job: Job): string {
  switch (job.status) {
    case "completed": return `Job completed: ${job.type}`;
    case "failed": return `Job failed: ${job.type}`;
    case "awaiting-input": return `Job awaiting input: ${job.type}`;
    case "running": return `Job running: ${job.type}`;
    case "queued": return `Job queued: ${job.type}`;
  }
}

interface JobStageRecord {
  status: JobStatus;
  at: number;
  result?: string;
}

/**
 * Publishes a single activity envelope per job, updated in place as the
 * job transitions through statuses. The envelope's id is `job:<jobId>`,
 * its timestamp tracks the latest transition (so completed jobs sort to
 * the most recent slot), and `data.stages` retains the per-stage history
 * (queued → running → completed/failed/awaiting-input).
 *
 * Must be mounted inside both JobsProvider and AutomationsProvider scopes.
 */
export function useJobsActivityBridge(): void {
  const { jobs } = useJobsContext();
  const prevRef = useRef<Map<string, JobStatus>>(new Map());
  const historyRef = useRef<Map<string, JobStageRecord[]>>(new Map());
  const initializedRef = useRef(false);

  useEffect(() => {
    const prev = prevRef.current;
    const next = new Map<string, JobStatus>();

    // On first mount, snapshot the rehydrated jobs from persistence
    // WITHOUT publishing. Otherwise every job loaded from localStorage
    // looks like a brand-new state transition and floods the bus with
    // bogus "Job created/started/completed" events on every refresh.
    // We still seed history with a terminal snapshot so an in-place
    // update after rehydration carries the prior stage context.
    if (!initializedRef.current) {
      for (const job of jobs) {
        next.set(job.id, job.status);
        historyRef.current.set(job.id, [{
          status: job.status,
          at: job.updatedAt ?? job.createdAt ?? Date.now(),
          result: job.result,
        }]);
      }
      prevRef.current = next;
      initializedRef.current = true;
      return;
    }

    for (const job of jobs) {
      next.set(job.id, job.status);
      const prevStatus = prev.get(job.id);
      if (prevStatus === job.status) continue;

      // Append a stage record for this transition.
      const stages = historyRef.current.get(job.id) ?? [];
      stages.push({
        status: job.status,
        at: job.updatedAt ?? Date.now(),
        result: job.result,
      });
      historyRef.current.set(job.id, stages);

      const isTerminal = job.status === "completed" || job.status === "failed";

      activityBus.publish({
        // Stable id collapses every transition for this job into one row.
        id: `job:${job.id}`,
        source: "jobs",
        channel: jobChannel(job.status),
        kind: "jobLifecycle",
        severity: jobSeverity(job.status),
        title: jobTitle(job),
        // Surface the result on terminal events; otherwise leave the
        // message empty (in-progress rows shouldn't claim a result).
        message: isTerminal ? job.result : undefined,
        jobId: job.id,
        // Stamp with the latest transition time so rows order by the
        // datetime of completion (or last activity for in-flight jobs).
        timestamp: job.updatedAt ?? Date.now(),
        tags: ["job", job.type, job.status],
        data: {
          id: job.id,
          type: job.type,
          status: job.status,
          createdAt: job.createdAt,
          startedAt: (job as { startedAt?: number }).startedAt,
          updatedAt: job.updatedAt,
          completedAt: (job as { completedAt?: number }).completedAt,
          result: isTerminal ? job.result : undefined,
          stages,
        },
      });
    }

    // Jobs that disappeared between renders → drop their envelope from
    // the feed. Removal is a store operation, not a lifecycle event, so
    // we don't emit a new envelope (which would clobber the terminal
    // completed/failed row with a debug "removed" entry).
    for (const [id] of prev) {
      if (next.has(id)) continue;
      activityBus.remove(`job:${id}`);
      historyRef.current.delete(id);
    }

    prevRef.current = next;
  }, [jobs]);
}

// ─── Automations ────────────────────────────────────────────────────────

type RunStatus = "running" | "completed" | "failed";

function runSeverity(status: RunStatus): ActivitySeverity {
  if (status === "failed") return "error";
  return "info";
}

/**
 * Publishes activity events for automation run creation + status
 * transitions. Mount inside AutomationsProvider.
 */
export function useAutomationsActivityBridge(): void {
  const { runs, automations } = useAutomations();
  const prevRef = useRef<Map<string, RunStatus>>(new Map());
  const initializedRef = useRef(false);

  useEffect(() => {
    const prev = prevRef.current;
    const next = new Map<string, RunStatus>();

    // First mount: snapshot rehydrated runs without re-publishing.
    if (!initializedRef.current) {
      for (const run of runs) next.set(run.id, run.status);
      prevRef.current = next;
      initializedRef.current = true;
      return;
    }

    for (const run of runs) {
      next.set(run.id, run.status);
      if (prev.get(run.id) === run.status) continue;

      const def = automations.find((a) => a.id === run.automationId);
      const name = def?.name ?? run.automationId;
      const title =
        run.status === "running" ? `Automation started: ${name}` :
        run.status === "completed" ? `Automation completed: ${name}` :
        `Automation failed: ${name}`;

      activityBus.publish({
        source: "automations",
        channel: `run.${run.status}`,
        kind: "automation",
        severity: runSeverity(run.status),
        title,
        message: run.error,
        automationRunId: run.id,
        tags: ["automation", run.automationId, run.status],
        data: {
          runId: run.id,
          automationId: run.automationId,
          startTime: run.startTime,
          endTime: run.endTime,
          status: run.status,
        },
      });
    }

    prevRef.current = next;
  }, [runs, automations]);
}
