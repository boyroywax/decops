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

function jobTitle(job: Job, prevStatus?: JobStatus): string {
  if (!prevStatus) return `Job created: ${job.type}`;
  switch (job.status) {
    case "running": return `Job started: ${job.type}`;
    case "completed": return `Job completed: ${job.type}`;
    case "failed": return `Job failed: ${job.type}`;
    case "awaiting-input": return `Job awaiting input: ${job.type}`;
    case "queued": return `Job re-queued: ${job.type}`;
  }
}

/**
 * Publishes activity events for job creation and status transitions.
 * Must be mounted inside both JobsProvider and AutomationsProvider scopes.
 */
export function useJobsActivityBridge(): void {
  const { jobs } = useJobsContext();
  const prevRef = useRef<Map<string, JobStatus>>(new Map());

  useEffect(() => {
    const prev = prevRef.current;
    const next = new Map<string, JobStatus>();

    for (const job of jobs) {
      next.set(job.id, job.status);
      const prevStatus = prev.get(job.id);
      if (prevStatus === job.status) continue;

      activityBus.publish({
        source: "jobs",
        channel: jobChannel(job.status),
        kind: "jobLifecycle",
        severity: jobSeverity(job.status),
        title: jobTitle(job, prevStatus),
        message: job.result,
        jobId: job.id,
        tags: ["job", job.type, job.status],
        data: {
          id: job.id,
          type: job.type,
          status: job.status,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          completedAt: (job as { completedAt?: number }).completedAt,
        },
      });
    }

    // Jobs that disappeared between renders → publish a "removed" event.
    for (const [id, status] of prev) {
      if (next.has(id)) continue;
      activityBus.publish({
        source: "jobs",
        channel: "lifecycle.removed",
        kind: "jobLifecycle",
        severity: "debug",
        title: `Job removed (${status})`,
        jobId: id,
        tags: ["job", "removed", status],
      });
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

  useEffect(() => {
    const prev = prevRef.current;
    const next = new Map<string, RunStatus>();

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
