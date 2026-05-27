import { useState, useMemo } from "react";
import {
    Monitor, Activity, Clock, Zap, Loader, CheckCircle, AlertCircle,
    Pause, Play, ChevronDown, ChevronUp,
    Terminal, Search, Trash2, Settings,
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
import { formatTime, formatDate } from "./system/helpers";
import { ProcessCard } from "./system/ProcessCard";
import { HistoryItem } from "./system/HistoryItem";
import "../../styles/components/system-view.css";

type SystemTab = "processes" | "queue" | "history" | "configuration";


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
