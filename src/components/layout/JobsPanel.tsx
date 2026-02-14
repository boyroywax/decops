import { useState, useRef, useEffect } from "react";
import type { Job, JobStatus, JobArtifact } from "../../types";
import { registry } from "../../services/commands/registry";
import { CommandDefinition } from "../../services/commands/types";
import { SectionTitle } from "../shared/ui";

interface JobsPanelProps {
    jobs: Job[];
    onClose: () => void;
    removeJob: (id: string) => void;
    clearJobs: () => void;
}

export function JobsPanel({ jobs, onClose, removeJob, clearJobs }: JobsPanelProps) {
    const [height, setHeight] = useState(400);
    const [isResizing, setIsResizing] = useState(false);
    const [activeTab, setActiveTab] = useState<"queue" | "history" | "commands">("queue");

    const startResizing = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
    };

    const stopResizing = () => setIsResizing(false);

    const resize = (e: MouseEvent) => {
        if (isResizing) {
            const newHeight = window.innerHeight - e.clientY;
            if (newHeight > 200 && newHeight < window.innerHeight - 100) {
                setHeight(newHeight);
            }
        }
    };

    useEffect(() => {
        if (isResizing) {
            window.addEventListener("mousemove", resize);
            window.addEventListener("mouseup", stopResizing);
        }
        return () => {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
        };
    }, [isResizing]);

    const queue = jobs.filter(j => j.status === "queued" || j.status === "running");
    const history = jobs.filter(j => j.status === "completed" || j.status === "failed");
    const commands = registry.getAll();

    return (
        <div style={{
            height,
            background: "rgba(0,0,0,0.8)",
            borderTop: "1px solid rgba(0,229,160,0.12)",
            display: "flex",
            flexDirection: "column",
            fontFamily: "inherit",
            backdropFilter: "blur(12px)",
            position: "relative",
            transition: isResizing ? "none" : "height 0.1s ease-out",
        }}>
            {/* Resize Handle */}
            <div
                onMouseDown={startResizing}
                style={{
                    position: "absolute", top: -4, left: 0, right: 0, height: 8, cursor: "ns-resize", zIndex: 10,
                    display: "flex", justifyContent: "center", alignItems: "center",
                }}
            >
                <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.1)" }} />
            </div>

            {/* Header */}
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "6px 14px",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                flexShrink: 0,
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 9, color: "#52525b", letterSpacing: "0.1em" }}>JOB QUEUE</span>
                    <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.04)", padding: 2, borderRadius: 6 }}>
                        <button
                            onClick={() => setActiveTab("queue")}
                            style={{
                                background: activeTab === "queue" ? "rgba(255,255,255,0.06)" : "none",
                                color: activeTab === "queue" ? "#e4e4e7" : "#71717a",
                                border: "none", borderRadius: 4, padding: "2px 8px", fontSize: 10, cursor: "pointer", transition: "all 0.15s"
                            }}
                        >
                            Queue ({queue.length})
                        </button>
                        <button
                            onClick={() => setActiveTab("history")}
                            style={{
                                background: activeTab === "history" ? "rgba(255,255,255,0.06)" : "none",
                                color: activeTab === "history" ? "#e4e4e7" : "#71717a",
                                border: "none", borderRadius: 4, padding: "2px 8px", fontSize: 10, cursor: "pointer", transition: "all 0.15s"
                            }}
                        >
                            History ({history.length})
                        </button>
                        <button
                            onClick={() => setActiveTab("commands")}
                            style={{
                                background: activeTab === "commands" ? "rgba(255,255,255,0.06)" : "none",
                                color: activeTab === "commands" ? "#e4e4e7" : "#71717a",
                                border: "none", borderRadius: 4, padding: "2px 8px", fontSize: 10, cursor: "pointer", transition: "all 0.15s"
                            }}
                        >
                            Commands ({commands.length})
                        </button>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    style={{ background: "none", border: "none", color: "#71717a", cursor: "pointer", fontSize: 14, padding: "0 4px", lineHeight: 1 }}
                    title="Close jobs"
                >✕</button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
                {activeTab === "queue" && queue.length === 0 && (
                    <div style={{ textAlign: "center", padding: "40px 0", color: "#3f3f46" }}>
                        <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.5 }}>◎</div>
                        <div style={{ fontSize: 11 }}>No jobs in queue</div>
                    </div>
                )}
                {activeTab === "history" && history.length === 0 && (
                    <div style={{ textAlign: "center", padding: "40px 0", color: "#3f3f46" }}>
                        <div style={{ fontSize: 11 }}>No finished jobs</div>
                    </div>
                )}
                {activeTab === "commands" && commands.length === 0 && (
                    <div style={{ textAlign: "center", padding: "40px 0", color: "#3f3f46" }}>
                        <div style={{ fontSize: 11 }}>No commands registered</div>
                    </div>
                )}

                {activeTab === "queue" && queue.map(job => (
                    <JobItem key={job.id} job={job} removeJob={removeJob} />
                ))}

                {activeTab === "history" && history.map(job => (
                    <JobItem key={job.id} job={job} removeJob={removeJob} />
                ))}

                {activeTab === "commands" && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 32, padding: 24 }}>
                        {commands.map(cmd => (
                            <CommandCard key={cmd.id} command={cmd} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function CommandCard({ command }: { command: CommandDefinition }) {
    const [isFlipped, setIsFlipped] = useState(false);
    const [animationState, setAnimationState] = useState<"idle" | "pressing" | "flipping">("idle");

    const handleClick = () => {
        if (isFlipped) {
            // Simple flip back
            setIsFlipped(false);
            setAnimationState("idle");
            return;
        }

        if (animationState !== "idle") return;

        // Sequence: Press/Tilt Away -> Flip
        setAnimationState("pressing");

        setTimeout(() => {
            setIsFlipped(true);
            setAnimationState("flipping");
            // Reset to idle after transition matches (approx)
            setTimeout(() => setAnimationState("idle"), 600);
        }, 200);
    };

    // Calculate Transform based on state
    const getTransform = () => {
        if (isFlipped) return "rotateY(180deg)";
        if (animationState === "pressing") return "scale(0.92) rotateY(-15deg)";
        return "scale(1) rotateY(0deg)";
    };

    return (
        <div
            onClick={handleClick}
            style={{
                perspective: "1200px", // Increased perspective for better depth
                height: 150, // Slightly taller
                cursor: "pointer",
                zIndex: isFlipped || animationState !== "idle" ? 10 : 1, // Bring to front when interacting
                position: "relative", // Needed for z-index
                boxSizing: "border-box", // Critical fix
            }}
        >
            <div style={{
                position: "relative",
                width: "100%",
                height: "100%",
                transition: animationState === "pressing" ? "transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)" : "transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)", // Springy flip, snappy press
                transformStyle: "preserve-3d",
                transform: getTransform(),
                boxSizing: "border-box", // Critical fix
            }}>
                {/* Front */}
                <div style={{
                    position: "absolute",
                    width: "100%",
                    height: "100%",
                    backfaceVisibility: "hidden",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                    padding: 16,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
                    boxSizing: "border-box", // Critical fix
                }}>
                    <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 12 }}>
                            <div style={{
                                fontFamily: "'Space Grotesk', sans-serif",
                                fontWeight: 600,
                                fontSize: 13,
                                color: "#00e5a0",
                                display: "flex", alignItems: "center", gap: 6
                            }}>
                                <span style={{ fontSize: 10, opacity: 0.6 }}>/</span>
                                {command.id}
                            </div>
                            <div style={{
                                fontSize: 10,
                                color: "#52525b",
                                border: "1px solid rgba(255,255,255,0.06)",
                                borderRadius: 4,
                                padding: "2px 6px"
                            }}>
                                CMD
                            </div>
                        </div>

                        <div style={{ fontSize: 11, color: "#a1a1aa", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                            {command.description}
                        </div>
                    </div>

                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
                        {command.tags.map(tag => (
                            <span key={tag} style={{
                                fontSize: 9,
                                background: "rgba(255,255,255,0.05)",
                                borderRadius: 4,
                                padding: "2px 6px",
                                color: "#71717a"
                            }}>
                                #{tag}
                            </span>
                        ))}
                    </div>
                </div>

                {/* Back */}
                <div style={{
                    position: "absolute",
                    width: "100%",
                    height: "100%",
                    backfaceVisibility: "hidden",
                    background: "#09090b", // Darker solid background for legibility
                    border: "1px solid rgba(0,229,160,0.3)",
                    borderRadius: 12,
                    padding: 16, // Matched padding with Front
                    transform: "rotateY(180deg)",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    boxShadow: "0 0 15px rgba(0,229,160,0.05)",
                    boxSizing: "border-box", // Critical fix
                }}>
                    <div style={{
                        fontSize: 9,
                        color: "#71717a",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        marginBottom: 10,
                        borderBottom: "1px solid rgba(255,255,255,0.06)",
                        paddingBottom: 6,
                        display: "flex", justifyContent: "space-between"
                    }}>
                        <span>Configuration</span>
                        <span style={{ color: "#00e5a0" }}>●</span>
                    </div>

                    <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 6, paddingRight: 4 }}>
                        {Object.values(command.args).map(arg => (
                            <div key={arg.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                    <span style={{ color: "#e4e4e7" }}>{arg.name}</span>
                                    {arg.required !== false && <span style={{ color: "#ef4444", fontSize: 12, lineHeight: 0.5 }}>*</span>}
                                </div>
                                <code style={{ color: "#52525b", fontSize: 9, background: "rgba(255,255,255,0.03)", padding: "1px 4px", borderRadius: 3 }}>{arg.type}</code>
                            </div>
                        ))}
                    </div>

                    <div style={{ marginTop: 12, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <div style={{ fontSize: 9, color: "#52525b", marginBottom: 4 }}>Required Roles</div>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {command.rbac.map(role => (
                                <span key={role} style={{
                                    fontSize: 9,
                                    color: "#a78bfa",
                                    background: "rgba(167,139,250,0.1)",
                                    padding: "2px 6px",
                                    borderRadius: 3
                                }}>
                                    {role}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}


function JobItem({ job, removeJob }: { job: Job, removeJob: (id: string) => void }) {
    const statusColors: Record<JobStatus, string> = {
        queued: "#a1a1aa",
        running: "#fbbf24",
        completed: "#00e5a0",
        failed: "#ef4444",
    };

    return (
        <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 8,
            padding: 12,
            marginBottom: 8,
            position: "relative",
        }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "#e4e4e7", display: "flex", alignItems: "center", gap: 6 }}>
                        {job.type}
                        <span style={{
                            fontSize: 9, padding: "1px 6px", borderRadius: 4,
                            background: `${statusColors[job.status]}15`, color: statusColors[job.status],
                            border: `1px solid ${statusColors[job.status]}30`
                        }}>
                            {job.status.toUpperCase()}
                        </span>
                    </div>
                    <div style={{ fontSize: 10, color: "#71717a", marginTop: 2 }}>
                        ID: {job.id.split('-').pop()} · {new Date(job.createdAt).toLocaleTimeString()}
                    </div>
                </div>
                {(job.status === "completed" || job.status === "failed") && (
                    <button
                        onClick={() => removeJob(job.id)}
                        style={{ background: "none", border: "none", color: "#52525b", cursor: "pointer", fontSize: 12 }}
                        title="Remove"
                    >
                        ✕
                    </button>
                )}
            </div>

            {job.status === "running" && (
                <div style={{ height: 2, background: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden", marginTop: 8, marginBottom: 8 }}>
                    <div style={{ height: "100%", background: "#fbbf24", width: "100%", animation: "progress 2s infinite linear", transformOrigin: "0% 50%" }}>
                        <style>{`@keyframes progress { 0% { transform: scaleX(0); } 50% { transform: scaleX(0.7); } 100% { transform: scaleX(1); opacity: 0; } }`}</style>
                    </div>
                </div>
            )}

            {/* Request Details */}
            <div style={{ marginTop: 8, fontSize: 11, color: "#a1a1aa", background: "rgba(0,0,0,0.2)", padding: 8, borderRadius: 6 }}>
                <div style={{ fontSize: 9, color: "#52525b", marginBottom: 2, fontWeight: 600 }}>REQUEST</div>
                <div style={{ whiteSpace: "pre-wrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {JSON.stringify(job.request, null, 2)}
                </div>
            </div>

            {/* Result/Artifacts */}
            {job.status === "completed" && (
                <div style={{ marginTop: 8 }}>
                    {job.result && <div style={{ fontSize: 11, color: "#00e5a0", marginBottom: 4 }}>✓ {job.result}</div>}
                    {job.artifacts.length > 0 && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {job.artifacts.map(art => (
                                <div key={art.id} style={{
                                    background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.2)",
                                    borderRadius: 4, padding: "4px 8px", fontSize: 10, color: "#38bdf8",
                                    display: "flex", alignItems: "center", gap: 4
                                }}>
                                    <span>📄</span> {art.name}
                                    <span style={{ opacity: 0.5, marginLeft: 4 }}>{art.type}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {job.status === "failed" && job.result && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#ef4444" }}>
                    ⚠ {job.result}
                </div>
            )}
        </div>
    );
}
