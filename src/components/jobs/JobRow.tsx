import { Loader2, Check, AlertTriangle, Clock, Trash2, StopCircle } from "lucide-react";
import type { Job, JobStatus } from "../../types";

interface JobRowProps {
    job: Job;
    removeJob: (id: string) => void;
    stopJob: (id: string) => void;
    onView: () => void;
}

export function JobRow({ job, removeJob, stopJob, onView }: JobRowProps) {
    const statusColors: Record<JobStatus, string> = {
        queued: "#a1a1aa",
        running: "#38bdf8",
        completed: "#00e5a0",
        failed: "#ef4444",
    };
    const color = statusColors[job.status];
    const isRunning = job.status === "running";

    return (
        <div
            onClick={onView}
            style={{
                display: "flex", alignItems: "center", gap: 12, padding: "8px 12px",
                background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)",
                cursor: "pointer", transition: "all 0.1s"
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
        >
            <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center",
                border: `1px solid ${color}30`, flexShrink: 0
            }}>
                {isRunning ? <Loader2 size={14} className="spin" color={color} /> :
                    job.status === "completed" ? <Check size={14} color={color} /> :
                        job.status === "failed" ? <AlertTriangle size={14} color={color} /> :
                            <Clock size={14} color={color} />}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "#e4e4e7" }}>{job.type}</span>
                    <span style={{ fontSize: 10, color: "#71717a", fontFamily: "monospace", padding: "1px 4px", background: "rgba(255,255,255,0.05)", borderRadius: 3 }}>
                        {job.id.split('-').pop()}
                    </span>
                </div>
                <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {job.request.description || JSON.stringify(job.request)}
                </div>
            </div>

            <div style={{ fontSize: 11, color: "#52525b", textAlign: "right", minWidth: 60 }}>
                {new Date(job.createdAt).toLocaleTimeString()}
            </div>

            <div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                {isRunning ? (
                    <button
                        onClick={() => stopJob(job.id)}
                        style={{ background: "rgba(239, 68, 68, 0.1)", border: "none", color: "#ef4444", cursor: "pointer", padding: 6, borderRadius: 4 }}
                        title="Stop Job"
                    >
                        <StopCircle size={14} />
                    </button>
                ) : (
                    <button
                        onClick={() => removeJob(job.id)}
                        style={{ background: "rgba(255,255,255,0.05)", border: "none", color: "#71717a", cursor: "pointer", padding: 6, borderRadius: 4 }}
                        title="Delete Job"
                    >
                        <Trash2 size={14} />
                    </button>
                )}
            </div>
        </div>
    );
}
