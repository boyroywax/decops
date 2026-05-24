/**
 * JobProgressCard — Inline chat component that renders live job execution
 * progress. Subscribes to JobsContext and auto-updates as steps complete.
 *
 * Shows: job name, mode badge, step-by-step status with mini timeline,
 * live storage keys, deliverable status, and final result.
 */

import { useMemo, useState } from "react";
import {
    CheckCircle, XCircle, Loader, Clock, SkipForward,
    Database, Package, Layers, ChevronRight, AlertTriangle, Keyboard, Wrench, FileText, FlipHorizontal,
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
    const [isFlipped, setIsFlipped] = useState(false);
    const [animationState, setAnimationState] = useState<"idle" | "pressing" | "flipping">("idle");
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
    const isAwaitingInput = job.status === "awaiting-input";
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

    const handleFlip = () => {
        if (isFlipped) {
            setAnimationState("flipping");
            setIsFlipped(false);
            setTimeout(() => setAnimationState("idle"), 600);
            return;
        }
        if (animationState !== "idle") return;
        setAnimationState("pressing");
        setTimeout(() => {
            setIsFlipped(true);
            setAnimationState("flipping");
            setTimeout(() => setAnimationState("idle"), 600);
        }, 170);
    };

    const getTransform = () => {
        if (isFlipped) return "rotateY(180deg)";
        if (animationState === "pressing") return "scale(0.95) rotateY(-12deg)";
        return "scale(1) rotateY(0deg)";
    };

    const getTransitionClass = () => {
        if (animationState === "pressing") return "jpc__inner--pressing";
        if (animationState === "flipping" || isFlipped) return "jpc__inner--flipping";
        return "";
    };

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

    return (
        <div
            className={`jpc jpc--${displayStatus}${(isFlipped || animationState !== "idle") ? " jpc--elevated" : ""}`}
            onClick={handleFlip}
        >
            <div className={`jpc__inner ${getTransitionClass()}`} style={{ transform: getTransform() }}>
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

                </div>

                <div className="jpc__face jpc__face--back">
                    <div className="jpc__back-header">
                        <span className="jpc__back-title">Job Details</span>
                        <span className="jpc__back-dot">●</span>
                    </div>

                    <div className="jpc__back-content">
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
                    </div>

                    <div className="jpc__flip-hint jpc__flip-hint--back">
                        <FlipHorizontal size={10} /> Tap to return to compact view
                    </div>
                </div>
            </div>
        </div>
    );
}
