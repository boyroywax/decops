/**
 * jobDryRun — dry-run branch of `useJobExecutor`.
 *
 * When a queued job has `dryRun: true` the executor validates inputs and
 * step bindings without running any side effects, stores the report as an
 * artifact, and short-circuits the normal execution path. Extracted out so
 * the main hook focuses on the actual execution pipeline.
 *
 * §3.5 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
import { FlaskConical } from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import { registry } from "@/services/commands/registry";
import type { CommandContext } from "@/services/commands/types";
import type { Job, JobArtifact, NotebookEntry } from "@/types";
import type { JobDeliverable } from "@/types/jobs";

/** Subset of `useJobs` callbacks needed by the dry-run path. */
export interface DryRunSinks {
    addArtifact: (jobId: string, artifact: JobArtifact) => void;
    updateJobStatus: (jobId: string, status: "completed" | "failed", summary?: string) => void;
    addNotebookEntry: (entry: NotebookEntry | Omit<NotebookEntry, "id" | "timestamp">) => void;
}

/**
 * Execute the dry-run branch for a queued job.
 *
 * @param queuedJob          The job whose `dryRun` flag is set.
 * @param context            Per-job CommandContext from {@link buildJobContext}.
 * @param jobStorage         Mutable per-job storage (read by registry.dryRunJob).
 * @param inputMap           Resolved entity-input bindings (name → entityId).
 * @param sinks              UI / state callbacks (artifact, status, notebook).
 */
export function runJobDryRun(
    queuedJob: Job,
    context: CommandContext,
    jobStorage: Record<string, unknown>,
    inputMap: Record<string, string>,
    sinks: DryRunSinks,
): void {
    let dryRunReport;

    if (queuedJob.steps && queuedJob.steps.length > 0) {
        // Multi-step job dry-run
        const deliverableKeys = (queuedJob.deliverables || []).map((d: JobDeliverable) => d.key);
        // dryRunJob only supports serial|parallel — 'mixed' jobs use parallel scheduling.
        const dryRunMode: "serial" | "parallel" =
            queuedJob.mode === "parallel" || queuedJob.mode === "mixed" ? "parallel" : "serial";
        dryRunReport = registry.dryRunJob(
            queuedJob.steps,
            dryRunMode,
            context,
            jobStorage,
            deliverableKeys,
            inputMap,
        );
    } else {
        // Single command dry-run
        const cmdResult = registry.dryRun(queuedJob.type, queuedJob.request, context);
        dryRunReport = {
            valid: cmdResult.valid,
            mode: "single" as const,
            steps: [{
                stepId: "single",
                stepIndex: 0,
                commandId: queuedJob.type,
                conditionMet: null,
                result: cmdResult,
            }],
            unresolvedRefs: [],
            summary: cmdResult.summary,
            totalChecks: cmdResult.checks.length,
            passedChecks: cmdResult.checks.filter((c) => c.status === "pass").length,
            failedChecks: cmdResult.checks.filter((c) => c.status === "fail").length,
            warningCount: cmdResult.checks.filter((c) => c.status === "warn").length,
        };
    }

    // Store the report as an artifact
    const reportArtifact: JobArtifact = {
        id: crypto.randomUUID(),
        name: `Dry Run Report: ${queuedJob.type}`,
        type: "json" as const,
        content: JSON.stringify(dryRunReport, null, 2),
        tags: ["type:json", "source:dry-run", `job:${queuedJob.type}`],
        createdAt: Date.now(),
        source: "job" as const,
    };
    sinks.addArtifact(queuedJob.id, reportArtifact);

    const status = dryRunReport.valid ? "completed" : "failed";
    const resultSummary = `[DRY RUN] ${dryRunReport.summary}`;
    sinks.updateJobStatus(queuedJob.id, status, resultSummary);

    sinks.addNotebookEntry({
        category: dryRunReport.valid ? "output" : "system",
        icon: <GradientIcon icon={FlaskConical} size={16} gradient={dryRunReport.valid ? ["#818cf8", "#6366f1"] : ["#ef4444", "#dc2626"]} />,
        title: `Dry Run ${dryRunReport.valid ? "Passed" : "Failed"}: ${queuedJob.type}`,
        description: resultSummary,
        details: {
            jobId: queuedJob.id,
            command: queuedJob.type,
            passed: dryRunReport.passedChecks,
            failed: dryRunReport.failedChecks,
            warnings: dryRunReport.warningCount,
        },
        tags: ["job", "dry-run", queuedJob.type],
    });
}
