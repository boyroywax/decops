import React, { useState } from "react";
import { useJobsContext } from "../../context/JobsContext";
import {
    CheckCircle, Clock, AlertCircle, Timer,
    ChevronDown, ChevronUp, Terminal, FileText,
    Database, Package, Layers, Loader,
    StopCircle, GitFork,
} from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import { CopyableId } from "../shared/CopyableId";
import { formatDuration, renderRequestParams, RECENT_OPTIONS } from "./monitorUtils";
import { StepRow, buildStepTree } from "./MonitorStepTree";
import "../../styles/components/actions-monitor.css";

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
