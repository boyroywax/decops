import { useState, useMemo } from "react";
import {
    Monitor, Activity, Clock, Zap, Loader, CheckCircle, AlertCircle,
    Pause, Play, ChevronDown, ChevronUp,
    Terminal, Search, Trash2, Settings, PlayCircle, History,
} from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import { CopyableId } from "@/components/shared/CopyableId";
import { useJobsContext } from "@/context/JobsContext";
import { useAutomations } from "@/context/AutomationsContext";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { DeleteConfirmInline } from "@/components/shared/DeleteConfirmInline";
import type { Job } from "@/types";
import { TOOLKITS, toolkitRegistry } from "@/services/toolkits";
import { useToolkitConfiguration } from "@/hooks/useToolkitConfiguration";
import { ConfigurationItem } from "@/components/config/ConfigurationItem";
import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { formatTime, formatDate } from "./system/helpers";
import { ProcessCard } from "./system/ProcessCard";
import { HistoryItem } from "./system/HistoryItem";
import "../../styles/components/system-view.css";

// Tab identifiers. Order matches the rendered tab bar.
type SystemTab = "running" | "queued" | "automations" | "completed" | "configuration";


// ─── Main System View ───────────────────────────────────────────────────────

export function SystemView() {
    const [activeTab, setActiveTab] = useState<SystemTab>("running");
    const [historyFilter, setHistoryFilter] = useState("");
    const [historyStatus, setHistoryStatus] = useState<"all" | "completed" | "failed">("all");
    const [historyGroupedByDay, setHistoryGroupedByDay] = useState(true);
    const [configFilter, setConfigFilter] = useState("");
    const [expandedConfigToolkit, setExpandedConfigToolkit] = useState<string | null>(null);
    const [automationsFilter, setAutomationsFilter] = useState("");
    const { jobs, isPaused, toggleQueuePause, stopJob, removeJob } = useJobsContext();
    const { automations, runs, runAutomation } = useAutomations();
    const { getFieldValue, setFieldValue, resetFieldValue } = useToolkitConfiguration();
    const del = useDeleteConfirm();

    // ─── Derived lists ───────────────────────────────────────────────────

    const queuedJobs = useMemo(() =>
        jobs.filter(j => j.status === "queued"),
        [jobs]
    );

    const runningJobs = useMemo(() =>
        jobs.filter(j => j.status === "running" || j.status === "awaiting-input"),
        [jobs]
    );

    const runningAutomations = useMemo(() =>
        runs.filter(r => r.status === "running"),
        [runs]
    );

    const completedRuns = useMemo(() =>
        runs.filter(r => r.status !== "running"),
        [runs]
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

    const filteredAutomations = useMemo(() => {
        const q = automationsFilter.trim().toLowerCase();
        if (!q) return automations;
        return automations.filter((a) =>
            a.name.toLowerCase().includes(q) ||
            a.id.toLowerCase().includes(q) ||
            (a.description ?? "").toLowerCase().includes(q) ||
            a.tags.some((t) => t.toLowerCase().includes(q))
        );
    }, [automations, automationsFilter]);

    const runsByAutomation = useMemo(() => {
        const map = new Map<string, typeof runs>();
        for (const r of runs) {
            if (!map.has(r.automationId)) map.set(r.automationId, []);
            map.get(r.automationId)!.push(r);
        }
        // newest first
        for (const list of map.values()) {
            list.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
        }
        return map;
    }, [runs]);

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

    const completedCount = useMemo(
        () => jobs.filter((j) => j.status === "completed" || j.status === "failed").length,
        [jobs],
    );

    const tabCounts: Record<SystemTab, number> = {
        running:        runningJobs.length + runningAutomations.length,
        queued:         queuedJobs.length,
        automations:    automations.length,
        completed:      completedCount,
        configuration:  configFieldCount,
    };

    const TAB_DEFS: { id: SystemTab; label: string; icon: typeof Activity }[] = [
        { id: "running",       label: "Running",       icon: Activity },
        { id: "queued",        label: "Queued",        icon: Clock },
        { id: "automations",   label: "Automations",   icon: Zap },
        { id: "completed",     label: "Completed",     icon: Terminal },
        { id: "configuration", label: "Configuration", icon: Settings },
    ];

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
                {TAB_DEFS.map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        onClick={() => setActiveTab(id)}
                        className={`system-view__tab ${activeTab === id ? "system-view__tab--active" : ""}`}
                    >
                        <Icon size={13} />
                        {label}
                        {tabCounts[id] > 0 && (
                            <span className={`system-view__tab-badge ${activeTab === id ? "system-view__tab-badge--active" : ""}`}>
                                {tabCounts[id]}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* ── Content ── */}
            <div className="system-view__content">

                {/* ═══ RUNNING TAB ═══ */}
                {activeTab === "running" && (
                    <div className="system-view__panel">
                        {runningJobs.length === 0 && runningAutomations.length === 0 ? (
                            <div className="system-view__empty">
                                <GradientIcon icon={Activity} size={40} gradient={["#64748b", "#94a3b8"]} />
                                <div className="system-view__empty-title">No Active Processes</div>
                                <div className="system-view__empty-desc">
                                    Running jobs, automations, and AI tasks will appear here in real time.
                                </div>
                            </div>
                        ) : (
                            <div className="system-view__process-list">
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

                                {runningJobs.length > 0 && (
                                    <div className="system-view__section">
                                        <div className="system-view__section-header">
                                            <Activity size={13} color="#3b82f6" />
                                            <span>Jobs</span>
                                            <span className="system-view__section-count">{runningJobs.length}</span>
                                        </div>
                                        {runningJobs.map(job => (
                                            <ProcessCard key={job.id} job={job} onStop={stopJob} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="system-view__activity-section">
                            <ActivityFeed
                                title="Live activity — running jobs & automations"
                                baseFilter={{
                                    sources: ["jobs", "automations"],
                                    kinds: ["jobLifecycle", "automation"],
                                }}
                                emptyMessage="Lifecycle events will stream here as jobs and automations start, progress, and finish."
                                defaultTimeRange="1h"
                            />
                        </div>
                    </div>
                )}

                {/* ═══ QUEUED TAB ═══ */}
                {activeTab === "queued" && (
                    <div className="system-view__panel">
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

                        <div className="system-view__activity-section">
                            <ActivityFeed
                                title="Queue activity"
                                baseFilter={{
                                    sources: ["jobs"],
                                    channels: ["lifecycle.queued"],
                                }}
                                emptyMessage="Events for newly-queued jobs will appear here."
                                defaultTimeRange="24h"
                            />
                        </div>
                    </div>
                )}

                {/* ═══ AUTOMATIONS TAB ═══ */}
                {activeTab === "automations" && (
                    <div className="system-view__panel">
                        <div className="system-view__history-toolbar">
                            <div className="system-view__history-search">
                                <Search size={13} />
                                <input
                                    type="text"
                                    placeholder="Search automations by name, id, tag…"
                                    value={automationsFilter}
                                    onChange={(e) => setAutomationsFilter(e.target.value)}
                                    className="system-view__history-input"
                                />
                            </div>
                            <span className="system-view__history-count">
                                {filteredAutomations.length} of {automations.length}
                                {runningAutomations.length > 0 && ` · ${runningAutomations.length} running`}
                            </span>
                        </div>

                        {filteredAutomations.length === 0 ? (
                            <div className="system-view__empty">
                                <GradientIcon icon={Zap} size={40} gradient={["#64748b", "#94a3b8"]} />
                                <div className="system-view__empty-title">
                                    {automations.length === 0 ? "No Automations Registered" : "No Matching Automations"}
                                </div>
                                <div className="system-view__empty-desc">
                                    {automations.length === 0
                                        ? "Define automations in the Automations view to schedule and orchestrate work."
                                        : "Try a different search term."}
                                </div>
                            </div>
                        ) : (
                            <div className="system-view__automation-list">
                                {filteredAutomations.map((def) => {
                                    const defRuns = runsByAutomation.get(def.id) ?? [];
                                    const lastRun = defRuns[0];
                                    const isRunning = defRuns.some((r) => r.status === "running");
                                    return (
                                        <div key={def.id} className="sys-automation">
                                            <div className="sys-automation__main">
                                                <div className="sys-automation__icon">
                                                    <Zap size={14} color={isRunning ? "#fbbf24" : "#64748b"} />
                                                </div>
                                                <div className="sys-automation__info">
                                                    <div className="sys-automation__name">{def.name}</div>
                                                    <div className="sys-automation__meta">
                                                        <span className="sys-automation__type">{def.type}</span>
                                                        {def.tags.slice(0, 4).map((t) => (
                                                            <span key={t} className="sys-automation__tag">{t}</span>
                                                        ))}
                                                        {def.schedule && (
                                                            <span className="sys-automation__schedule">
                                                                <Clock size={10} /> {def.schedule}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {def.description && (
                                                        <div className="sys-automation__desc">{def.description}</div>
                                                    )}
                                                </div>
                                                <div className="sys-automation__actions">
                                                    <span className="sys-automation__runs-count">
                                                        <History size={10} /> {defRuns.length}
                                                    </span>
                                                    <button
                                                        className="sys-automation__run-btn"
                                                        onClick={() => runAutomation(def.id)}
                                                        disabled={isRunning}
                                                        title={isRunning ? "Automation is already running" : "Run now"}
                                                    >
                                                        {isRunning ? <Loader size={11} /> : <PlayCircle size={11} />}
                                                        {isRunning ? "Running…" : "Run"}
                                                    </button>
                                                </div>
                                            </div>
                                            {lastRun && (
                                                <div className="sys-automation__last-run">
                                                    <span className={`sys-automation__run-status sys-automation__run-status--${lastRun.status}`}>
                                                        {lastRun.status}
                                                    </span>
                                                    <span className="sys-automation__run-time">
                                                        {new Date(lastRun.startTime).toLocaleString()}
                                                    </span>
                                                    {lastRun.error && (
                                                        <span className="sys-automation__run-error" title={lastRun.error}>
                                                            <AlertCircle size={10} /> {lastRun.error.slice(0, 80)}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div className="system-view__activity-section">
                            <ActivityFeed
                                title={`Automation activity${completedRuns.length > 0 ? ` · ${completedRuns.length} historical run${completedRuns.length === 1 ? "" : "s"}` : ""}`}
                                baseFilter={{ sources: ["automations"] }}
                                emptyMessage="Automation start/finish/failure events will appear here."
                                defaultTimeRange="24h"
                            />
                        </div>
                    </div>
                )}

                {/* ═══ COMPLETED TAB ═══ */}
                {activeTab === "completed" && (
                    <div className="system-view__panel">
                        <div className="system-view__history-toolbar">
                            <div className="system-view__history-search">
                                <Search size={13} />
                                <input
                                    type="text"
                                    placeholder="Search completed jobs…"
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
                                <button
                                    onClick={() => setHistoryGroupedByDay(v => !v)}
                                    className={`system-view__filter-btn ${historyGroupedByDay ? "system-view__filter-btn--active" : ""}`}
                                    title={historyGroupedByDay ? "Switch to flat list" : "Group by day"}
                                >
                                    {historyGroupedByDay ? "Grouped" : "Flat"}
                                </button>
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
                        ) : historyGroupedByDay ? (
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
                        ) : (
                            <div className="system-view__history-list">
                                {historyJobs.map(job => (
                                    <HistoryItem key={job.id} job={job} />
                                ))}
                            </div>
                        )}

                        <div className="system-view__activity-section">
                            <ActivityFeed
                                title="Completion activity"
                                baseFilter={{
                                    sources: ["jobs", "automations"],
                                    channels: [
                                        "lifecycle.completed",
                                        "lifecycle.failed",
                                        "run.completed",
                                        "run.failed",
                                    ],
                                }}
                                emptyMessage="Completion and failure events from jobs and automations will appear here."
                                defaultTimeRange="24h"
                                defaultGrouped
                            />
                        </div>
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
