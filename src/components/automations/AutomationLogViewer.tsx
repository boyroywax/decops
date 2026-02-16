
import { useState, useMemo } from "react";
import { X, Clock, Terminal, ChevronRight, ChevronDown } from "lucide-react";
import type { AutomationRun } from "../../services/automations/types";

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

    return (
        <div style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.8)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000
        }} onClick={onClose}>
            <div style={{
                background: "#0a0a0f",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
                width: "90%",
                maxWidth: 800,
                height: "80%",
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
                overflow: "hidden"
            }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{
                    padding: "16px 24px",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "rgba(255,255,255,0.02)"
                }}>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 600, color: "#e4e4e7" }}>Execution Log</div>
                        <div style={{ fontSize: 12, color: "#a1a1aa", marginTop: 4, display: "flex", gap: 12 }}>
                            <span>Run ID: {run.id.slice(0, 8)}</span>
                            <span>•</span>
                            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <Clock size={12} /> {duration}
                            </span>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: "none", border: "none", color: "#71717a", cursor: "pointer" }}>
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {run.logs.map((log) => (
                            <div key={log.id} style={{
                                background: "rgba(255,255,255,0.02)",
                                borderRadius: 6,
                                overflow: "hidden"
                            }}>
                                <div
                                    onClick={() => toggleStep(log.id)}
                                    style={{
                                        padding: "10px 12px",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 12,
                                        cursor: "pointer",
                                        fontSize: 13
                                    }}
                                >
                                    <div style={{ color: "#71717a" }}>
                                        {expandedSteps.has(log.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </div>
                                    <div style={{
                                        color: log.level === "error" ? "#ef4444" : log.level === "warn" ? "#fbbf24" : "#e4e4e7",
                                        flex: 1,
                                        fontFamily: "'DM Mono', monospace"
                                    }}>
                                        {log.message}
                                    </div>
                                    <div style={{ fontSize: 11, color: "#52525b" }}>
                                        {new Date(log.timestamp).toLocaleTimeString()}
                                    </div>
                                </div>

                                {expandedSteps.has(log.id) && log.details && (
                                    <div style={{
                                        padding: "12px",
                                        background: "#000",
                                        borderTop: "1px solid rgba(255,255,255,0.06)",
                                        fontSize: 12,
                                        fontFamily: "'DM Mono', monospace",
                                        color: "#a1a1aa",
                                        whiteSpace: "pre-wrap",
                                        overflowX: "auto"
                                    }}>
                                        {typeof log.details === "string"
                                            ? log.details
                                            : JSON.stringify(log.details, null, 2)}
                                    </div>
                                )}
                            </div>
                        ))}

                        {run.logs.length === 0 && (
                            <div style={{ textAlign: "center", padding: 40, color: "#52525b" }}>
                                No logs available for this run.
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                {run.status === "failed" && run.error && (
                    <div style={{
                        padding: 16,
                        background: "rgba(239, 68, 68, 0.1)",
                        borderTop: "1px solid rgba(239, 68, 68, 0.2)",
                        color: "#ef4444",
                        fontSize: 13,
                        fontFamily: "'DM Mono', monospace"
                    }}>
                        <strong>Error:</strong> {run.error}
                    </div>
                )}
            </div>
        </div>
    );
}
