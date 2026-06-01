/**
 * JobProgressCard — Inline chat component that renders live job execution
 * progress. Subscribes to JobsContext and auto-updates as steps complete.
 *
 * Shows: job name, mode badge, step-by-step status with mini timeline,
 * live storage keys, deliverable status, and final result.
 */

import { useEffect, useMemo, useState } from "react";
import {
    CheckCircle, XCircle, Loader, Clock, SkipForward,
    Database, Package, Layers, ChevronRight, AlertTriangle, Keyboard, Wrench, FileText,
} from "lucide-react";
import { useJobsContext } from "@/context/JobsContext";
import type { Job, JobStep } from "@/types";
import type { ToolCallDisplay } from "@/services/ai";
import "../../styles/components/job-progress-card.css";

function extractArtifactIds(result: any): string[] {
    if (!result || typeof result !== "object") return [];
    if (Array.isArray(result.artifactIds)) return result.artifactIds;
    if (result.result && Array.isArray(result.result.artifactIds)) return result.result.artifactIds;
    if (result.jobResult && Array.isArray(result.jobResult.artifactIds)) return result.jobResult.artifactIds;
    return [];
}

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

function prettyJson(value: unknown): string {
    if (value === undefined) return "";
    if (typeof value === "string") return value;
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

function CompletionDetailsView({ resultDetails }: { resultDetails?: Job["resultDetails"] }) {
    if (!resultDetails) return null;
    return (
        <div className="jpc__result-details">
            <div className="jpc__result-details-title">Execution Results</div>
            <div className="jpc__result-details-summary">{resultDetails.summary}</div>
            <div className="jpc__result-details-steps">
                {resultDetails.steps.map((step) => (
                    <div key={step.id} className="jpc__result-step">
                        <div className="jpc__result-step-head">
                            <span className="jpc__result-step-command">{step.commandId}</span>
                            <span className={`jpc__result-step-status jpc__result-step-status--${step.status}`}>{step.status}</span>
                        </div>
                        {step.input && Object.keys(step.input).length > 0 && (
                            <pre className="jpc__result-step-block">INPUT: {prettyJson(step.input)}</pre>
                        )}
                        {step.result !== undefined && (
                            <pre className="jpc__result-step-block">RESULT: {prettyJson(step.result)}</pre>
                        )}
                        {step.error && (
                            <pre className="jpc__result-step-block jpc__result-step-block--error">ERROR: {step.error}</pre>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

function getPendingRepliesCount(job: Job): number {
    const steps = job.resultDetails?.steps;
    if (!steps || steps.length === 0) return 0;

    let pending = 0;
    for (const step of steps) {
        if (step.commandId !== "send_message" && step.commandId !== "broadcast_message") continue;
        if (!step.result || typeof step.result !== "object") continue;

        const result = step.result as Record<string, unknown>;
        if (result.status !== "queued") continue;

        if (step.commandId === "broadcast_message") {
            const count = typeof result.count === "number" && Number.isFinite(result.count) ? Math.max(1, Math.floor(result.count)) : 1;
            pending += count;
        } else {
            pending += 1;
        }
    }

    return pending;
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
                {pct}% ({completed}/{total})
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

function ToolCallRow({ toolCall }: { toolCall: ToolCallDisplay }) {
    const { allArtifacts } = useJobsContext();
    const isPending = toolCall.duration_ms === 0 && !toolCall.error && !toolCall.result;
    const inputSummary = Object.entries(toolCall.input)
        .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
        .join(", ");
    const artifactIds = useMemo(() => extractArtifactIds(toolCall.result), [toolCall.result]);
    const artifacts = useMemo(() => {
        if (artifactIds.length === 0) return [];
        const idSet = new Set(artifactIds.map(id => id.toLowerCase()));
        return allArtifacts.filter(artifact => idSet.has(artifact.id.toLowerCase()));
    }, [artifactIds, allArtifacts]);

    return (
        <div className={`jpc-tool-call ${toolCall.error ? "jpc-tool-call--error" : isPending ? "jpc-tool-call--pending" : "jpc-tool-call--success"}`}>
            <div className="jpc-tool-call__header">
                <Wrench size={10} className="jpc-tool-call__icon" />
                <span className="jpc-tool-call__name">{toolCall.name}</span>
                {!isPending && <span className="jpc-tool-call__duration">{toolCall.duration_ms}ms</span>}
            </div>
            {inputSummary && <div className="jpc-tool-call__args">{inputSummary}</div>}
            {toolCall.error && <div className="jpc-tool-call__error">{toolCall.error}</div>}
            {artifacts.length > 0 && (
                <div className="jpc-tool-call__artifacts">
                    <FileText size={10} />
                    <span>Artifacts ({artifacts.length})</span>
                </div>
            )}
        </div>
    );
}

function ToolCallList({ toolCalls }: { toolCalls: ToolCallDisplay[] }) {
    if (toolCalls.length === 0) return null;

    return (
        <div className="jpc-tools">
            <div className="jpc-tools__label">
                <Wrench size={10} /> Commands ({toolCalls.length})
            </div>
            <div className="jpc-tools__list">
                {toolCalls.map((toolCall, index) => (
                    <ToolCallRow key={`${toolCall.name}-${toolCall.jobId || "direct"}-${index}`} toolCall={toolCall} />
                ))}
            </div>
        </div>
    );
}

// ── Main component ──

interface JobProgressCardProps {
    jobId: string;
    toolCalls?: ToolCallDisplay[];
}

export function JobProgressCard({ jobId, toolCalls = [] }: JobProgressCardProps) {
    const { jobs } = useJobsContext();
    const job: Job | undefined = useMemo(
        () => jobs.find((j: Job) => j.id === jobId),
        [jobs, jobId],
    );

    if (!job) {
        // Suppress stale placeholder cards: if a message references a job id
        // that is no longer in memory, we hide the card instead of pinning a
        // permanent "pending" tile in chat history.
        return null;
    }

    const steps = job.steps || [];
    const completed = steps.filter(s => s.status === "completed" || s.status === "skipped").length;
    const failed = steps.filter(s => s.status === "failed").length;
    const total = steps.length;
    const isRunning = job.status === "running";
    const isDone = job.status === "completed";
    const isFailed = job.status === "failed";
    const pendingReplies = getPendingRepliesCount(job);
    const isQueued = job.status === "queued";
    const isAwaitingInput = job.status === "awaiting-input";
    const [showDetails, setShowDetails] = useState(!(isDone || isFailed));
    const hasToolErrors = toolCalls.some(tc => !!tc.error);
    const displayStatus: "queued" | "running" | "completed" | "failed" | "awaiting-input" =
        isAwaitingInput
            ? "awaiting-input"
            : isQueued
                ? "queued"
                : isRunning
                    ? "running"
                    : (isFailed || (isDone && hasToolErrors))
                        ? "failed"
                        : "completed";
    const storage = job.storage || {};
    const deliverables = job.deliverables || [];
    const startedAt = job.startedAt || job.createdAt;
    const endedAt = (job.status === "completed" || job.status === "failed") ? job.completedAt : undefined;
    const durationMs = endedAt && startedAt ? Math.max(0, endedAt - startedAt) : undefined;
    const activeStep = steps.find(s => s.status === "running");
    const lastCompletedStep = [...steps].reverse().find(s => s.status === "completed");
    const latestActivity =
        activeStep?.name || activeStep?.commandId
        || lastCompletedStep?.name || lastCompletedStep?.commandId
        || (toolCalls[toolCalls.length - 1]?.name)
        || "No activity yet";

    const formatTimestamp = (ts?: number) => {
        if (!ts) return "-";
        return new Date(ts).toLocaleString();
    };

    const formatDuration = (ms?: number) => {
        if (!ms || ms <= 0) return "-";
        if (ms < 1000) return `${ms}ms`;
        const seconds = ms / 1000;
        if (seconds < 60) return `${seconds.toFixed(1)}s`;
        const minutes = Math.floor(seconds / 60);
        const remSeconds = Math.floor(seconds % 60);
        return `${minutes}m ${remSeconds}s`;
    };

    useEffect(() => {
        if (isDone || isFailed) {
            setShowDetails(false);
            return;
        }
        setShowDetails(true);
    }, [isDone, isFailed, job.id]);

    return (
        <div className={`jpc jpc--${displayStatus}`}>
            <div className="jpc__face jpc__face--front">
                <div className="jpc__header">
                    <div className="jpc__title-row">
                        <Layers size={12} className="jpc__icon" />
                        <span className="jpc__name">{job.type}</span>
                        <ModeBadge mode={job.mode} />
                        <span className={`jpc__status jpc__status--${displayStatus}`}>
                            {isQueued && "queued"}
                            {isRunning && "running"}
                            {displayStatus === "completed" && "completed"}
                            {displayStatus === "failed" && "error"}
                            {isAwaitingInput && "awaiting input"}
                        </span>
                    </div>
                    {total > 0 && (
                        <ProgressBar completed={completed} total={total} failed={failed} />
                    )}
                </div>

                <div className="jpc__compact-stats">
                    <span className="jpc__compact-chip">Steps {completed}/{total || 0}</span>
                    <span className="jpc__compact-chip">Commands {toolCalls.length}</span>
                    <span className="jpc__compact-chip">Deliverables {deliverables.length}</span>
                </div>

                <div className="jpc__activity" title={latestActivity}>
                    <span className="jpc__activity-label">Activity</span>
                    <span className="jpc__activity-text">{latestActivity}</span>
                </div>

                <button
                    type="button"
                    className="jpc__details-toggle"
                    onClick={() => setShowDetails((v) => !v)}
                >
                    {showDetails ? "Hide details" : "Show details"}
                </button>

                {showDetails && <div className="jpc__back-content">
                    <div className="jpc__meta-grid">
                        <div className="jpc__meta-item"><span>ID</span><code>{job.id.slice(0, 12)}</code></div>
                        <div className="jpc__meta-item"><span>Created</span><span>{formatTimestamp(job.createdAt)}</span></div>
                        <div className="jpc__meta-item"><span>Updated</span><span>{formatTimestamp(job.updatedAt)}</span></div>
                        <div className="jpc__meta-item"><span>Duration</span><span>{formatDuration(durationMs)}</span></div>
                    </div>

                    <ToolCallList toolCalls={toolCalls} />

                    {steps.length > 0 && (
                        <div className="jpc__steps">
                            {steps.map((s, i) => (
                                <StepRow key={s.id || i} step={s} index={i} />
                            ))}
                        </div>
                    )}

                    {(isRunning || isDone || isFailed) && <StorageSnapshot storage={storage} />}

                    {(isRunning || isDone || isFailed) && <DeliverablesStatus deliverables={deliverables} storage={storage} />}

                    {isAwaitingInput && job.pendingPrompt && (
                        <div className="jpc__awaiting-input">
                            <Keyboard size={11} />
                            <span>Waiting for input: {job.pendingPrompt.promptText}</span>
                        </div>
                    )}

                    {isDone && job.result && (
                        <div className="jpc__result">
                            <CheckCircle size={11} />
                            <span>{job.result.length > 160 ? job.result.slice(0, 160) + "…" : job.result}</span>
                        </div>
                    )}
                    {isFailed && job.result && (
                        <div className="jpc__error">
                            <XCircle size={11} />
                            <span>{job.result.length > 160 ? job.result.slice(0, 160) + "…" : job.result}</span>
                        </div>
                    )}
                    {pendingReplies > 0 && (
                        <div className="jpc__result">
                            <Clock size={11} />
                            <span>{pendingReplies} repl{pendingReplies === 1 ? "y" : "ies"} still processing in background</span>
                        </div>
                    )}
                    <CompletionDetailsView resultDetails={job.resultDetails} />
                </div>}
            </div>
        </div>
    );
}
