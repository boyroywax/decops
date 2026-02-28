import { useState } from "react";
import { LayoutGrid, List, PlayCircle, Trash2, Edit, Clock, Activity, Zap } from "lucide-react";
import { useAutomations } from "../../context/AutomationsContext";
import { useStudioContext } from "../../context/StudioContext";
import { AutomationCard } from "../automations/AutomationCard";
import type { AutomationDefinition, DeclarativeAutomationDefinition } from "../../services/automations/types";
import type { ViewId } from "../../types";
import { useDeleteConfirm } from "../../hooks/useDeleteConfirm";
import { DeleteConfirmInline } from "../shared/DeleteConfirmInline";
import "../../styles/components/automations-panel.css";

interface AutomationsPanelProps {
    setView?: (view: ViewId) => void;
}

export function AutomationsPanel({ setView }: AutomationsPanelProps) {
    const { automations, runs, runAutomation, deleteAutomation } = useAutomations();
    const { api: studioApi } = useStudioContext();
    const [layoutView, setLayoutView] = useState<"cards" | "table">("cards");
    const [filter, setFilter] = useState("");
    const [logTarget, setLogTarget] = useState<string | null>(null);
    const del = useDeleteConfirm();

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

    /** Convert a declarative automation to a temp job def and load it in Studio */
    const handleEditInStudio = (auto: AutomationDefinition) => {
        if (auto.type !== "declarative") return;
        const decl = auto as DeclarativeAutomationDefinition;
        // Navigate to Studio view
        if (setView) setView("jobs" as ViewId);
        setTimeout(() => {
            if (studioApi) {
                studioApi.clearCanvas();
                studioApi.setName(auto.name);
                studioApi.setDescription(auto.description);
                for (const step of decl.steps) {
                    const stepId = studioApi.addStep(step.commandId);
                    for (const [argKey, argVal] of Object.entries(step.args)) {
                        studioApi.updateStepArg(stepId, argKey, argVal);
                    }
                    if (step.condition) {
                        studioApi.updateStepPreCondition(stepId, step.condition);
                    }
                }
                // Add deliverables
                if (decl.deliverables) {
                    for (const d of decl.deliverables) {
                        studioApi.addDeliverableEntry(d);
                    }
                }
                // Add storage
                if (decl.storageDefaults) {
                    for (const [k, v] of Object.entries(decl.storageDefaults)) {
                        studioApi.addStorageEntryWithValues(k, typeof v === "string" ? v : JSON.stringify(v ?? ""));
                    }
                }
            }
        }, 150);
    };

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
                        onClick={() => setLayoutView("cards")}
                        className={`automations-panel__view-btn${layoutView === "cards" ? " automations-panel__view-btn--active" : ""}`}
                        title="Card view"
                    >
                        <LayoutGrid size={12} />
                    </button>
                    <button
                        onClick={() => setLayoutView("table")}
                        className={`automations-panel__view-btn${layoutView === "table" ? " automations-panel__view-btn--active" : ""}`}
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
            {layoutView === "cards" && (
                <div className="automations-panel__grid">
                    {filtered.map(auto => (
                        <AutomationCard
                            key={auto.id}
                            automation={auto}
                            lastRun={getLastRun(auto.id)}
                            onRun={runAutomation}
                            onViewLogs={(id) => setLogTarget(logTarget === id ? null : id)}
                            onEdit={handleEditInStudio}
                            isRunning={isRunning(auto.id)}
                        />
                    ))}
                </div>
            )}

            {/* Table View */}
            {layoutView === "table" && (
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
                                                {auto.type === "declarative" && (
                                                    <button
                                                        onClick={() => handleEditInStudio(auto)}
                                                        className="automations-panel__action-btn automations-panel__action-btn--edit"
                                                        title="Edit in Studio"
                                                    >
                                                        <Edit size={14} />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => runAutomation(auto.id)}
                                                    disabled={running}
                                                    className="automations-panel__action-btn automations-panel__action-btn--run"
                                                    title="Run now"
                                                >
                                                    <PlayCircle size={14} />
                                                </button>
                                                {del.isPending(auto.id) ? (
                                                    <DeleteConfirmInline entityName="Automation" entityLabel={auto.name} warning="This automation will be permanently deleted." onConfirm={() => del.confirm(() => deleteAutomation(auto.id))} onCancel={del.cancel} compact />
                                                ) : (
                                                    <button
                                                        onClick={() => del.requestDelete(auto.id)}
                                                        className="automations-panel__action-btn automations-panel__action-btn--delete"
                                                        title="Delete"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
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
                        {filter ? `No automations match "${filter}"` : "Create an automation in the Studio."}
                    </div>
                </div>
            )}
        </div>
    );
}
