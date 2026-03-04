/**
 * JobProgressCard — Inline chat component that renders live job execution
 * progress. Subscribes to JobsContext and auto-updates as steps complete.
 *
 * Shows: job name, mode badge, step-by-step status with mini timeline,
 * live storage keys, deliverable status, and final result.
 */

import { useMemo } from "react";
import {
    CheckCircle, XCircle, Loader, Clock, SkipForward,
    Database, Package, Layers, ChevronRight, AlertTriangle,
} from "lucide-react";
import { useJobsContext } from "@/context/JobsContext";
import type { Job, JobStep } from "@/types";
import "../../styles/components/job-progress-card.css";

// ── Step status micro-icon ──

function StepStatusIcon({ status }: { status: string }) {
    switch (status) {
        case "completed":
            return <CheckCircle size={12} className="jpc-step-icon jpc-step-icon--done" />;
        case "running":
            return <Loader size={12} className="jpc-step-icon jpc-step-icon--running" />;
        case "failed":
            return <XCircle size={12} className="jpc-step-icon jpc-step-icon--failed" />;
        case "skipped":
            return <SkipForward size={12} className="jpc-step-icon jpc-step-icon--skipped" />;
        default:
            return <Clock size={12} className="jpc-step-icon jpc-step-icon--pending" />;
    }
}

// ── Mode badge ──

function ModeBadge({ mode }: { mode?: string }) {
    if (!mode || mode === "serial") return null;
    return (
        <span className={`jpc-mode-badge jpc-mode-badge--${mode}`}>
            {mode}
        </span>
    );
}

// ── Progress bar ──

function ProgressBar({ completed, total, failed }: { completed: number; total: number; failed: number }) {
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const hasFailed = failed > 0;
    return (
        <div className="jpc-progress">
            <div className="jpc-progress__bar">
                <div
                    className={`jpc-progress__fill ${hasFailed ? "jpc-progress__fill--error" : ""}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="jpc-progress__label">
                {completed}/{total}
                {hasFailed ? ` (${failed} failed)` : ""}
            </span>
        </div>
    );
}

// ── Step row ──

function StepRow({ step, index }: { step: JobStep; index: number }) {
    const displayName = step.name || step.commandId;
    const isActive = step.status === "running";

    return (
        <div className={`jpc-step ${isActive ? "jpc-step--active" : ""} jpc-step--${step.status || "pending"}`}>
            <StepStatusIcon status={step.status || "pending"} />
            <span className="jpc-step__index">{index + 1}.</span>
            <span className="jpc-step__name">{displayName}</span>
            {step.status === "completed" && step.result && (
                <span className="jpc-step__result" title={step.result}>
                    <ChevronRight size={9} />
                    {step.result.length > 60 ? step.result.slice(0, 60) + "…" : step.result}
                </span>
            )}
            {step.status === "failed" && step.result && (
                <span className="jpc-step__error" title={step.result}>
                    <AlertTriangle size={9} />
                    {step.result.length > 60 ? step.result.slice(0, 60) + "…" : step.result}
                </span>
            )}
        </div>
    );
}

// ── Storage snapshot ──

function StorageSnapshot({ storage }: { storage: Record<string, any> }) {
    const entries = Object.entries(storage).filter(([k]) => !k.startsWith("__deliverable_"));
    if (entries.length === 0) return null;

    return (
        <div className="jpc-storage">
            <div className="jpc-storage__label">
                <Database size={10} /> Storage ({entries.length})
            </div>
            <div className="jpc-storage__entries">
                {entries.slice(0, 6).map(([key, val]) => (
                    <div key={key} className="jpc-storage__entry">
                        <span className="jpc-storage__key">{key}</span>
                        <span className="jpc-storage__value">
                            {typeof val === "string"
                                ? (val.length > 40 ? val.slice(0, 40) + "…" : val)
                                : JSON.stringify(val).slice(0, 40)}
                        </span>
                    </div>
                ))}
                {entries.length > 6 && (
                    <div className="jpc-storage__more">+{entries.length - 6} more</div>
                )}
            </div>
        </div>
    );
}

// ── Deliverables status ──

function DeliverablesStatus({ deliverables, storage }: { deliverables: any[]; storage: Record<string, any> }) {
    if (!deliverables || deliverables.length === 0) return null;

    return (
        <div className="jpc-deliverables">
            <div className="jpc-deliverables__label">
                <Package size={10} /> Deliverables
            </div>
            <div className="jpc-deliverables__list">
                {deliverables.map(d => {
                    const populated = !!storage[`__deliverable_${d.key}`];
                    return (
                        <span
                            key={d.key}
                            className={`jpc-deliverable ${populated ? "jpc-deliverable--ready" : "jpc-deliverable--pending"}`}
                        >
                            {populated ? <CheckCircle size={9} /> : <Clock size={9} />}
                            {d.label || d.key}
                        </span>
                    );
                })}
            </div>
        </div>
    );
}

// ── Main component ──

interface JobProgressCardProps {
    jobId: string;
}

export function JobProgressCard({ jobId }: JobProgressCardProps) {
    const { jobs } = useJobsContext();
    const job: Job | undefined = useMemo(
        () => jobs.find((j: Job) => j.id === jobId),
        [jobs, jobId],
    );

    if (!job) {
        return (
            <div className="jpc jpc--not-found">
                <Clock size={12} /> Job pending…
            </div>
        );
    }

    const steps = job.steps || [];
    const completed = steps.filter(s => s.status === "completed" || s.status === "skipped").length;
    const failed = steps.filter(s => s.status === "failed").length;
    const total = steps.length;
    const isRunning = job.status === "running";
    const isDone = job.status === "completed";
    const isFailed = job.status === "failed";
    const isQueued = job.status === "queued";
    const storage = job.storage || {};
    const deliverables = job.deliverables || [];

    return (
        <div className={`jpc jpc--${job.status}`}>
            {/* Header */}
            <div className="jpc__header">
                <div className="jpc__title-row">
                    <Layers size={12} className="jpc__icon" />
                    <span className="jpc__name">{job.type}</span>
                    <ModeBadge mode={job.mode} />
                    <span className={`jpc__status jpc__status--${job.status}`}>
                        {isQueued && "queued"}
                        {isRunning && "running"}
                        {isDone && "completed"}
                        {isFailed && "failed"}
                    </span>
                </div>
                {total > 0 && (
                    <ProgressBar completed={completed} total={total} failed={failed} />
                )}
            </div>

            {/* Steps timeline */}
            {steps.length > 0 && (
                <div className="jpc__steps">
                    {steps.map((s, i) => (
                        <StepRow key={s.id || i} step={s} index={i} />
                    ))}
                </div>
            )}

            {/* Storage snapshot (only while running or done) */}
            {(isRunning || isDone) && <StorageSnapshot storage={storage} />}

            {/* Deliverables (only while running or done) */}
            {(isRunning || isDone) && <DeliverablesStatus deliverables={deliverables} storage={storage} />}

            {/* Final result */}
            {isDone && job.result && (
                <div className="jpc__result">
                    <CheckCircle size={11} />
                    <span>{job.result.length > 120 ? job.result.slice(0, 120) + "…" : job.result}</span>
                </div>
            )}
            {isFailed && job.result && (
                <div className="jpc__error">
                    <XCircle size={11} />
                    <span>{job.result.length > 120 ? job.result.slice(0, 120) + "…" : job.result}</span>
                </div>
            )}
        </div>
    );
}
