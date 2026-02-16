
import { Play, Activity, Clock, AlertCircle, CheckCircle2 } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import type { AutomationDefinition, AutomationRun } from "../../services/automations/types";

interface AutomationCardProps {
    automation: AutomationDefinition;
    lastRun?: AutomationRun;
    onRun: (id: string) => void;
    onViewLogs: (id: string) => void;
    isRunning: boolean;
}

export function AutomationCard({ automation, lastRun, onRun, onViewLogs, isRunning }: AutomationCardProps) {
    return (
        <div style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 12,
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            transition: "all 0.2s",
            position: "relative",
            overflow: "hidden"
        }}>
            {/* Status Indicator Stripe */}
            <div style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: 3,
                background: isRunning
                    ? "#38bdf8"
                    : lastRun?.status === "failed"
                        ? "#ef4444"
                        : "rgba(255,255,255,0.1)"
            }} />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: "rgba(56,189,248,0.1)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "1px solid rgba(56,189,248,0.2)"
                    }}>
                        <GradientIcon icon={Activity} size={20} gradient={["#38bdf8", "#818cf8"]} />
                    </div>
                    <div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: "#e4e4e7" }}>{automation.name}</div>
                        <div style={{ fontSize: 11, color: "#71717a", marginTop: 2 }}>{automation.schedule || "Manual trigger only"}</div>
                    </div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                    <button
                        onClick={() => onViewLogs(automation.id)}
                        style={{
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.06)",
                            borderRadius: 6,
                            padding: "6px 12px",
                            color: "#a1a1aa",
                            cursor: "pointer",
                            fontSize: 11,
                            fontFamily: "inherit",
                            transition: "all 0.2s"
                        }}
                    >
                        Logs
                    </button>
                    <button
                        onClick={() => onRun(automation.id)}
                        disabled={isRunning}
                        style={{
                            background: isRunning ? "rgba(56,189,248,0.1)" : "rgba(0,229,160,0.1)",
                            border: `1px solid ${isRunning ? "rgba(56,189,248,0.2)" : "rgba(0,229,160,0.2)"}`,
                            borderRadius: 6,
                            padding: "6px 12px",
                            color: isRunning ? "#38bdf8" : "#00e5a0",
                            cursor: isRunning ? "not-allowed" : "pointer",
                            fontSize: 11,
                            fontWeight: 500,
                            fontFamily: "inherit",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            transition: "all 0.2s"
                        }}
                    >
                        {isRunning ? (
                            <>Running...</>
                        ) : (
                            <><Play size={12} fill="currentColor" /> Run Now</>
                        )}
                    </button>
                </div>
            </div>

            <div style={{ fontSize: 12, color: "#a1a1aa", lineHeight: 1.5 }}>
                {automation.description}
            </div>

            {/* Tags */}
            {automation.tags && (
                <div style={{ display: "flex", gap: 6 }}>
                    {automation.tags.map(tag => (
                        <span key={tag} style={{
                            fontSize: 10,
                            background: "rgba(255,255,255,0.04)",
                            color: "#71717a",
                            padding: "2px 8px",
                            borderRadius: 12,
                            border: "1px solid rgba(255,255,255,0.06)"
                        }}>
                            #{tag}
                        </span>
                    ))}
                </div>
            )}

            <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#71717a" }}>
                    <Clock size={12} />
                    Last run: {lastRun ? new Date(lastRun.endTime || lastRun.startTime).toLocaleString() : "Never"}
                </div>
                {lastRun && (
                    <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        color: lastRun.status === "completed" ? "#00e5a0" : lastRun.status === "failed" ? "#ef4444" : "#38bdf8"
                    }}>
                        {lastRun.status === "completed" ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                        <span style={{ textTransform: "capitalize" }}>{lastRun.status}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
