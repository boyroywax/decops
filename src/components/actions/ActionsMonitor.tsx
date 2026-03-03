import React, { useState, useMemo } from "react";
import { useJobsContext } from "../../context/JobsContext";
import {
    CheckCircle, Clock, AlertCircle, Timer,
    ChevronDown, ChevronUp, Terminal, FileText,
    Database, Package, Layers, ArrowRight, Loader,
    StopCircle, GitFork,
} from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import { CopyableId } from "../shared/CopyableId";
import "../../styles/components/actions-monitor.css";

/** Format ms duration into a readable string */
function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}m ${rem}s`;
}

/** Render key request params as compact badges */
function renderRequestParams(request: Record<string, any>) {
    if (!request || typeof request !== "object") return null;
    const skip = new Set(["steps", "mode"]);
    const entries = Object.entries(request).filter(
        ([k, v]) => !skip.has(k) && v !== undefined && v !== null && v !== ""
    );
    if (entries.length === 0) return null;
    return (
        <div className="actions-monitor__history-request">
            {entries.slice(0, 6).map(([key, val]) => (
                <span key={key} className="actions-monitor__request-param">
                    <span className="actions-monitor__request-param-key">{key}:</span>{" "}
                    {typeof val === "object" ? JSON.stringify(val).slice(0, 40) : String(val).slice(0, 40)}
                </span>
            ))}
        </div>
    );
}

const RECENT_OPTIONS = [5, 10, 20, 50];

/** Status icon for a single step */
function StepStatusIcon({ status }: { status?: string }) {
    if (status === "completed") return <CheckCircle size={13} color="#10b981" />;
    if (status === "failed") return <AlertCircle size={13} color="#ef4444" />;
    if (status === "running") return <Loader size={13} color="#3b82f6" className="actions-monitor__spin" />;
    if (status === "skipped") return <Clock size={13} color="#71717a" />;
    return <Clock size={13} color="#52525b" />;
}

/** Micro progress bar for a single step */
function StepProgressBar({ status }: { status?: string }) {
    const pct =
        status === "completed" ? 100
        : status === "running" ? 50
        : status === "failed" ? 100
        : status === "skipped" ? 100
        : 0;
    const cls =
        status === "completed" ? "actions-monitor__step-bar--completed"
        : status === "running" ? "actions-monitor__step-bar--running"
        : status === "failed" ? "actions-monitor__step-bar--failed"
        : status === "skipped" ? "actions-monitor__step-bar--skipped"
        : "actions-monitor__step-bar--pending";
    return (
        <div className="actions-monitor__step-bar">
            <div className={`actions-monitor__step-bar-fill ${cls}`} style={{ width: `${pct}%` }} />
        </div>
    );
}

/** Single step row — reused in both serial list and parallel group */
function StepRow({ step, isCurrent }: { step: any; isCurrent?: boolean }) {
    return (
        <div className={`actions-monitor__active-step${isCurrent ? " actions-monitor__active-step--current" : ""}`}>
            <div className="actions-monitor__step-icon"><StepStatusIcon status={step.status} /></div>
            <div className="actions-monitor__step-content">
                <div className="actions-monitor__step-command">
                    <span className="actions-monitor__step-command-slash">/</span>
                    {step.commandId}
                    {step.name && step.name !== step.commandId && (
                        <span style={{ color: "var(--text-ghost)", fontWeight: "normal" }}>— {step.name}</span>
                    )}
                    <span className={`actions-monitor__step-status-badge actions-monitor__step-status-badge--${step.status || 'pending'}`}>
                        {step.status || "pending"}
                    </span>
                </div>
                <StepProgressBar status={step.status} />
                {step.outputMappings && step.outputMappings.length > 0 && (
                    <div className="actions-monitor__step-mappings">
                        {step.outputMappings.map((m: any, mi: number) => (
                            <span key={mi} className="actions-monitor__mapping-badge">
                                <ArrowRight size={9} />{m.target}.{m.targetKey}
                            </span>
                        ))}
                    </div>
                )}
                {step.result && <div className="actions-monitor__step-result">{step.result}</div>}
            </div>
        </div>
    );
}

type StepNode = { kind: "step"; step: any; idx: number }
             | { kind: "group"; group: { id: string; label: string; stepIds: string[] }; children: any[] };

/** Build a structured list: serial steps interleaved with parallel group containers */
function buildStepTree(
    steps: any[],
    parallelGroups?: Array<{ id: string; label: string; stepIds: string[] }>
): StepNode[] {
    if (!parallelGroups || parallelGroups.length === 0) {
        return steps.map((s, i) => ({ kind: "step" as const, step: s, idx: i }));
    }
    const groupChildIds = new Set<string>();
    const stepToGroup = new Map<string, { id: string; label: string; stepIds: string[] }>();
    for (const g of parallelGroups) {
        for (const sid of g.stepIds) { groupChildIds.add(sid); stepToGroup.set(sid, g); }
    }
    const insertedGroups = new Set<string>();
    const result: StepNode[] = [];
    for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        if (groupChildIds.has(s.id)) {
            const g = stepToGroup.get(s.id)!;
            if (!insertedGroups.has(g.id)) {
                insertedGroups.add(g.id);
                const children = g.stepIds.map(sid => steps.find(st => st.id === sid)).filter(Boolean);
                result.push({ kind: "group", group: g, children });
            }
        } else {
            result.push({ kind: "step", step: s, idx: i });
        }
    }
    return result;
}

export function ActionsMonitor() {
    const { jobs, isPaused, toggleQueuePause, stopJob } = useJobsContext();
    const [expandedJob, setExpandedJob] = useState<string | null>(null);
    const [expandedActive, setExpandedActive] = useState<string | null>(null);
    const [recentCount, setRecentCount] = useState(5);

    const activeJobs = jobs.filter(j => j.status === "queued" || j.status === "running");
    const recentCompleted = jobs
        .filter(j => j.status === "completed" || j.status === "failed")
        .slice(0, recentCount);

    const toggleExpand = (id: string) => {
        setExpandedJob(prev => prev === id ? null : id);
    };

    return (
        <div className="actions-monitor">

            {/* Active Jobs Section */}
            <div>
                <div className="actions-monitor__section-header">
                    <h3 className="actions-monitor__section-title">Active Jobs ({activeJobs.length})</h3>
                    <div className="actions-monitor__controls">
                        <button
                            onClick={toggleQueuePause}
                            className={`actions-monitor__pause-btn ${isPaused ? "actions-monitor__pause-btn--paused" : ""}`}
                        >
                            {isPaused ? "Resume Queue" : "Pause Queue"}
                        </button>
                    </div>
                </div>

                <div className="actions-monitor__job-list">
                    {activeJobs.length === 0 ? (
                        <div className="actions-monitor__empty">
                            No active jobs.
                        </div>
                    ) : (
                        activeJobs.map(job => {
                            const isActive = expandedActive === job.id;
                            const hasSteps = job.steps && job.steps.length > 0;
                            const stepCount = job.steps?.length || 0;
                            const completedSteps = job.steps?.filter(s => s.status === "completed").length || 0;
                            const currentIdx = job.currentStepIndex ?? -1;
                            const progress = stepCount > 0 ? Math.round((completedSteps / stepCount) * 100) : 0;
                            const storageKeys = job.storage ? Object.keys(job.storage) : [];
                            const deliverables = job.deliverables || [];
                            const hasArtifacts = job.artifacts && job.artifacts.length > 0;
                            const duration = job.updatedAt && job.createdAt
                                ? formatDuration(job.updatedAt - job.createdAt)
                                : null;

                            return (
                            <div key={job.id}
                                className={`actions-monitor__job-card actions-monitor__job-card--detailed${isActive ? " actions-monitor__job-card--expanded" : ""}`}
                                style={{ borderLeft: `3px solid ${job.status === 'running' ? '#3b82f6' : '#f59e0b'}` }}
                            >
                                {/* Header row — always visible */}
                                <div className="actions-monitor__active-header"
                                    onClick={() => setExpandedActive(prev => prev === job.id ? null : job.id)}
                                    style={{ cursor: "pointer" }}
                                >
                                    <div className="actions-monitor__active-info">
                                        {job.status === "running" ? (
                                            <GradientIcon icon={Loader} size={18} gradient={["#3b82f6", "#60a5fa"]} />
                                        ) : (
                                            <GradientIcon icon={Clock} size={18} gradient={["#f59e0b", "#fbbf24"]} />
                                        )}
                                        <div>
                                            <div className="actions-monitor__job-type">
                                                {job.type}
                                                <span className={`actions-monitor__job-status actions-monitor__job-status--${job.status}`}>{job.status}</span>
                                                {job.mode && <span className="actions-monitor__job-mode">{job.mode}</span>}
                                            </div>
                                            <div className="actions-monitor__job-id">
                                                <CopyableId value={job.id} label="ID" truncate={24} />
                                                {duration && (
                                                    <span className="actions-monitor__active-duration">
                                                        <Timer size={10} /> {duration}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        {job.status === "running" && (
                                            <button
                                                className="actions-monitor__stop-btn"
                                                onClick={e => { e.stopPropagation(); stopJob(job.id); }}
                                                title="Stop job"
                                            >
                                                <StopCircle size={14} /> Stop
                                            </button>
                                        )}
                                        {isActive ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </div>
                                </div>

                                {/* Progress bar */}
                                {hasSteps && (
                                    <div className="actions-monitor__progress-wrap">
                                        <div className="actions-monitor__progress-bar">
                                            <div
                                                className={`actions-monitor__progress-fill${job.status === 'running' ? " actions-monitor__progress-fill--animated" : ""}`}
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                        <span className="actions-monitor__progress-label">
                                            {completedSteps}/{stepCount} steps · {progress}%
                                        </span>
                                    </div>
                                )}

                                {/* Expanded detail panels */}
                                {isActive && (
                                    <div className="actions-monitor__active-detail">
                                        {/* ── Steps (with parallel groups) ── */}
                                        {hasSteps && (() => {
                                            const tree = buildStepTree(job.steps!, job.parallelGroups);
                                            return (
                                            <div className="actions-monitor__detail-section">
                                                <div className="actions-monitor__detail-title">
                                                    <Terminal size={12} /> Steps
                                                    {job.parallelGroups && job.parallelGroups.length > 0 && (
                                                        <span className="actions-monitor__mode-badge">
                                                            <GitFork size={10} /> mixed
                                                        </span>
                                                    )}
                                                    {job.mode === "parallel" && !job.parallelGroups?.length && (
                                                        <span className="actions-monitor__mode-badge">
                                                            <GitFork size={10} /> parallel
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="actions-monitor__steps-list">
                                                    {tree.map((node, ni) => {
                                                        if (node.kind === "step") {
                                                            const isCurrent = node.idx === currentIdx;
                                                            return <StepRow key={node.step.id || ni} step={node.step} isCurrent={isCurrent} />;
                                                        }
                                                        // Parallel group container
                                                        const groupCompleted = node.children.filter((c: any) => c.status === "completed").length;
                                                        const groupTotal = node.children.length;
                                                        const groupPct = groupTotal > 0 ? Math.round((groupCompleted / groupTotal) * 100) : 0;
                                                        const groupRunning = node.children.some((c: any) => c.status === "running");
                                                        const groupFailed = node.children.some((c: any) => c.status === "failed");
                                                        return (
                                                            <div key={node.group.id} className="actions-monitor__parallel-group">
                                                                <div className="actions-monitor__parallel-group-header">
                                                                    <GitFork size={12} className="actions-monitor__parallel-icon" />
                                                                    <span className="actions-monitor__parallel-label">{node.group.label}</span>
                                                                    <span className="actions-monitor__parallel-count">
                                                                        {groupCompleted}/{groupTotal}
                                                                    </span>
                                                                    {groupFailed && <span className="actions-monitor__parallel-status actions-monitor__parallel-status--failed">failed</span>}
                                                                    {!groupFailed && groupRunning && <span className="actions-monitor__parallel-status actions-monitor__parallel-status--running">running</span>}
                                                                    {!groupFailed && !groupRunning && groupCompleted === groupTotal && groupTotal > 0 && (
                                                                        <span className="actions-monitor__parallel-status actions-monitor__parallel-status--completed">done</span>
                                                                    )}
                                                                </div>
                                                                <div className="actions-monitor__parallel-group-bar">
                                                                    <div
                                                                        className={`actions-monitor__parallel-group-bar-fill${groupRunning ? " actions-monitor__parallel-group-bar-fill--animated" : ""}${groupFailed ? " actions-monitor__parallel-group-bar-fill--failed" : ""}`}
                                                                        style={{ width: `${groupPct}%` }}
                                                                    />
                                                                </div>
                                                                <div className="actions-monitor__parallel-children">
                                                                    {node.children.map((child: any, ci: number) => (
                                                                        <StepRow key={child.id || ci} step={child} />
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            );
                                        })()}

                                        {/* ── Storage ── */}
                                        {storageKeys.length > 0 && (
                                            <div className="actions-monitor__detail-section">
                                                <div className="actions-monitor__detail-title">
                                                    <Database size={12} /> Inter-Job Storage ({storageKeys.length} keys)
                                                </div>
                                                <div className="actions-monitor__storage-grid">
                                                    {storageKeys.map(key => {
                                                        const val = job.storage![key];
                                                        const display = typeof val === "string"
                                                            ? (val.length > 120 ? val.slice(0, 120) + "…" : val)
                                                            : JSON.stringify(val, null, 2)?.slice(0, 120) + (JSON.stringify(val)!.length > 120 ? "…" : "");
                                                        return (
                                                            <div key={key} className="actions-monitor__storage-entry">
                                                                <div className="actions-monitor__storage-key">${key}</div>
                                                                <div className="actions-monitor__storage-value">{display}</div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* ── Deliverables ── */}
                                        {deliverables.length > 0 && (
                                            <div className="actions-monitor__detail-section">
                                                <div className="actions-monitor__detail-title">
                                                    <Package size={12} /> Deliverables ({deliverables.length})
                                                </div>
                                                <div className="actions-monitor__deliverables-list">
                                                    {deliverables.map(d => {
                                                        const populated = !!job.storage?.[`deliverable.${d.key}`];
                                                        return (
                                                            <div key={d.key}
                                                                className={`actions-monitor__deliverable-item${populated ? " actions-monitor__deliverable-item--populated" : ""}`}
                                                            >
                                                                <span className="actions-monitor__deliverable-status">
                                                                    {populated ? <CheckCircle size={11} color="#10b981" /> : <Clock size={11} color="#52525b" />}
                                                                </span>
                                                                <span className="actions-monitor__deliverable-label">{d.label}</span>
                                                                <span className="actions-monitor__deliverable-type">{d.type}</span>
                                                                {d.description && (
                                                                    <span className="actions-monitor__deliverable-desc">{d.description}</span>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* ── Artifacts produced so far ── */}
                                        {hasArtifacts && (
                                            <div className="actions-monitor__detail-section">
                                                <div className="actions-monitor__detail-title">
                                                    <Layers size={12} /> Artifacts ({job.artifacts.length})
                                                </div>
                                                <div className="actions-monitor__history-artifacts">
                                                    {job.artifacts.map(a => (
                                                        <span key={a.id} className="actions-monitor__artifact-badge">
                                                            <FileText size={10} /> {a.name}
                                                            <span className="actions-monitor__artifact-type">{a.type}</span>
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Recent Completed Section */}
            <div>
                <div className="actions-monitor__section-header">
                    <h3 className="actions-monitor__section-title">Recently Completed</h3>
                    <div className="actions-monitor__controls">
                        <select
                            className="actions-monitor__recent-select"
                            value={recentCount}
                            onChange={e => setRecentCount(Number(e.target.value))}
                        >
                            {RECENT_OPTIONS.map(n => (
                                <option key={n} value={n}>Last {n}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="actions-monitor__history-list">
                    {recentCompleted.length === 0 && (
                        <div className="actions-monitor__empty">No completed jobs yet.</div>
                    )}
                    {recentCompleted.map(job => {
                        const isExpanded = expandedJob === job.id;
                        const duration = job.updatedAt && job.createdAt
                            ? formatDuration(job.updatedAt - job.createdAt)
                            : null;
                        const hasSteps = job.steps && job.steps.length > 0;
                        const hasArtifacts = job.artifacts && job.artifacts.length > 0;
                        const histStorageKeys = job.storage ? Object.keys(job.storage) : [];
                        const histDeliverables = job.deliverables || [];

                        return (
                            <div
                                key={job.id}
                                className="actions-monitor__history-item"
                                style={{
                                    borderLeft: `3px solid ${job.status === 'completed' ? '#10b981' : '#ef4444'}`,
                                }}
                            >
                                <div
                                    className="actions-monitor__history-header"
                                    onClick={() => toggleExpand(job.id)}
                                    style={{ cursor: "pointer" }}
                                >
                                    <div className="actions-monitor__history-info">
                                        {job.status === 'completed' ?
                                            <GradientIcon icon={CheckCircle} size={18} gradient={["#10b981", "#34d399"]} /> :
                                            <GradientIcon icon={AlertCircle} size={18} gradient={["#ef4444", "#f87171"]} />
                                        }
                                        <div>
                                            <div className="actions-monitor__history-type">{job.type}</div>
                                            <div className="actions-monitor__history-time">
                                                {new Date(job.updatedAt).toLocaleString()}
                                                {duration && (
                                                    <span className="actions-monitor__history-duration">
                                                        <Timer size={10} /> {duration}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        {hasSteps && (
                                            <span className="actions-monitor__history-step-count">
                                                {job.steps!.filter(s => s.status === "completed").length}/{job.steps!.length} steps
                                            </span>
                                        )}
                                        <span className={`actions-monitor__history-status actions-monitor__history-status--${job.status}`}>
                                            {job.status}
                                        </span>
                                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </div>
                                </div>

                                <div className="actions-monitor__history-id">
                                    <CopyableId value={job.id} label="ID" truncate={32} />
                                </div>

                                {job.result && (
                                    <div className="actions-monitor__history-result">{job.result}</div>
                                )}

                                {isExpanded && (
                                    <div className="actions-monitor__active-detail">
                                        {renderRequestParams(job.request)}

                                        {hasSteps && (() => {
                                            const tree = buildStepTree(job.steps!, job.parallelGroups);
                                            return (
                                            <div className="actions-monitor__detail-section">
                                                <div className="actions-monitor__detail-title">
                                                    <Terminal size={12} /> Commands Executed
                                                    {job.parallelGroups && job.parallelGroups.length > 0 && (
                                                        <span className="actions-monitor__mode-badge"><GitFork size={10} /> mixed</span>
                                                    )}
                                                </div>
                                                <div className="actions-monitor__steps-list">
                                                    {tree.map((node, ni) => {
                                                        if (node.kind === "step") {
                                                            return <StepRow key={node.step.id || ni} step={node.step} />;
                                                        }
                                                        const groupDone = node.children.filter((c: any) => c.status === "completed").length;
                                                        const groupTotal = node.children.length;
                                                        return (
                                                            <div key={node.group.id} className="actions-monitor__parallel-group">
                                                                <div className="actions-monitor__parallel-group-header">
                                                                    <GitFork size={12} className="actions-monitor__parallel-icon" />
                                                                    <span className="actions-monitor__parallel-label">{node.group.label}</span>
                                                                    <span className="actions-monitor__parallel-count">{groupDone}/{groupTotal}</span>
                                                                </div>
                                                                <div className="actions-monitor__parallel-children">
                                                                    {node.children.map((child: any, ci: number) => (
                                                                        <StepRow key={child.id || ci} step={child} />
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            );
                                        })()}

                                        {/* Storage for completed jobs */}
                                        {histStorageKeys.length > 0 && (
                                            <div className="actions-monitor__detail-section">
                                                <div className="actions-monitor__detail-title">
                                                    <Database size={12} /> Storage ({histStorageKeys.length} keys)
                                                </div>
                                                <div className="actions-monitor__storage-grid">
                                                    {histStorageKeys.map(key => {
                                                        const val = job.storage![key];
                                                        const display = typeof val === "string"
                                                            ? (val.length > 120 ? val.slice(0, 120) + "…" : val)
                                                            : JSON.stringify(val, null, 2)?.slice(0, 120) + (JSON.stringify(val)!.length > 120 ? "…" : "");
                                                        return (
                                                            <div key={key} className="actions-monitor__storage-entry">
                                                                <div className="actions-monitor__storage-key">${key}</div>
                                                                <div className="actions-monitor__storage-value">{display}</div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Deliverables for completed jobs */}
                                        {histDeliverables.length > 0 && (
                                            <div className="actions-monitor__detail-section">
                                                <div className="actions-monitor__detail-title">
                                                    <Package size={12} /> Deliverables ({histDeliverables.length})
                                                </div>
                                                <div className="actions-monitor__deliverables-list">
                                                    {histDeliverables.map(d => {
                                                        const populated = !!job.storage?.[`deliverable.${d.key}`];
                                                        return (
                                                            <div key={d.key}
                                                                className={`actions-monitor__deliverable-item${populated ? " actions-monitor__deliverable-item--populated" : ""}`}
                                                            >
                                                                <span className="actions-monitor__deliverable-status">
                                                                    {populated ? <CheckCircle size={11} color="#10b981" /> : <AlertCircle size={11} color="#ef4444" />}
                                                                </span>
                                                                <span className="actions-monitor__deliverable-label">{d.label}</span>
                                                                <span className="actions-monitor__deliverable-type">{d.type}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {hasArtifacts && (
                                            <div className="actions-monitor__detail-section">
                                                <div className="actions-monitor__detail-title">
                                                    <Layers size={12} /> Artifacts ({job.artifacts.length})
                                                </div>
                                                <div className="actions-monitor__history-artifacts">
                                                    {job.artifacts.map(a => (
                                                        <span key={a.id} className="actions-monitor__artifact-badge">
                                                            <FileText size={10} /> {a.name}
                                                            <span className="actions-monitor__artifact-type">{a.type}</span>
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

        </div>
    );
}
