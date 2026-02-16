import React from "react";
import { useJobsContext } from "../../context/JobsContext";
import { useAutomations } from "../../context/AutomationsContext";
import { AutomationCard } from "../automations/AutomationCard";
import { CheckCircle, Clock, PlayCircle, AlertCircle, Trash2 } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";

export function ActionsMonitor() {
    const { jobs, isPaused, toggleQueuePause } = useJobsContext();
    const { automations, runs, runAutomation, deleteAutomation } = useAutomations();

    const activeJobs = jobs.filter(j => j.status === "queued" || j.status === "running");
    const historyJobs = jobs.filter(j => j.status === "completed" || j.status === "failed").slice(0, 10);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>

            {/* Active Jobs Section */}
            <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Active Jobs ({activeJobs.length})</h3>
                    <div style={{ display: "flex", gap: 12 }}>
                        <button
                            onClick={toggleQueuePause}
                            style={{
                                padding: "6px 12px",
                                background: isPaused ? "#f59e0b" : "#27272a",
                                color: isPaused ? "black" : "#a1a1aa",
                                border: "none",
                                borderRadius: 6,
                                fontSize: 13,
                                cursor: "pointer",
                                fontWeight: 500
                            }}
                        >
                            {isPaused ? "Resume Queue" : "Pause Queue"}
                        </button>
                    </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {activeJobs.length === 0 ? (
                        <div style={{ padding: 24, textAlign: "center", color: "#52525b", border: "1px dashed #27272a", borderRadius: 8 }}>
                            No active jobs.
                        </div>
                    ) : (
                        activeJobs.map(job => (
                            <div key={job.id} style={{
                                padding: 16,
                                background: "#18181b",
                                border: "1px solid #27272a",
                                borderLeft: `3px solid ${job.status === 'running' ? '#3b82f6' : '#f59e0b'}`,
                                borderRadius: 8,
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center"
                            }}>
                                <div>
                                    <div style={{ fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
                                        {job.type}
                                        <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "#27272a", color: "#a1a1aa" }}>{job.status}</span>
                                    </div>
                                    <div style={{ fontSize: 12, color: "#a1a1aa", marginTop: 4 }}>ID: {job.id}</div>
                                </div>
                                {job.status === 'running' && (
                                    <div style={{ fontSize: 12, color: "#3b82f6" }}>Processing...</div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Automations Section */}
            <div>
                <h3 style={{ margin: "0 0 16px 0", fontSize: 18, fontWeight: 600 }}>Active Automations</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
                    {automations.map(auto => {
                        const lastRun = runs.find(r => r.automationId === auto.id); // Simple find, ideally sort
                        return (
                            <div key={auto.id} style={{
                                padding: 16,
                                background: "#18181b",
                                border: "1px solid #27272a",
                                borderRadius: 8
                            }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                                    <span style={{ fontWeight: 600 }}>{auto.name}</span>
                                    {auto.schedule && <span style={{ fontSize: 11, color: "#a1a1aa" }}>{auto.schedule}</span>}
                                </div>
                                <p style={{ fontSize: 13, color: "#a1a1aa", margin: "0 0 12px 0", height: 40, overflow: "hidden" }}>{auto.description}</p>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#71717a" }}>
                                        <Clock size={12} />
                                        {lastRun ? new Date(lastRun.startTime).toLocaleTimeString() : "Never run"}
                                    </div>
                                    <button
                                        onClick={() => runAutomation(auto.id)}
                                        style={{ background: "transparent", border: "none", color: "#3b82f6", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}
                                    >
                                        <PlayCircle size={14} /> Run Now
                                    </button>
                                    <button
                                        onClick={() => deleteAutomation(auto.id)}
                                        style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}
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
                <h3 style={{ margin: "0 0 16px 0", fontSize: 18, fontWeight: 600 }}>Recent History</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {historyJobs.map(job => (
                        <div key={job.id} style={{
                            padding: "12px 16px",
                            background: "#09090b",
                            borderBottom: "1px solid #27272a",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center"
                        }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                {job.status === 'completed' ?
                                    <GradientIcon icon={CheckCircle} size={16} gradient={["#10b981", "#34d399"]} /> :
                                    <GradientIcon icon={AlertCircle} size={16} gradient={["#ef4444", "#f87171"]} />
                                }
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 500 }}>{job.type}</div>
                                    <div style={{ fontSize: 11, color: "#52525b" }}>{new Date(job.updatedAt).toLocaleTimeString()}</div>
                                </div>
                            </div>
                            <div style={{ fontSize: 12, color: "#a1a1aa", maxWidth: 200, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {job.result || "No result"}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

        </div>
    );
}
