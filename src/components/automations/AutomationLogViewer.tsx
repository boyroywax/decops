
import { useState, useMemo } from "react";
import { X, Clock, Terminal, ChevronRight, ChevronDown } from "lucide-react";
import type { AutomationRun } from "../../services/automations/types";
import "../../styles/components/automation-log-viewer.css";

interface AutomationLogViewerProps {
    run: AutomationRun | null;
    onClose: () => void;
}

export function AutomationLogViewer({ run, onClose }: AutomationLogViewerProps) {
    const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

    if (!run) return null;

    const toggleStep = (stepId: string) => {
        setExpandedSteps(prev => {
            const next = new Set(prev);
            if (next.has(stepId)) next.delete(stepId);
            else next.add(stepId);
            return next;
        });
    };

    const duration = run.endTime
        ? ((run.endTime - run.startTime) / 1000).toFixed(2) + "s"
        : "Running...";

    const getMessageClass = (level: string) => {
        switch (level) {
            case "error": return "log-viewer__message log-viewer__message--error";
            case "warn": return "log-viewer__message log-viewer__message--warn";
            default: return "log-viewer__message log-viewer__message--info";
        }
    };

    return (
        <div className="log-viewer__backdrop" onClick={onClose}>
            <div className="log-viewer__panel" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="log-viewer__header">
                    <div>
                        <div className="log-viewer__title">Execution Log</div>
                        <div className="log-viewer__meta">
                            <span>Run ID: {run.id.slice(0, 8)}</span>
                            <span>•</span>
                            <span className="log-viewer__meta-duration">
                                <Clock size={12} /> {duration}
                            </span>
                        </div>
                    </div>
                    <button onClick={onClose} className="log-viewer__close-btn">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="log-viewer__content">
                    <div className="log-viewer__entries">
                        {run.logs.map((log) => (
                            <div key={log.id} className="log-viewer__entry">
                                <div
                                    onClick={() => toggleStep(log.id)}
                                    className="log-viewer__entry-header"
                                >
                                    <div className="log-viewer__chevron">
                                        {expandedSteps.has(log.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </div>
                                    <div className={getMessageClass(log.level)}>
                                        {log.message}
                                    </div>
                                    <div className="log-viewer__timestamp">
                                        {new Date(log.timestamp).toLocaleTimeString()}
                                    </div>
                                </div>

                                {expandedSteps.has(log.id) && log.details && (
                                    <div className="log-viewer__details">
                                        {typeof log.details === "string"
                                            ? log.details
                                            : JSON.stringify(log.details, null, 2)}
                                    </div>
                                )}
                            </div>
                        ))}

                        {run.logs.length === 0 && (
                            <div className="log-viewer__empty">
                                No logs available for this run.
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                {run.status === "failed" && run.error && (
                    <div className="log-viewer__error">
                        <strong>Error:</strong> {run.error}
                    </div>
                )}
            </div>
        </div>
    );
}
