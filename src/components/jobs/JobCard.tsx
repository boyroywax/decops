import { useState } from "react";
import { Loader2, Check, AlertTriangle, Clock, Maximize2, Trash2, StopCircle } from "lucide-react";
import type { Job, JobStatus } from "../../types";

interface JobCardProps {
    job: Job;
    removeJob: (id: string) => void;
    stopJob: (id: string) => void;
    onView: () => void;
}

export function JobCard({ job, removeJob, stopJob, onView }: JobCardProps) {
    const [isFlipped, setIsFlipped] = useState(false);
    const [animationState, setAnimationState] = useState<"idle" | "pressing" | "flipping">("idle");

    const statusColors: Record<JobStatus, string> = {
        queued: "#a1a1aa",
        running: "#38bdf8",
        completed: "#00e5a0",
        failed: "#ef4444",
    };

    const color = statusColors[job.status];
    const isRunning = job.status === "running";

    const handleClick = (e: React.MouseEvent) => {
        // Prevent flip if clicking action buttons
        if ((e.target as HTMLElement).closest('button')) return;

        if (isFlipped) {
            setIsFlipped(false);
            setAnimationState("idle");
            return;
        }

        if (animationState !== "idle") return;

        setAnimationState("pressing");
        setTimeout(() => {
            setIsFlipped(true);
            setAnimationState("flipping");
            setTimeout(() => setAnimationState("idle"), 600);
        }, 200);
    };

    const getTransform = () => {
        if (isFlipped) return "rotateY(180deg)";
        if (animationState === "pressing") return "scale(0.92) rotateY(-15deg)";
        return "scale(1) rotateY(0deg)";
    };

    return (
        <div
            onClick={handleClick}
            style={{
                perspective: "1200px",
                height: 180,
                cursor: "pointer",
                zIndex: isFlipped || animationState !== "idle" ? 10 : 1,
                position: "relative",
                boxSizing: "border-box",
            }}
        >
            <div style={{
                position: "relative",
                width: "100%",
                height: "100%",
                transition: animationState === "pressing" ? "transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)" : "transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)",
                transformStyle: "preserve-3d",
                transform: getTransform(),
                boxSizing: "border-box",
            }}>
                {/* Front Side */}
                <div style={{
                    position: "absolute",
                    width: "100%",
                    height: "100%",
                    backfaceVisibility: "hidden",
                    background: `linear-gradient(145deg, rgba(255,255,255,0.03) 0%, ${color}05 100%)`,
                    border: `1px solid ${color}30`,
                    borderRadius: 12,
                    padding: 16,
                    display: "flex",
                    flexDirection: "column",
                    boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
                    boxSizing: "border-box",
                }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        {/* Icon */}
                        <div style={{
                            width: 32, height: 32, borderRadius: 10,
                            background: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center",
                            border: `1px solid ${color}30`
                        }}>
                            {isRunning ? <Loader2 size={16} className="spin" color={color} /> :
                                job.status === "completed" ? <Check size={16} color={color} /> :
                                    job.status === "failed" ? <AlertTriangle size={16} color={color} /> :
                                        <Clock size={16} color={color} />}
                        </div>
                        {/* Status Badge */}
                        <div style={{
                            fontSize: 9, color: color,
                            background: `${color}10`, padding: "2px 6px", borderRadius: 4,
                            border: `1px solid ${color}20`, textTransform: "uppercase", fontWeight: 600
                        }}>
                            {job.status}
                        </div>
                    </div>

                    <div style={{ marginTop: 12, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#e4e4e7" }}>
                            {job.type}
                        </div>
                        <div style={{ fontSize: 10, color: "#71717a", marginTop: 4, fontFamily: "monospace" }}>
                            ID: {job.id.split('-').pop()}
                        </div>
                    </div>

                    {/* Progress or Time */}
                    <div style={{ marginTop: "auto" }}>
                        {isRunning ? (
                            <div style={{ height: 2, background: "rgba(56, 189, 248, 0.1)", borderRadius: 2, overflow: "hidden" }}>
                                <div style={{ height: "100%", background: "#38bdf8", width: "100%", animation: "progress 2s infinite linear", transformOrigin: "0% 50%" }}>
                                    <style>{`@keyframes progress { 0% { transform: scaleX(0); } 50% { transform: scaleX(0.7); } 100% { transform: scaleX(1); opacity: 0; } }`}</style>
                                </div>
                            </div>
                        ) : (
                            <div style={{ fontSize: 10, color: "#52525b" }}>
                                {new Date(job.createdAt).toLocaleTimeString()}
                            </div>
                        )}
                    </div>
                </div>

                {/* Back Side */}
                <div style={{
                    position: "absolute",
                    width: "100%",
                    height: "100%",
                    backfaceVisibility: "hidden",
                    background: "#09090b",
                    border: `1px solid ${color}50`,
                    borderRadius: 12,
                    padding: 16,
                    transform: "rotateY(180deg)",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    boxShadow: `0 0 15px ${color}10`,
                    boxSizing: "border-box",
                }}>
                    {/* Header with Actions */}
                    <span style={{ fontSize: 10, color: color, fontWeight: 600, textTransform: "uppercase" }}>
                        DETAILS
                    </span>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                        <button
                            onClick={(e) => { e.stopPropagation(); onView(); }}
                            style={{ background: "rgba(255,255,255,0.05)", border: "none", color: "#fff", cursor: "pointer", padding: 4, borderRadius: 4 }}
                            title="Expand View"
                        >
                            <Maximize2 size={12} />
                        </button>
                        {isRunning ? (
                            <button
                                onClick={(e) => { e.stopPropagation(); stopJob(job.id); }}
                                style={{ background: "rgba(239, 68, 68, 0.1)", border: "none", color: "#ef4444", cursor: "pointer", padding: 4, borderRadius: 4 }}
                                title="Stop Job"
                            >
                                <StopCircle size={12} />
                            </button>
                        ) : (
                            <button
                                onClick={(e) => { e.stopPropagation(); removeJob(job.id); }}
                                style={{ background: "rgba(255,255,255,0.05)", border: "none", color: "#71717a", cursor: "pointer", padding: 4, borderRadius: 4 }}
                                title="Delete Job"
                            >
                                <Trash2 size={12} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflow: "auto", fontSize: 10, color: "#a1a1aa" }}>
                    {job.status === "completed" && job.result && (
                        <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 9, color: "#52525b", marginBottom: 2 }}>RESULT</div>
                            <div style={{ color: "#00e5a0" }}>{job.result}</div>
                        </div>
                    )}

                    {job.status === "failed" && job.result && (
                        <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 9, color: "#52525b", marginBottom: 2 }}>ERROR</div>
                            <div style={{ color: "#ef4444" }}>{job.result}</div>
                        </div>
                    )}

                    <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 9, color: "#52525b", marginBottom: 2 }}>REQUEST</div>
                        <pre style={{ margin: 0, whiteSpace: "pre-wrap", background: "rgba(255,255,255,0.02)", padding: 4, borderRadius: 4, overflowX: "hidden" }}>
                            {JSON.stringify(job.request, null, 2)}
                        </pre>
                    </div>

                    {job.artifacts.length > 0 && (
                        <div>
                            <div style={{ fontSize: 9, color: "#52525b", marginBottom: 2 }}>ARTIFACTS</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                {job.artifacts.length} Items
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>

    );
}
