import React, { useState } from "react";
import { useJobsContext } from "../../context/JobsContext";
import { useAutomations } from "../../context/AutomationsContext";
import { AutomationCard } from "../automations/AutomationCard";
import {
    CheckCircle, Clock, PlayCircle, AlertCircle, Trash2,
    ChevronDown, ChevronUp, Terminal, FileText, Timer,
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

export function ActionsMonitor() {
    const { jobs, isPaused, toggleQueuePause } = useJobsContext();
    const { automations, runs, runAutomation, deleteAutomation } = useAutomations();
    const [expandedJob, setExpandedJob] = useState<string | null>(null);

    const activeJobs = jobs.filter(j => j.status === "queued" || j.status === "running");
    const historyJobs = jobs.filter(j => j.status === "completed" || j.status === "failed").slice(0, 20);

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
                        activeJobs.map(job => (
                            <div key={job.id} className="actions-monitor__job-card"
                                style={{ borderLeft: `3px solid ${job.status === 'running' ? '#3b82f6' : '#f59e0b'}` }}>
                                <div>
                                    <div className="actions-monitor__job-type">
                                        {job.type}
                                        <span className="actions-monitor__job-status">{job.status}</span>
                                    </div>
                                    <div className="actions-monitor__job-id"><CopyableId value={job.id} label="ID" truncate={24} /></div>
                                </div>
                                {job.status === 'running' && (
                                    <div className="actions-monitor__job-processing">Processing...</div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Automations Section */}
            <div>
                <h3 className="actions-monitor__section-title actions-monitor__section-title--spaced">Active Automations</h3>
                <div className="actions-monitor__auto-grid">
                    {automations.map(auto => {
                        const lastRun = runs.find(r => r.automationId === auto.id);
                        return (
                            <div key={auto.id} className="actions-monitor__auto-card">
                                <div className="actions-monitor__auto-header">
                                    <span className="actions-monitor__auto-name">{auto.name}</span>
                                    {auto.schedule && <span className="actions-monitor__auto-schedule">{auto.schedule}</span>}
                                </div>
                                <p className="actions-monitor__auto-desc">{auto.description}</p>
                                <div className="actions-monitor__auto-footer">
                                    <div className="actions-monitor__auto-time">
                                        <Clock size={12} />
                                        {lastRun ? new Date(lastRun.startTime).toLocaleTimeString() : "Never run"}
                                    </div>
                                    <button
                                        onClick={() => runAutomation(auto.id)}
                                        className="actions-monitor__auto-action actions-monitor__auto-action--run"
                                    >
                                        <PlayCircle size={14} /> Run Now
                                    </button>
                                    <button
                                        onClick={() => deleteAutomation(auto.id)}
                                        className="actions-monitor__auto-action actions-monitor__auto-action--delete"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Recent History Section */}
            <div>
                <h3 className="actions-monitor__section-title actions-monitor__section-title--spaced">Recent History</h3>
                <div className="actions-monitor__history-list">
                    {historyJobs.length === 0 && (
                        <div className="actions-monitor__empty">No completed jobs yet.</div>
                    )}
                    {historyJobs.map(job => {
                        const isExpanded = expandedJob === job.id;
                        const duration = job.updatedAt && job.createdAt
                            ? formatDuration(job.updatedAt - job.createdAt)
                            : null;
                        const hasSteps = job.steps && job.steps.length > 0;
                        const hasArtifacts = job.artifacts && job.artifacts.length > 0;

                        return (
                            <div
                                key={job.id}
                                className="actions-monitor__history-item"
                                style={{
                                    borderLeft: `3px solid ${job.status === 'completed' ? '#10b981' : '#ef4444'}`,
                                }}
                            >
                                {/* Header row */}
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
                                        <span className={`actions-monitor__history-status actions-monitor__history-status--${job.status}`}>
                                            {job.status}
                                        </span>
                                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </div>
                                </div>

                                {/* ID row */}
                                <div className="actions-monitor__history-id">
                                    <CopyableId value={job.id} label="ID" truncate={32} />
                                </div>

                                {/* Result summary (always visible) */}
                                {job.result && (
                                    <div className="actions-monitor__history-result">
                                        {job.result}
                                    </div>
                                )}

                                {/* Expanded details */}
                                {isExpanded && (
                                    <>
                                        {/* Request params */}
                                        {renderRequestParams(job.request)}

                                        {/* Steps / commands ran */}
                                        {hasSteps && (
                                            <div className="actions-monitor__history-steps">
                                                <div className="actions-monitor__history-steps-title">
                                                    <Terminal size={11} style={{ display: "inline", verticalAlign: "middle" }} /> Commands Executed
                                                </div>
                                                {job.steps!.map((step, i) => (
                                                    <div key={step.id || i} className="actions-monitor__history-step">
                                                        <div className="actions-monitor__step-icon">
                                                            {step.status === "completed" ? (
                                                                <CheckCircle size={13} color="#10b981" />
                                                            ) : step.status === "failed" ? (
                                                                <AlertCircle size={13} color="#ef4444" />
                                                            ) : step.status === "skipped" ? (
                                                                <Clock size={13} color="#71717a" />
                                                            ) : (
                                                                <Clock size={13} color="#f59e0b" />
                                                            )}
                                                        </div>
                                                        <div className="actions-monitor__step-content">
                                                            <div className="actions-monitor__step-command">
                                                                <span className="actions-monitor__step-command-slash">/</span>
                                                                {step.commandId}
                                                                {step.name && step.name !== step.commandId && (
                                                                    <span style={{ color: "var(--text-ghost)", fontWeight: "normal" }}>
                                                                        — {step.name}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {step.args && Object.keys(step.args).length > 0 && (
                                                                <div className="actions-monitor__step-args">
                                                                    {Object.entries(step.args).slice(0, 4).map(([k, v]) => (
                                                                        <span key={k}>{k}={typeof v === "string" ? `"${v}"` : JSON.stringify(v)} </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {step.result && (
                                                                <div className="actions-monitor__step-result">
                                                                    {step.result}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Artifacts */}
                                        {hasArtifacts && (
                                            <div className="actions-monitor__history-artifacts">
                                                {job.artifacts.map(a => (
                                                    <span key={a.id} className="actions-monitor__artifact-badge">
                                                        <FileText size={10} /> {a.name}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

        </div>
    );
}
