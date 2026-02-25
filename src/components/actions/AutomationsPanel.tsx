import { useState } from "react";
import { LayoutGrid, List, PlayCircle, Trash2, Clock, Activity, Zap } from "lucide-react";
import { useAutomations } from "../../context/AutomationsContext";
import { AutomationCard } from "../automations/AutomationCard";
import "../../styles/components/automations-panel.css";

export function AutomationsPanel() {
    const { automations, runs, runAutomation, deleteAutomation } = useAutomations();
    const [view, setView] = useState<"cards" | "table">("cards");
    const [filter, setFilter] = useState("");
    const [logTarget, setLogTarget] = useState<string | null>(null);

    const filtered = automations.filter(a =>
        a.name.toLowerCase().includes(filter.toLowerCase()) ||
        a.description.toLowerCase().includes(filter.toLowerCase()) ||
        a.tags.some(t => t.toLowerCase().includes(filter.toLowerCase()))
    );

    const getLastRun = (autoId: string) =>
        runs.filter(r => r.automationId === autoId).sort((a, b) =>
            new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
        )[0];

    const isRunning = (autoId: string) =>
        runs.some(r => r.automationId === autoId && r.status === "running");

    return (
        <div className="automations-panel">
            {/* Toolbar */}
            <div className="automations-panel__toolbar">
                <input
                    className="automations-panel__search"
                    placeholder="Search automations..."
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                />
                <div className="automations-panel__view-toggle">
                    <button
                        onClick={() => setView("cards")}
                        className={`automations-panel__view-btn${view === "cards" ? " automations-panel__view-btn--active" : ""}`}
                        title="Card view"
                    >
                        <LayoutGrid size={12} />
                    </button>
                    <button
                        onClick={() => setView("table")}
                        className={`automations-panel__view-btn${view === "table" ? " automations-panel__view-btn--active" : ""}`}
                        title="Table view"
                    >
                        <List size={12} />
                    </button>
                </div>
                <span className="automations-panel__count">
                    {filtered.length} automation{filtered.length !== 1 ? "s" : ""}
                </span>
            </div>

            {/* Card View */}
            {view === "cards" && (
                <div className="automations-panel__grid">
                    {filtered.map(auto => (
                        <AutomationCard
                            key={auto.id}
                            automation={auto}
                            lastRun={getLastRun(auto.id)}
                            onRun={runAutomation}
                            onViewLogs={(id) => setLogTarget(logTarget === id ? null : id)}
                            isRunning={isRunning(auto.id)}
                        />
                    ))}
                </div>
            )}

            {/* Table View */}
            {view === "table" && (
                <div className="automations-panel__table-wrap">
                    <table className="automations-panel__table">
                        <thead>
                            <tr>
                                <th className="automations-panel__th">Name</th>
                                <th className="automations-panel__th">Description</th>
                                <th className="automations-panel__th">Schedule</th>
                                <th className="automations-panel__th">Tags</th>
                                <th className="automations-panel__th automations-panel__th--status">Status</th>
                                <th className="automations-panel__th automations-panel__th--last-run">Last Run</th>
                                <th className="automations-panel__th automations-panel__th--actions"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(auto => {
                                const lastRun = getLastRun(auto.id);
                                const running = isRunning(auto.id);
                                const statusColor = running
                                    ? "#38bdf8"
                                    : lastRun?.status === "completed"
                                        ? "#10b981"
                                        : lastRun?.status === "failed"
                                            ? "#ef4444"
                                            : "var(--text-ghost)";
                                return (
                                    <tr key={auto.id} className="automations-panel__row">
                                        <td className="automations-panel__td automations-panel__td--name">
                                            <div className="automations-panel__name-cell">
                                                <Activity size={13} color="#38bdf8" />
                                                <span>{auto.name}</span>
                                            </div>
                                        </td>
                                        <td className="automations-panel__td automations-panel__td--desc">
                                            {auto.description}
                                        </td>
                                        <td className="automations-panel__td automations-panel__td--schedule">
                                            {auto.schedule || "Manual"}
                                        </td>
                                        <td className="automations-panel__td automations-panel__td--tags">
                                            <div className="automations-panel__tag-list">
                                                {auto.tags.map(tag => (
                                                    <span key={tag} className="automations-panel__tag">#{tag}</span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="automations-panel__td automations-panel__td--status-cell">
                                            <span
                                                className="automations-panel__status-badge"
                                                style={{ color: statusColor, borderColor: `${statusColor}30`, background: `${statusColor}10` }}
                                            >
                                                {running ? "running" : lastRun?.status || "idle"}
                                            </span>
                                        </td>
                                        <td className="automations-panel__td automations-panel__td--last-run">
                                            <span className="automations-panel__time">
                                                <Clock size={10} />
                                                {lastRun ? new Date(lastRun.endTime || lastRun.startTime).toLocaleString() : "Never"}
                                            </span>
                                        </td>
                                        <td className="automations-panel__td automations-panel__td--actions">
                                            <div className="automations-panel__action-btns">
                                                <button
                                                    onClick={() => runAutomation(auto.id)}
                                                    disabled={running}
                                                    className="automations-panel__action-btn automations-panel__action-btn--run"
                                                    title="Run now"
                                                >
                                                    <PlayCircle size={14} />
                                                </button>
                                                <button
                                                    onClick={() => deleteAutomation(auto.id)}
                                                    className="automations-panel__action-btn automations-panel__action-btn--delete"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {filtered.length === 0 && (
                <div className="automations-panel__empty">
                    <Zap size={32} className="automations-panel__empty-icon" />
                    <div className="automations-panel__empty-title">No Automations</div>
                    <div className="automations-panel__empty-desc">
                        {filter ? `No automations match "${filter}"` : "Create an automation in the Builder tab."}
                    </div>
                </div>
            )}
        </div>
    );
}
