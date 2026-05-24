import { useState, useMemo } from "react";
import {
    Monitor, Activity, Clock, Zap, Loader, CheckCircle, AlertCircle,
    Pause, Play, StopCircle, Timer, ChevronDown, ChevronUp,
    Terminal, FileText, Database, Package, Layers, GitFork,
    Search, Trash2, LayoutGrid, List, Circle,
    ArrowRight, XCircle, MessageSquare, SkipForward, Settings,
} from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import { CopyableId } from "@/components/shared/CopyableId";
import { useJobsContext } from "@/context/JobsContext";
import { useAutomations } from "@/context/AutomationsContext";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { DeleteConfirmInline } from "@/components/shared/DeleteConfirmInline";
import { StepRow, buildStepTree } from "@/components/actions/MonitorStepTree";
import type { Job, JobEvent } from "@/types";
import { TOOLKITS, toolkitRegistry } from "@/services/toolkits";
import { useToolkitConfiguration } from "@/hooks/useToolkitConfiguration";
import { ConfigurationItem } from "@/components/config/ConfigurationItem";
import "../../styles/components/system-view.css";

type SystemTab = "processes" | "queue" | "history" | "configuration";

/** Format ms duration into a readable string */
function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    if (m < 60) return `${m}m ${rem}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
}

function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDate(ts: number): string {
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return "Today";
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// ─── Event icon helper ──────────────────────────────────────────────────────

function eventIcon(kind: JobEvent["kind"]): React.ReactNode {
    switch (kind) {
        case "created":        return <Circle size={10} color="#64748b" />;
        case "started":        return <Play size={10} color="#3b82f6" />;
        case "step:started":   return <ArrowRight size={10} color="#3b82f6" />;
        case "step:completed": return <CheckCircle size={10} color="#10b981" />;
        case "step:failed":    return <XCircle size={10} color="#ef4444" />;
        case "step:skipped":   return <SkipForward size={10} color="#71717a" />;
        case "awaiting-input": return <MessageSquare size={10} color="#f59e0b" />;
        case "input-received": return <MessageSquare size={10} color="#10b981" />;
        case "completed":      return <CheckCircle size={10} color="#10b981" />;
        case "failed":         return <XCircle size={10} color="#ef4444" />;
        case "stopped":        return <StopCircle size={10} color="#ef4444" />;
        default:               return <Circle size={10} color="#52525b" />;
    }
}

// ─── Job Timeline ───────────────────────────────────────────────────────────

function JobTimeline({ timeline, startedAt }: { timeline: JobEvent[]; startedAt?: number }) {
    if (!timeline || timeline.length === 0) return null;
    const origin = startedAt || timeline[0]?.timestamp;
    return (
        <div className="sys-timeline">
            <div className="sys-timeline__label">
                <Clock size={11} /> Timeline ({timeline.length} events)
            </div>
            <div className="sys-timeline__track">
                {timeline.map((evt, i) => {
                    const elapsed = origin ? evt.timestamp - origin : 0;
                    const elapsedStr = elapsed <= 0 ? "0s" : formatDuration(elapsed);
                    return (
                        <div key={i} className={`sys-timeline__event sys-timeline__event--${evt.kind.replace(":", "-")}`}>
                            <div className="sys-timeline__connector">
                                <div className="sys-timeline__dot">{eventIcon(evt.kind)}</div>
                                {i < timeline.length - 1 && <div className="sys-timeline__line" />}
                            </div>
                            <div className="sys-timeline__content">
                                <div className="sys-timeline__event-header">
                                    <span className="sys-timeline__event-label">{evt.label}</span>
                                    <span className="sys-timeline__event-time">
                                        +{elapsedStr}
                                        {evt.duration != null && (
                                            <span className="sys-timeline__event-dur"> · {formatDuration(evt.duration)}</span>
                                        )}
                                    </span>
                                </div>
                                {evt.detail && (
                                    <div className="sys-timeline__event-detail">{evt.detail}</div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Process Card ───────────────────────────────────────────────────────────

function ProcessCard({ job, onStop }: { job: Job; onStop: (id: string) => void }) {
    const [expanded, setExpanded] = useState(false);
    const hasSteps = job.steps && job.steps.length > 0;
    const stepCount = job.steps?.length || 0;
    const completedSteps = job.steps?.filter(s => s.status === "completed").length || 0;
    const currentIdx = job.currentStepIndex ?? -1;
    const progress = stepCount > 0 ? Math.round((completedSteps / stepCount) * 100) : 0;
    const elapsed = job.startedAt ? Date.now() - job.startedAt : (job.updatedAt && job.createdAt ? job.updatedAt - job.createdAt : null);
    const duration = elapsed ? formatDuration(elapsed) : null;
    const isRunning = job.status === "running";
    const hasArtifacts = job.artifacts && job.artifacts.length > 0;
    const storageKeys = job.storage ? Object.keys(job.storage) : [];
    const deliverables = job.deliverables || [];

    return (
        <div className={`sys-process ${expanded ? "sys-process--expanded" : ""}`}>
            {/* Status indicator line */}
            <div className={`sys-process__indicator sys-process__indicator--${job.status}`} />

            <div className="sys-process__body">
                {/* Header row */}
                <div className="sys-process__header" onClick={() => setExpanded(!expanded)}>
                    <div className="sys-process__icon">
                        {isRunning ? (
                            <div className="sys-process__spinner">
                                <Loader size={16} />
                            </div>
                        ) : job.status === "awaiting-input" ? (
                            <GradientIcon icon={Pause} size={16} gradient={["#f59e0b", "#fbbf24"]} />
                        ) : (
                            <GradientIcon icon={Clock} size={16} gradient={["#f59e0b", "#fbbf24"]} />
                        )}
                    </div>
                    <div className="sys-process__info">
                        <div className="sys-process__name">
                            {job.type}
                            {job.mode && <span className="sys-process__mode">{job.mode}</span>}
                            {job.dryRun && <span className="sys-process__tag sys-process__tag--dry">dry run</span>}
                        </div>
                        <div className="sys-process__meta">
                            <CopyableId value={job.id} label="ID" truncate={20} />
                            {duration && (
                                <span className="sys-process__duration">
                                    <Timer size={10} /> {duration}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="sys-process__actions">
                        <span className={`sys-process__status sys-process__status--${job.status}`}>
                            {job.status === "awaiting-input" ? "awaiting input" : job.status}
                        </span>
                        {isRunning && (
                            <button
                                className="sys-process__stop-btn"
                                onClick={e => { e.stopPropagation(); onStop(job.id); }}
                                title="Stop"
                            >
                                <StopCircle size={14} />
                            </button>
                        )}
                        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                </div>

                {/* Progress bar */}
                {hasSteps && (
                    <div className="sys-process__progress">
                        <div className="sys-process__progress-bar">
                            <div
                                className={`sys-process__progress-fill${isRunning ? " sys-process__progress-fill--animated" : ""}`}
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        <span className="sys-process__progress-label">
                            {completedSteps}/{stepCount} · {progress}%
                        </span>
                    </div>
                )}

                {/* Expanded details */}
                {expanded && (
                    <div className="sys-process__detail">
                        {/* Steps */}
                        {hasSteps && (() => {
                            const tree = buildStepTree(job.steps!, job.parallelGroups);
                            return (
                                <div className="sys-process__section">
                                    <div className="sys-process__section-title">
                                        <Terminal size={12} /> Steps
                                        {job.parallelGroups && job.parallelGroups.length > 0 && (
                                            <span className="sys-process__badge"><GitFork size={10} /> mixed</span>
                                        )}
                                        {job.mode === "parallel" && !job.parallelGroups?.length && (
                                            <span className="sys-process__badge"><GitFork size={10} /> parallel</span>
                                        )}
                                    </div>
                                    <div className="sys-process__steps">
                                        {tree.map((node, ni) => {
                                            if (node.kind === "step") {
                                                return <StepRow key={node.step.id || ni} step={node.step} isCurrent={node.idx === currentIdx} />;
                                            }
                                            const groupDone = node.children.filter((c: any) => c.status === "completed").length;
                                            const groupTotal = node.children.length;
                                            return (
                                                <div key={node.group.id} className="sys-process__parallel-group">
                                                    <div className="sys-process__parallel-header">
                                                        <GitFork size={11} />
                                                        <span>{node.group.label}</span>
                                                        <span className="sys-process__parallel-count">{groupDone}/{groupTotal}</span>
                                                    </div>
                                                    <div className="sys-process__parallel-children">
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

                        {/* Storage */}
                        {storageKeys.length > 0 && (
                            <div className="sys-process__section">
                                <div className="sys-process__section-title">
                                    <Database size={12} /> Storage ({storageKeys.length})
                                </div>
                                <div className="sys-process__kv-grid">
                                    {storageKeys.map(key => {
                                        const val = job.storage![key];
                                        const display = typeof val === "string"
                                            ? (val.length > 80 ? val.slice(0, 80) + "…" : val)
                                            : JSON.stringify(val)?.slice(0, 80);
                                        return (
                                            <div key={key} className="sys-process__kv">
                                                <span className="sys-process__kv-key">${key}</span>
                                                <span className="sys-process__kv-val">{display}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Deliverables */}
                        {deliverables.length > 0 && (
                            <div className="sys-process__section">
                                <div className="sys-process__section-title">
                                    <Package size={12} /> Deliverables ({deliverables.length})
                                </div>
                                <div className="sys-process__deliverables">
                                    {deliverables.map(d => {
                                        const populated = !!job.storage?.[`deliverable.${d.key}`];
                                        return (
                                            <div key={d.key} className={`sys-process__deliverable${populated ? " sys-process__deliverable--done" : ""}`}>
                                                {populated ? <CheckCircle size={11} color="#10b981" /> : <Clock size={11} color="#52525b" />}
                                                <span>{d.label}</span>
                                                <span className="sys-process__deliverable-type">{d.type}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Artifacts */}
                        {hasArtifacts && (
                            <div className="sys-process__section">
                                <div className="sys-process__section-title">
                                    <Layers size={12} /> Artifacts ({job.artifacts.length})
                                </div>
                                <div className="sys-process__artifacts">
                                    {job.artifacts.map(a => (
                                        <span key={a.id} className="sys-process__artifact">
                                            <FileText size={10} /> {a.name}
                                            <span className="sys-process__artifact-type">{a.type}</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Timeline */}
                        {job.timeline && job.timeline.length > 0 && (
                            <JobTimeline timeline={job.timeline} startedAt={job.startedAt} />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── History Item ───────────────────────────────────────────────────────────

function HistoryItem({ job }: { job: Job }) {
    const [expanded, setExpanded] = useState(false);
    const duration = job.startedAt && job.completedAt
        ? formatDuration(job.completedAt - job.startedAt)
        : (job.updatedAt && job.createdAt ? formatDuration(job.updatedAt - job.createdAt) : null);
    const hasSteps = job.steps && job.steps.length > 0;
    const stepsDone = job.steps?.filter(s => s.status === "completed").length || 0;
    const hasArtifacts = job.artifacts && job.artifacts.length > 0;
    const hasTimeline = job.timeline && job.timeline.length > 0;

    return (
        <div className={`sys-history-item ${expanded ? "sys-history-item--expanded" : ""}`}>
            <div className={`sys-history-item__indicator sys-history-item__indicator--${job.status}`} />
            <div className="sys-history-item__body">
                <div className="sys-history-item__header" onClick={() => setExpanded(!expanded)}>
                    <div className="sys-history-item__icon">
                        {job.status === "completed"
                            ? <CheckCircle size={14} color="#10b981" />
                            : <AlertCircle size={14} color="#ef4444" />
                        }
                    </div>
                    <div className="sys-history-item__info">
                        <span className="sys-history-item__name">{job.type}</span>
                        <span className="sys-history-item__time">
                            {formatTime(job.updatedAt)}
                            {duration && <> · <Timer size={10} /> {duration}</>}
                        </span>
                    </div>
                    <div className="sys-history-item__right">
                        {hasSteps && (
                            <span className="sys-history-item__steps">
                                {stepsDone}/{job.steps!.length} steps
                            </span>
                        )}
                        {hasArtifacts && (
                            <span className="sys-history-item__artifact-count">
                                <FileText size={10} /> {job.artifacts.length}
                            </span>
                        )}
                        <span className={`sys-history-item__status sys-history-item__status--${job.status}`}>
                            {job.status}
                        </span>
                        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </div>
                </div>

                {job.result && !expanded && (
                    <div className="sys-history-item__result-preview">{job.result.slice(0, 120)}</div>
                )}

                {expanded && (
                    <div className="sys-process__detail">
                        {job.result && (
                            <div className="sys-history-item__result">{job.result}</div>
                        )}
                        <div className="sys-history-item__id-row">
                            <CopyableId value={job.id} label="Job ID" truncate={32} />
                            <span className="sys-history-item__timestamp">
                                {job.startedAt
                                    ? <>Started {new Date(job.startedAt).toLocaleString()}</>
                                    : <>Created {new Date(job.createdAt).toLocaleString()}</>
                                }
                                {job.completedAt && (
                                    <> · Ended {new Date(job.completedAt).toLocaleTimeString()}</>
                                )}
                            </span>
                        </div>

                        {hasSteps && (() => {
                            const tree = buildStepTree(job.steps!, job.parallelGroups);
                            return (
                                <div className="sys-process__section">
                                    <div className="sys-process__section-title">
                                        <Terminal size={12} /> Steps
                                    </div>
                                    <div className="sys-process__steps">
                                        {tree.map((node, ni) => {
                                            if (node.kind === "step") {
                                                return <StepRow key={node.step.id || ni} step={node.step} />;
                                            }
                                            const groupDone = node.children.filter((c: any) => c.status === "completed").length;
                                            return (
                                                <div key={node.group.id} className="sys-process__parallel-group">
                                                    <div className="sys-process__parallel-header">
                                                        <GitFork size={11} />
                                                        <span>{node.group.label}</span>
                                                        <span className="sys-process__parallel-count">{groupDone}/{node.children.length}</span>
                                                    </div>
                                                    <div className="sys-process__parallel-children">
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

                        {hasArtifacts && (
                            <div className="sys-process__section">
                                <div className="sys-process__section-title">
                                    <Layers size={12} /> Artifacts ({job.artifacts.length})
                                </div>
                                <div className="sys-process__artifacts">
                                    {job.artifacts.map(a => (
                                        <span key={a.id} className="sys-process__artifact">
                                            <FileText size={10} /> {a.name}
                                            <span className="sys-process__artifact-type">{a.type}</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Timeline */}
                        {hasTimeline && (
                            <JobTimeline timeline={job.timeline!} startedAt={job.startedAt} />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Main System View ───────────────────────────────────────────────────────

export function SystemView() {
    const [activeTab, setActiveTab] = useState<SystemTab>("processes");
    const [historyFilter, setHistoryFilter] = useState("");
    const [historyStatus, setHistoryStatus] = useState<"all" | "completed" | "failed">("all");
    const [configFilter, setConfigFilter] = useState("");
    const [expandedConfigToolkit, setExpandedConfigToolkit] = useState<string | null>(null);
    const { jobs, isPaused, toggleQueuePause, stopJob, removeJob, clearJobs } = useJobsContext();
    const { automations, runs } = useAutomations();
    const { getFieldValue, setFieldValue, resetFieldValue } = useToolkitConfiguration();
    const del = useDeleteConfirm();

    // Derived lists
    const activeJobs = useMemo(() =>
        jobs.filter(j => j.status === "running" || j.status === "queued" || j.status === "awaiting-input"),
        [jobs]
    );

    const queuedJobs = useMemo(() =>
        jobs.filter(j => j.status === "queued"),
        [jobs]
    );

    const runningJobs = useMemo(() =>
        jobs.filter(j => j.status === "running"),
        [jobs]
    );

    const historyJobs = useMemo(() =>
        jobs
            .filter(j => j.status === "completed" || j.status === "failed")
            .filter(j => historyStatus === "all" || j.status === historyStatus)
            .filter(j =>
                historyFilter === "" ||
                j.type.toLowerCase().includes(historyFilter.toLowerCase()) ||
                j.id.toLowerCase().includes(historyFilter.toLowerCase()) ||
                (j.result && j.result.toLowerCase().includes(historyFilter.toLowerCase()))
            ),
        [jobs, historyStatus, historyFilter]
    );

    // Group history by date
    const historyGrouped = useMemo(() => {
        const groups: { day: string; jobs: Job[] }[] = [];
        let currentDay = "";
        for (const job of historyJobs) {
            const day = formatDate(job.updatedAt);
            if (day !== currentDay) {
                currentDay = day;
                groups.push({ day, jobs: [job] });
            } else {
                groups[groups.length - 1].jobs.push(job);
            }
        }
        return groups;
    }, [historyJobs]);

    const runningAutomations = useMemo(() =>
        runs.filter(r => r.status === "running"),
        [runs]
    );

    const toolkitsWithConfig = useMemo(
        () => TOOLKITS
            .map((toolkit) => ({
                toolkit,
                module: toolkitRegistry.get(toolkit.id),
            }))
            .filter(
                (entry) =>
                    entry.module?.configuration &&
                    entry.module.configuration.fields.length > 0,
            ),
        [],
    );

    const filteredToolkitsWithConfig = useMemo(() => {
        const q = configFilter.trim().toLowerCase();
        if (!q) return toolkitsWithConfig;

        return toolkitsWithConfig.filter(({ toolkit, module }) => {
            const fields = module?.configuration?.fields || [];
            return (
                toolkit.name.toLowerCase().includes(q) ||
                toolkit.id.toLowerCase().includes(q) ||
                fields.some(
                    (field) =>
                        field.key.toLowerCase().includes(q) ||
                        field.label.toLowerCase().includes(q),
                )
            );
        });
    }, [toolkitsWithConfig, configFilter]);

    const configFieldCount = useMemo(
        () => toolkitsWithConfig.reduce(
            (sum, { module }) => sum + (module?.configuration?.fields.length || 0),
            0,
        ),
        [toolkitsWithConfig],
    );

    const tabCounts = {
        processes: activeJobs.length + runningAutomations.length,
        queue: queuedJobs.length,
        history: historyJobs.length,
        configuration: configFieldCount,
    };

    return (
        <div className="system-view">
            {/* ── Header ── */}
            <div className="system-view__header">
                <div className="system-view__header-left">
                    <GradientIcon icon={Monitor} size={22} gradient={["#64748b", "#94a3b8"]} />
                    <div>
                        <h1 className="system-view__title">System</h1>
                        <div className="system-view__subtitle">
                            {runningJobs.length} running · {queuedJobs.length} queued · {automations.length} automations
                        </div>
                    </div>
                </div>
                <div className="system-view__header-actions">
                    <button
                        onClick={toggleQueuePause}
                        className={`system-view__pause-btn ${isPaused ? "system-view__pause-btn--paused" : ""}`}
                        title={isPaused ? "Resume queue" : "Pause queue"}
                    >
                        {isPaused ? <Play size={12} /> : <Pause size={12} />}
                        {isPaused ? "Resume" : "Pause"}
                    </button>
                </div>
            </div>

            {/* ── Stat Cards ── */}
            <div className="system-view__stats">
                <div className="system-view__stat system-view__stat--running">
                    <div className="system-view__stat-icon">
                        <Loader size={16} />
                    </div>
                    <div className="system-view__stat-value">{runningJobs.length}</div>
                    <div className="system-view__stat-label">Running</div>
                </div>
                <div className="system-view__stat system-view__stat--queued">
                    <div className="system-view__stat-icon">
                        <Clock size={16} />
                    </div>
                    <div className="system-view__stat-value">{queuedJobs.length}</div>
                    <div className="system-view__stat-label">Queued</div>
                </div>
                <div className="system-view__stat system-view__stat--automations">
                    <div className="system-view__stat-icon">
                        <Zap size={16} />
                    </div>
                    <div className="system-view__stat-value">{automations.length}</div>
                    <div className="system-view__stat-label">Automations</div>
                </div>
                <div className="system-view__stat system-view__stat--completed">
                    <div className="system-view__stat-icon">
                        <CheckCircle size={16} />
                    </div>
                    <div className="system-view__stat-value">{jobs.filter(j => j.status === "completed").length}</div>
                    <div className="system-view__stat-label">Completed</div>
                </div>
            </div>

            {/* ── Tab Bar ── */}
            <div className="system-view__tabs">
                {(["processes", "queue", "history", "configuration"] as SystemTab[]).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`system-view__tab ${activeTab === tab ? "system-view__tab--active" : ""}`}
                    >
                        {tab === "processes" && <Activity size={13} />}
                        {tab === "queue" && <Clock size={13} />}
                        {tab === "history" && <Terminal size={13} />}
                        {tab === "configuration" && <Settings size={13} />}
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        {tabCounts[tab] > 0 && (
                            <span className={`system-view__tab-badge ${activeTab === tab ? "system-view__tab-badge--active" : ""}`}>
                                {tabCounts[tab]}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* ── Content ── */}
            <div className="system-view__content">

                {/* ═══ PROCESSES TAB ═══ */}
                {activeTab === "processes" && (
                    <div className="system-view__panel">
                        {activeJobs.length === 0 && runningAutomations.length === 0 ? (
                            <div className="system-view__empty">
                                <GradientIcon icon={Activity} size={40} gradient={["#64748b", "#94a3b8"]} />
                                <div className="system-view__empty-title">No Active Processes</div>
                                <div className="system-view__empty-desc">
                                    Running jobs, automations, and AI tasks will appear here in real time.
                                </div>
                            </div>
                        ) : (
                            <div className="system-view__process-list">
                                {/* Running automations */}
                                {runningAutomations.length > 0 && (
                                    <div className="system-view__section">
                                        <div className="system-view__section-header">
                                            <Zap size={13} color="#fbbf24" />
                                            <span>Automations Running</span>
                                            <span className="system-view__section-count">{runningAutomations.length}</span>
                                        </div>
                                        {runningAutomations.map(run => {
                                            const def = automations.find(a => a.id === run.automationId);
                                            return (
                                                <div key={run.id} className="sys-process sys-process--automation">
                                                    <div className="sys-process__indicator sys-process__indicator--running" />
                                                    <div className="sys-process__body">
                                                        <div className="sys-process__header">
                                                            <div className="sys-process__icon">
                                                                <div className="sys-process__spinner">
                                                                    <Zap size={14} />
                                                                </div>
                                                            </div>
                                                            <div className="sys-process__info">
                                                                <div className="sys-process__name">{def?.name || run.automationId}</div>
                                                                <div className="sys-process__meta">
                                                                    Started {new Date(run.startTime).toLocaleTimeString()}
                                                                </div>
                                                            </div>
                                                            <span className="sys-process__status sys-process__status--running">running</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Active jobs */}
                                {activeJobs.length > 0 && (
                                    <div className="system-view__section">
                                        <div className="system-view__section-header">
                                            <Activity size={13} color="#3b82f6" />
                                            <span>Jobs</span>
                                            <span className="system-view__section-count">{activeJobs.length}</span>
                                        </div>
                                        {activeJobs.map(job => (
                                            <ProcessCard key={job.id} job={job} onStop={stopJob} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* ═══ QUEUE TAB ═══ */}
                {activeTab === "queue" && (
                    <div className="system-view__panel">
                        {/* Queue controls */}
                        <div className="system-view__queue-controls">
                            <div className="system-view__queue-status">
                                <span className={`system-view__queue-indicator ${isPaused ? "system-view__queue-indicator--paused" : ""}`} />
                                Queue {isPaused ? "Paused" : "Active"}
                            </div>
                            {queuedJobs.length > 0 && (
                                <div className="system-view__queue-actions">
                                    {del.isPending("clear-queue") ? (
                                        <DeleteConfirmInline
                                            entityName="Queue"
                                            warning="All queued jobs will be removed."
                                            onConfirm={() => del.confirm(() => queuedJobs.forEach(j => removeJob(j.id)))}
                                            onCancel={del.cancel}
                                            compact
                                        />
                                    ) : (
                                        <button
                                            onClick={() => del.requestDelete("clear-queue")}
                                            className="system-view__queue-clear-btn"
                                        >
                                            <Trash2 size={11} /> Clear Queue
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {queuedJobs.length === 0 ? (
                            <div className="system-view__empty">
                                <GradientIcon icon={Clock} size={40} gradient={["#64748b", "#94a3b8"]} />
                                <div className="system-view__empty-title">Queue Empty</div>
                                <div className="system-view__empty-desc">
                                    Jobs waiting to execute will appear here. You can pause, reorder, and manage the queue.
                                </div>
                            </div>
                        ) : (
                            <div className="system-view__queue-list">
                                {queuedJobs.map((job, idx) => (
                                    <div key={job.id} className="sys-queue-item">
                                        <span className="sys-queue-item__position">{idx + 1}</span>
                                        <div className="sys-queue-item__info">
                                            <div className="sys-queue-item__name">{job.type}</div>
                                            <div className="sys-queue-item__meta">
                                                <CopyableId value={job.id} label="ID" truncate={16} />
                                                <span className="sys-queue-item__time">
                                                    Added {formatTime(job.createdAt)}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="sys-queue-item__actions">
                                            {job.steps && (
                                                <span className="sys-queue-item__steps">{job.steps.length} steps</span>
                                            )}
                                            <button
                                                className="sys-queue-item__remove"
                                                onClick={() => removeJob(job.id)}
                                                title="Remove from queue"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Also show running jobs in queue view as "currently executing" */}
                        {runningJobs.length > 0 && (
                            <div className="system-view__section" style={{ marginTop: "var(--space-2xl)" }}>
                                <div className="system-view__section-header">
                                    <Loader size={13} color="#3b82f6" />
                                    <span>Currently Executing</span>
                                    <span className="system-view__section-count">{runningJobs.length}</span>
                                </div>
                                {runningJobs.map(job => (
                                    <ProcessCard key={job.id} job={job} onStop={stopJob} />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ═══ HISTORY TAB ═══ */}
                {activeTab === "history" && (
                    <div className="system-view__panel">
                        {/* Search & filter bar */}
                        <div className="system-view__history-toolbar">
                            <div className="system-view__history-search">
                                <Search size={13} />
                                <input
                                    type="text"
                                    placeholder="Search history..."
                                    value={historyFilter}
                                    onChange={e => setHistoryFilter(e.target.value)}
                                    className="system-view__history-input"
                                />
                            </div>
                            <div className="system-view__history-filters">
                                {(["all", "completed", "failed"] as const).map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setHistoryStatus(s)}
                                        className={`system-view__filter-btn ${historyStatus === s ? "system-view__filter-btn--active" : ""}`}
                                    >
                                        {s === "completed" && <CheckCircle size={11} />}
                                        {s === "failed" && <AlertCircle size={11} />}
                                        {s.charAt(0).toUpperCase() + s.slice(1)}
                                    </button>
                                ))}
                            </div>
                            {historyJobs.length > 0 && (
                                <span className="system-view__history-count">
                                    {historyJobs.length} {historyJobs.length === 1 ? "job" : "jobs"}
                                </span>
                            )}
                        </div>

                        {historyJobs.length === 0 ? (
                            <div className="system-view__empty">
                                <GradientIcon icon={Terminal} size={40} gradient={["#64748b", "#94a3b8"]} />
                                <div className="system-view__empty-title">No History</div>
                                <div className="system-view__empty-desc">
                                    Completed and failed jobs will appear here as a searchable log.
                                </div>
                            </div>
                        ) : (
                            <div className="system-view__history-list">
                                {historyGrouped.map((group, gi) => (
                                    <div key={group.day + gi} className="system-view__history-group">
                                        <div className="system-view__history-day">
                                            <span className="system-view__history-day-label">{group.day}</span>
                                            <div className="system-view__history-day-line" />
                                            <span className="system-view__history-day-count">
                                                {group.jobs.length} {group.jobs.length === 1 ? "job" : "jobs"}
                                            </span>
                                        </div>
                                        {group.jobs.map(job => (
                                            <HistoryItem key={job.id} job={job} />
                                        ))}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ═══ CONFIGURATION TAB ═══ */}
                {activeTab === "configuration" && (
                    <div className="system-view__panel">
                        <div className="system-view__history-toolbar">
                            <div className="system-view__history-search">
                                <Search size={13} />
                                <input
                                    type="text"
                                    placeholder="Search toolkits or config fields..."
                                    value={configFilter}
                                    onChange={e => setConfigFilter(e.target.value)}
                                    className="system-view__history-input"
                                />
                            </div>
                            <span className="system-view__history-count">
                                {toolkitsWithConfig.length} toolkits · {configFieldCount} fields
                            </span>
                        </div>

                        {filteredToolkitsWithConfig.length === 0 ? (
                            <div className="system-view__empty">
                                <GradientIcon icon={Settings} size={40} gradient={["#64748b", "#94a3b8"]} />
                                <div className="system-view__empty-title">No Matching Configuration</div>
                                <div className="system-view__empty-desc">
                                    Try a different search term or add configuration fields to a toolkit module.
                                </div>
                            </div>
                        ) : (
                            <div className="system-view__config-list">
                                {filteredToolkitsWithConfig.map(({ toolkit, module }) => {
                                    if (!module?.configuration) return null;
                                    const fields = module.configuration.fields;
                                    const isExpanded = expandedConfigToolkit === toolkit.id;
                                    const customizedCount = fields.filter((field) => {
                                        const value = getFieldValue(toolkit.id, field);
                                        return value !== undefined && value !== field.defaultValue;
                                    }).length;

                                    return (
                                        <div key={toolkit.id} className="system-view__config-card">
                                            <button
                                                className="system-view__config-header"
                                                onClick={() => setExpandedConfigToolkit(isExpanded ? null : toolkit.id)}
                                            >
                                                <div className="system-view__config-header-meta">
                                                    <div className="system-view__config-name">{toolkit.name}</div>
                                                    <div className="system-view__config-subtitle">
                                                        {fields.length} fields
                                                        {customizedCount > 0 && ` · ${customizedCount} customized`}
                                                    </div>
                                                </div>
                                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                            </button>

                                            {isExpanded && (
                                                <div className="system-view__config-fields">
                                                    {fields.map((field) => (
                                                        <ConfigurationItem
                                                            key={`${toolkit.id}:${field.key}`}
                                                            field={field}
                                                            value={getFieldValue(toolkit.id, field)}
                                                            onChange={(value) => setFieldValue(toolkit.id, field.key, value)}
                                                            onReset={() => resetFieldValue(toolkit.id, field)}
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
