import { useEffect } from "react";
import { Loader2, Check, AlertTriangle, Clock, StopCircle, Trash2, X, Image as ImageIcon, Code, FileText } from "lucide-react";
import type { Job, JobStatus, JobArtifact } from "../../types";

interface JobDetailViewProps {
    job: Job;
    onClose: () => void;
    stopJob: (id: string) => void;
    removeJob: (id: string) => void;
    onViewArtifact: (art: JobArtifact) => void;
}

export function JobDetailView({ job, onClose, stopJob, removeJob, onViewArtifact }: JobDetailViewProps) {
    const statusColors: Record<JobStatus, string> = {
        queued: "#a1a1aa",
        running: "#38bdf8",
        completed: "#00e5a0",
        failed: "#ef4444",
    };
    const color = statusColors[job.status];
    const isRunning = job.status === "running";

    // Close on escape
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        }
        window.addEventListener("keydown", handleEsc);
        return () => window.removeEventListener("keydown", handleEsc);
    }, [onClose]);

    return (
        <div style={{
            position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
            zIndex: 50, display: "flex", justifyContent: "center", alignItems: "center",
            padding: 24
        }} onClick={onClose}>
            <div style={{
                width: "100%", maxWidth: 600, maxHeight: "80vh",
                background: "#09090b", border: `1px solid ${color}40`,
                borderRadius: 16, boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
                display: "flex", flexDirection: "column", overflow: "hidden"
            }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{
                    padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)",
                    background: `linear-gradient(to right, ${color}10, transparent)`,
                    display: "flex", justifyContent: "space-between", alignItems: "center"
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{
                            width: 32, height: 32, borderRadius: 8,
                            background: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center",
                            border: `1px solid ${color}30`
                        }}>
                            {isRunning ? <Loader2 size={16} className="spin" color={color} /> :
                                job.status === "completed" ? <Check size={16} color={color} /> :
                                    job.status === "failed" ? <AlertTriangle size={16} color={color} /> :
                                        <Clock size={16} color={color} />}
                        </div>
                        <div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{job.type}</div>
                            <div style={{ fontSize: 11, color: "#a1a1aa", display: "flex", gap: 8, alignItems: "center" }}>
                                <span style={{ fontFamily: "monospace" }}>{job.id}</span>
                                <span style={{ width: 3, height: 3, background: "#52525b", borderRadius: "50%" }} />
                                <span>{new Date(job.createdAt).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                        {isRunning ? (
                            <button
                                onClick={() => stopJob(job.id)}
                                style={{
                                    background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)",
                                    color: "#ef4444", cursor: "pointer", padding: "6px 12px", borderRadius: 6,
                                    fontSize: 12, display: "flex", alignItems: "center", gap: 6
                                }}
                            >
                                <StopCircle size={14} /> Stop
                            </button>
                        ) : (
                            <button
                                onClick={() => { removeJob(job.id); onClose(); }}
                                style={{
                                    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                                    color: "#71717a", cursor: "pointer", padding: "6px 12px", borderRadius: 6,
                                    fontSize: 12, display: "flex", alignItems: "center", gap: 6
                                }}
                            >
                                <Trash2 size={14} /> Delete
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            style={{ background: "none", border: "none", color: "#71717a", cursor: "pointer", padding: 4 }}
                        ><X size={20} /></button>
                    </div>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflow: "auto", padding: 20 }}>

                    {/* Status Message / Result */}
                    {(job.status === "completed" || job.status === "failed") && job.result && (
                        <div style={{
                            marginBottom: 20, padding: 12, borderRadius: 8,
                            background: job.status === "completed" ? "rgba(0, 229, 160, 0.05)" : "rgba(239, 68, 68, 0.05)",
                            border: `1px solid ${job.status === "completed" ? "rgba(0, 229, 160, 0.15)" : "rgba(239, 68, 68, 0.15)"}`,
                        }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: color, marginBottom: 4, textTransform: "uppercase" }}>
                                {job.status === "completed" ? "Result" : "Error"}
                            </div>
                            <div style={{ fontSize: 13, color: "#e4e4e7", whiteSpace: "pre-wrap", fontFamily: "monospace" }}>
                                {job.result}
                            </div>
                        </div>
                    )}

                    {/* Artifacts */}
                    {job.artifacts && job.artifacts.length > 0 && (
                        <div style={{ marginBottom: 24 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "#a1a1aa", marginBottom: 8, textTransform: "uppercase" }}>
                                Artifacts ({job.artifacts.length})
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                                {job.artifacts.map(art => (
                                    <button
                                        key={art.id}
                                        onClick={() => onViewArtifact(art)}
                                        style={{
                                            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
                                            borderRadius: 8, padding: 10, cursor: "pointer", textAlign: "left",
                                            display: "flex", flexDirection: "column", gap: 6, transition: "all 0.2s"
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
                                        onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                                    >
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", width: "100%" }}>
                                            {art.type === 'image' ? <ImageIcon size={14} color="#38bdf8" /> :
                                                art.type === 'code' || art.type === 'json' ? <Code size={14} color="#a78bfa" /> :
                                                    <FileText size={14} color="#fb923c" />}
                                        </div>
                                        <div style={{ fontSize: 12, color: "#e4e4e7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>
                                            {art.name}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Request Details */}
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#a1a1aa", marginBottom: 8, textTransform: "uppercase" }}>
                            Request Parameters
                        </div>
                        <pre style={{
                            margin: 0, padding: 12, borderRadius: 8,
                            background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.05)",
                            fontSize: 12, color: "#d4d4d8", fontFamily: "monospace", overflowX: "auto"
                        }}>
                            {JSON.stringify(job.request, null, 2)}
                        </pre>
                    </div>

                </div>
            </div>
        </div>
    );
}
