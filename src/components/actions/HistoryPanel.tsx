import { useState } from "react";
import {
    LayoutGrid, List, CheckCircle, AlertCircle, ChevronDown, ChevronUp,
    Terminal, FileText, Timer, Clock, Search,
} from "lucide-react";
import { useJobsContext } from "@/context/JobsContext";
import { GradientIcon } from "@/components/shared/GradientIcon";
import { CopyableId } from "@/components/shared/CopyableId";
import { Job } from "@/types";
import "../../styles/components/history-panel.css";

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
        <div className="history-panel__request-params">
            {entries.slice(0, 6).map(([key, val]) => (
                <span key={key} className="history-panel__request-param">
                    <span className="history-panel__request-param-key">{key}:</span>{" "}
                    {typeof val === "object" ? JSON.stringify(val).slice(0, 40) : String(val).slice(0, 40)}
                </span>
            ))}
        </div>
    );
}

function renderStructuredResult(job: Job) {
    if (!job.resultDetails) return null;
    return (
        <div className="history-panel__structured-result">
            <div className="history-panel__structured-title">Execution Results</div>
            <div className="history-panel__structured-summary">{job.resultDetails.summary}</div>
            {job.resultDetails.steps.map((step) => (
                <div key={step.id} className="history-panel__structured-step">
                    <div className="history-panel__structured-step-head">
                        <span className="history-panel__step-command">{step.commandId}</span>
                        <span className="history-panel__step-status">{step.status}</span>
                    </div>
                    {step.input && Object.keys(step.input).length > 0 && (
                        <pre className="history-panel__structured-block">INPUT: {JSON.stringify(step.input, null, 2)}</pre>
                    )}
                    {step.result !== undefined && (
                        <pre className="history-panel__structured-block">RESULT: {typeof step.result === "string" ? step.result : JSON.stringify(step.result, null, 2)}</pre>
                    )}
                    {step.error && (
                        <pre className="history-panel__structured-block history-panel__structured-block--error">ERROR: {step.error}</pre>
                    )}
                </div>
            ))}
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

type StatusFilter = "all" | "completed" | "failed";

export function HistoryPanel() {
    const { jobs } = useJobsContext();
    const [view, setView] = useState<"cards" | "table">("cards");
    const [filter, setFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [expandedJob, setExpandedJob] = useState<string | null>(null);

    const historyJobs = jobs
        .filter(j => j.status === "completed" || j.status === "failed")
        .filter(j => statusFilter === "all" || j.status === statusFilter)
        .filter(j =>
            filter === "" ||
            j.type.toLowerCase().includes(filter.toLowerCase()) ||
            j.id.toLowerCase().includes(filter.toLowerCase()) ||
            (j.result && j.result.toLowerCase().includes(filter.toLowerCase()))
        );

    const toggleExpand = (id: string) => {
        setExpandedJob(prev => prev === id ? null : id);
    };

    return (
        <div className="history-panel">
            {/* Toolbar */}
            <div className="history-panel__toolbar">
                <input
                    className="history-panel__search"
                    placeholder="Search history..."
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                />
                <select
                    className="history-panel__status-filter"
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value as StatusFilter)}
                >
                    <option value="all">All Statuses</option>
                    <option value="completed">Completed</option>
                    <option value="failed">Failed</option>
                </select>
                <div className="history-panel__view-toggle">
                    <button
                        onClick={() => setView("cards")}
                        className={`history-panel__view-btn${view === "cards" ? " history-panel__view-btn--active" : ""}`}
                        title="Card view"
                    >
                        <LayoutGrid size={12} />
                    </button>
                    <button
                        onClick={() => setView("table")}
                        className={`history-panel__view-btn${view === "table" ? " history-panel__view-btn--active" : ""}`}
                        title="Table view"
                    >
                        <List size={12} />
                    </button>
                </div>
                <span className="history-panel__count">
                    {historyJobs.length} job{historyJobs.length !== 1 ? "s" : ""}
                </span>
            </div>

            {/* Card View */}
            {view === "cards" && (
                <div className="history-panel__card-list">
                    {historyJobs.map(job => {
                        const pendingReplies = getPendingRepliesCount(job);
                        const isExpanded = expandedJob === job.id;
                        const duration = job.updatedAt && job.createdAt
                            ? formatDuration(job.updatedAt - job.createdAt)
                            : null;
                        const hasSteps = job.steps && job.steps.length > 0;
                        const hasArtifacts = job.artifacts && job.artifacts.length > 0;

                        return (
                            <div
                                key={job.id}
                                className="history-panel__card"
                                style={{
                                    borderLeft: `3px solid ${job.status === 'completed' ? '#10b981' : '#ef4444'}`,
                                }}
                            >
                                {/* Header row */}
                                <div
                                    className="history-panel__card-header"
                                    onClick={() => toggleExpand(job.id)}
                                    style={{ cursor: "pointer" }}
                                >
                                    <div className="history-panel__card-info">
                                        {job.status === 'completed' ?
                                            <GradientIcon icon={CheckCircle} size={18} gradient={["#10b981", "#34d399"]} /> :
                                            <GradientIcon icon={AlertCircle} size={18} gradient={["#ef4444", "#f87171"]} />
                                        }
                                        <div>
                                            <div className="history-panel__card-type">{job.type}</div>
                                            <div className="history-panel__card-time">
                                                {new Date(job.updatedAt).toLocaleString()}
                                                {duration && (
                                                    <span className="history-panel__card-duration">
                                                        <Timer size={10} /> {duration}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        {pendingReplies > 0 && (
                                            <span className="history-panel__status-pill history-panel__status-pill--running">
                                                {pendingReplies} repl{pendingReplies === 1 ? "y" : "ies"} pending
                                            </span>
                                        )}
                                        <span className={`history-panel__status-pill history-panel__status-pill--${job.status}`}>
                                            {job.status}
                                        </span>
                                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </div>
                                </div>

                                {/* ID */}
                                <div className="history-panel__card-id">
                                    <CopyableId value={job.id} label="ID" truncate={32} />
                                </div>

                                {/* Result summary */}
                                {job.result && (
                                    <div className="history-panel__card-result">{job.result}</div>
                                )}

                                {/* Expanded details */}
                                {isExpanded && (
                                    <>
                                        {renderRequestParams(job.request)}

                                        {hasSteps && (
                                            <div className="history-panel__steps">
                                                <div className="history-panel__steps-title">
                                                    <Terminal size={11} style={{ display: "inline", verticalAlign: "middle" }} /> Commands Executed
                                                </div>
                                                {job.steps!.map((step, i) => (
                                                    <div key={step.id || i} className="history-panel__step">
                                                        <div className="history-panel__step-icon">
                                                            {step.status === "completed" ? (
                                                                <CheckCircle size={13} color="#10b981" />
                                                            ) : step.status === "failed" ? (
                                                                <AlertCircle size={13} color="#ef4444" />
                                                            ) : (
                                                                <Clock size={13} color={step.status === "skipped" ? "#71717a" : "#f59e0b"} />
                                                            )}
                                                        </div>
                                                        <div className="history-panel__step-content">
                                                            <div className="history-panel__step-command">
                                                                <span className="history-panel__step-slash">/</span>
                                                                {step.commandId}
                                                                {step.name && step.name !== step.commandId && (
                                                                    <span style={{ color: "var(--text-ghost)", fontWeight: "normal" }}>
                                                                        — {step.name}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {step.args && Object.keys(step.args).length > 0 && (
                                                                <div className="history-panel__step-args">
                                                                    {Object.entries(step.args).slice(0, 4).map(([k, v]) => (
                                                                        <span key={k}>{k}={typeof v === "string" ? `"${v}"` : JSON.stringify(v)} </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {step.result && (
                                                                <div className="history-panel__step-result">{step.result}</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {hasArtifacts && (
                                            <div className="history-panel__artifacts">
                                                {job.artifacts.map(a => (
                                                    <span key={a.id} className="history-panel__artifact-badge">
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
            )}

            {/* Table View */}
            {view === "table" && (
                <div className="history-panel__table-wrap">
                    <table className="history-panel__table">
                        <thead>
                            <tr>
                                <th className="history-panel__th">Status</th>
                                <th className="history-panel__th">Job Type</th>
                                <th className="history-panel__th">Result</th>
                                <th className="history-panel__th history-panel__th--steps">Steps</th>
                                <th className="history-panel__th history-panel__th--artifacts">Artifacts</th>
                                <th className="history-panel__th history-panel__th--duration">Duration</th>
                                <th className="history-panel__th">Completed</th>
                            </tr>
                        </thead>
                        <tbody>
                            {historyJobs.map(job => {
                                const pendingReplies = getPendingRepliesCount(job);
                                const duration = job.updatedAt && job.createdAt
                                    ? formatDuration(job.updatedAt - job.createdAt)
                                    : "—";
                                return (
                                    <tr
                                        key={job.id}
                                        className="history-panel__row"
                                        onClick={() => toggleExpand(job.id)}
                                        style={{ cursor: "pointer" }}
                                    >
                                        <td className="history-panel__td history-panel__td--status">
                                            <span className={`history-panel__status-pill history-panel__status-pill--${job.status}`}>
                                                {job.status}
                                            </span>
                                        </td>
                                        <td className="history-panel__td history-panel__td--type">
                                            <span className="history-panel__type-name">{job.type}</span>
                                        </td>
                                        <td className="history-panel__td history-panel__td--result">
                                            {job.result
                                                ? <span className="history-panel__result-preview">{job.result.slice(0, 60)}{job.result.length > 60 ? "…" : ""}</span>
                                                : <span className="history-panel__no-result">—</span>
                                            }
                                            {pendingReplies > 0 && (
                                                <div>
                                                    <span className="history-panel__status-pill history-panel__status-pill--running">
                                                        {pendingReplies} repl{pendingReplies === 1 ? "y" : "ies"} pending
                                                    </span>
                                                </div>
                                            )}
                                            {job.resultDetails && renderStructuredResult(job)}
                                        </td>
                                        <td className="history-panel__td history-panel__td--steps-count">
                                            {job.steps?.length || 0}
                                        </td>
                                        <td className="history-panel__td history-panel__td--artifacts-count">
                                            {job.artifacts?.length || 0}
                                        </td>
                                        <td className="history-panel__td history-panel__td--dur">
                                            <span className="history-panel__dur">{duration}</span>
                                        </td>
                                        <td className="history-panel__td history-panel__td--time">
                                            {new Date(job.updatedAt).toLocaleString()}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {historyJobs.length === 0 && (
                <div className="history-panel__empty">
                    <Clock size={32} className="history-panel__empty-icon" />
                    <div className="history-panel__empty-title">No History</div>
                    <div className="history-panel__empty-desc">
                        {filter || statusFilter !== "all"
                            ? "No jobs match the current filters."
                            : "Completed and failed jobs will appear here."
                        }
                    </div>
                </div>
            )}
        </div>
    );
}
