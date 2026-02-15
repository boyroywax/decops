import { useState, useRef, useEffect } from "react";
import { Loader2, X, Check, FileText, AlertTriangle, Plus, Briefcase, Play } from "lucide-react";
import type { Job, JobStatus, JobArtifact, JobDefinition } from "../../types";
import { registry } from "../../services/commands/registry";
import { CommandDefinition } from "../../services/commands/types";
import { JobCreator } from "../jobs/JobCreator";
import { JobCatalog } from "../jobs/JobCatalog";

interface JobsPanelProps {
    jobs: Job[];
    onClose: () => void;
    removeJob: (id: string) => void;
    clearJobs: () => void;
    addJob: (job: any) => void;
    isPaused: boolean;
    toggleQueuePause: () => void;
    stopJob: (id: string) => void;
    reorderQueue: (ids: string[]) => void;
    savedJobs: JobDefinition[];
    saveJob: (job: JobDefinition) => void;
    deleteJob: (id: string) => void;
}

export function JobsPanel({ jobs, onClose, removeJob, clearJobs, addJob, isPaused, toggleQueuePause, stopJob, reorderQueue, savedJobs, saveJob, deleteJob }: JobsPanelProps) {
    const [height, setHeight] = useState(500);
    const [isResizing, setIsResizing] = useState(false);
    const [activeTab, setActiveTab] = useState<"queue" | "history" | "commands" | "catalog" | "creator">("queue");

    // Catalog State
    const [editingJob, setEditingJob] = useState<JobDefinition | null>(null);

    const startResizing = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
    };

    const stopResizing = () => setIsResizing(false);

    const resize = (e: MouseEvent) => {
        if (isResizing) {
            const newHeight = window.innerHeight - e.clientY;
            if (newHeight > 200 && newHeight < window.innerHeight - 50) {
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

    // Split jobs
    const queue = jobs.filter(j => j.status === "queued" || j.status === "running");
    const history = jobs.filter(j => j.status === "completed" || j.status === "failed");
    const commands = registry.getAll();

    // Drag and Drop State
    const [draggingId, setDraggingId] = useState<string | null>(null);

    const handleDragStart = (e: React.DragEvent, id: string) => {
        setDraggingId(id);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        if (!draggingId || draggingId === targetId) {
            setDraggingId(null);
            return;
        }

        const currentOrder = queue.map(j => j.id);
        const fromIndex = currentOrder.indexOf(draggingId);
        const toIndex = currentOrder.indexOf(targetId);

        if (fromIndex === -1 || toIndex === -1) return;

        const newOrder = [...currentOrder];
        newOrder.splice(fromIndex, 1);
        newOrder.splice(toIndex, 0, draggingId);

        reorderQueue(newOrder);
        setDraggingId(null);
    };

    const handleRunJobDef = (jobDef: JobDefinition) => {
        // Convert JobDefinition to queued Job
        addJob({
            type: jobDef.name, // Use definition name as type for display
            request: { description: jobDef.description },
            jobDefinitionId: jobDef.id,
            steps: jobDef.steps,
            mode: jobDef.mode,
            status: "queued"
        });
        setActiveTab("queue");
    };

    return (
        <div style={{
            height,
            background: "rgba(0,0,0,0.85)",
            borderTop: "1px solid rgba(0,229,160,0.12)",
            display: "flex",
            flexDirection: "column",
            fontFamily: "inherit",
            backdropFilter: "blur(16px)",
            position: "relative",
            transition: isResizing ? "none" : "height 0.1s ease-out",
            boxShadow: "0 -10px 40px rgba(0,0,0,0.5)"
        }}>
            {/* Resize Handle */}
            <div
                onMouseDown={startResizing}
                style={{
                    position: "absolute", top: -6, left: 0, right: 0, height: 12, cursor: "ns-resize", zIndex: 10,
                    display: "flex", justifyContent: "center", alignItems: "center",
                }}
            >
                <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.2)" }} />
            </div>

            {/* Header */}
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 16px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                flexShrink: 0,
                background: "rgba(0,0,0,0.2)"
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#e4e4e7", display: "flex", alignItems: "center", gap: 6 }}>
                        <Play size={12} fill="#e4e4e7" /> JOB QUEUE
                    </span>
                    <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", padding: 3, borderRadius: 6 }}>
                        {(["queue", "history", "catalog", "commands"] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                style={{
                                    background: activeTab === tab ? "rgba(255,255,255,0.08)" : "none",
                                    color: activeTab === tab ? "#fff" : "#71717a",
                                    border: "none", borderRadius: 4, padding: "4px 10px", fontSize: 11, cursor: "pointer", transition: "all 0.15s",
                                    fontWeight: activeTab === tab ? 600 : 400, textTransform: "capitalize"
                                }}
                            >
                                {tab}
                                {tab === "queue" && queue.length > 0 && <span style={{ marginLeft: 6, opacity: 0.6 }}>{queue.length}</span>}
                            </button>
                        ))}
                    </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                        onClick={() => { setEditingJob(null); setActiveTab("creator"); }}
                        style={{
                            background: "rgba(0, 229, 160, 0.1)",
                            color: "#00e5a0",
                            border: "1px solid rgba(0, 229, 160, 0.2)",
                            borderRadius: 4, padding: "4px 10px", fontSize: 11, cursor: "pointer",
                            display: "flex", alignItems: "center", gap: 4, fontWeight: 500
                        }}
                    >
                        <Plus size={12} /> New Job
                    </button>
                    <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.1)" }} />
                    <button
                        onClick={onClose}
                        style={{ background: "none", border: "none", color: "#71717a", cursor: "pointer", padding: 4 }}
                    ><X size={16} /></button>
                </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
                {activeTab === "creator" ? (
                    <JobCreator
                        initialJob={editingJob}
                        onSave={(job) => {
                            saveJob(job);
                            setActiveTab("catalog");
                            setEditingJob(null);
                        }}
                        onRun={(jobDef) => {
                            handleRunJobDef(jobDef);
                        }}
                        onCancel={() => {
                            setEditingJob(null);
                            setActiveTab("catalog");
                        }}
                    />
                ) : (
                    <div style={{ height: "100%", overflow: "auto", padding: 12 }}>
                        {activeTab === "queue" && (
                            <>
                                {queue.length === 0 && (
                                    <div style={{ textAlign: "center", padding: "60px 0", color: "#3f3f46" }}>
                                        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16, opacity: 0.5 }}>
                                            <div style={{ width: 48, height: 48, borderRadius: 24, background: "rgba(255,255,255,0.03)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                <Play size={24} style={{ marginLeft: 4 }} />
                                            </div>
                                        </div>
                                        <div style={{ fontSize: 13, fontWeight: 500, color: "#71717a" }}>Queue is empty</div>
                                        <button
                                            onClick={() => setActiveTab("creator")}
                                            style={{ marginTop: 12, background: "none", border: "none", color: "#00e5a0", fontSize: 11, cursor: "pointer", textDecoration: "underline" }}
                                        > Create a new job</button>
                                    </div>
                                )}
                                {queue.map(job => (
                                    <JobItem
                                        key={job.id}
                                        job={job}
                                        removeJob={removeJob}
                                        stopJob={stopJob}
                                        draggable={true}
                                        onDragStart={(e) => handleDragStart(e, job.id)}
                                        onDragOver={(e) => handleDragOver(e, job.id)}
                                        onDrop={(e) => handleDrop(e, job.id)}
                                        isDragging={draggingId === job.id}
                                    />
                                ))}
                            </>
                        )}

                        {activeTab === "history" && (
                            <>
                                {history.map(job => (
                                    <JobItem key={job.id} job={job} removeJob={removeJob} stopJob={stopJob} />
                                ))}
                                {history.length === 0 && (
                                    <div style={{ textAlign: "center", padding: "60px 0", color: "#3f3f46", fontSize: 12 }}>No job history</div>
                                )}
                            </>
                        )}

                        {activeTab === "catalog" && (
                            <JobCatalog
                                jobs={savedJobs}
                                onRun={handleRunJobDef}
                                onEdit={(job) => {
                                    setEditingJob(job);
                                    setActiveTab("creator");
                                }}
                                onDelete={deleteJob}
                            />
                        )}

                        {activeTab === "commands" && (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16, padding: 12 }}>
                                {commands.map(cmd => (
                                    <CommandCard key={cmd.id} command={cmd} />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

const getCommandColor = (tags: string[]) => {
    if (tags.includes("architect")) return "#fb923c"; // Orange
    if (tags.includes("data")) return "#3b82f6"; // Blue (Primary)
    if (tags.includes("ecosystem")) return "#38bdf8"; // Cyan
    if (tags.includes("agent")) return "#00e5a0"; // Green
    if (tags.includes("channel")) return "#a78bfa"; // Purple
    if (tags.includes("messaging")) return "#f472b6"; // Pink
    if (tags.includes("topology")) return "#38bdf8"; // Cyan/Blue (Shared with Ecosystem?)
    if (tags.includes("group")) return "#f472b6"; // Pink coverage
    if (tags.includes("system")) return "#94a3b8"; // Slate
    if (tags.includes("artifact")) return "#fbbf24"; // Amber/Yellow
    if (tags.includes("modification")) return "#ef4444"; // Red
    return "#71717a"; // Default
};

function CommandCard({ command }: { command: CommandDefinition }) {
    const [isFlipped, setIsFlipped] = useState(false);
    const [animationState, setAnimationState] = useState<"idle" | "pressing" | "flipping">("idle");
    const color = getCommandColor(command.tags);

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
                perspective: "1200px",
                height: 180, // Taller to fit output
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
                {/* Front */}
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
                    justifyContent: "space-between",
                    boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
                    boxSizing: "border-box",
                }}>
                    <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 12 }}>
                            <div style={{
                                fontFamily: "'Space Grotesk', sans-serif",
                                fontWeight: 600,
                                fontSize: 13,
                                color: color,
                                display: "flex", alignItems: "center", gap: 6
                            }}>
                                <span style={{ fontSize: 10, opacity: 0.6 }}>/</span>
                                {command.id}
                            </div>
                            <div style={{
                                fontSize: 10,
                                color: color,
                                border: `1px solid ${color}20`,
                                borderRadius: 4,
                                padding: "2px 6px",
                                background: `${color}10`
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
                                background: `${color}10`,
                                border: `1px solid ${color}10`,
                                borderRadius: 4,
                                padding: "2px 6px",
                                color: color
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
                        <span style={{ color: color }}>●</span>
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
                        <div style={{ fontSize: 9, color: "#52525b", marginBottom: 4 }}>Output</div>
                        <div style={{ fontSize: 10, color: "#a1a1aa", lineHeight: 1.4 }}>
                            {command.output}
                        </div>
                    </div>
                </div>
            </div>
        </div>

    );
}

interface JobItemProps {
    job: Job;
    removeJob: (id: string) => void;
    stopJob: (id: string) => void;
    draggable?: boolean;
    onDragStart?: (e: React.DragEvent) => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDrop?: (e: React.DragEvent) => void;
    isDragging?: boolean;
}

function JobItem({ job, removeJob, stopJob, draggable, onDragStart, onDragOver, onDrop, isDragging }: JobItemProps) {
    const statusColors: Record<JobStatus, string> = {
        queued: "#a1a1aa",
        running: "#fbbf24",
        completed: "#00e5a0",
        failed: "#ef4444",
    };

    return (
        <div
            draggable={draggable && job.status === "queued"}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            style={{
                background: isDragging ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 8,
                padding: 12,
                marginBottom: 8,
                position: "relative",
                cursor: draggable && job.status === "queued" ? "grab" : "default",
                opacity: isDragging ? 0.5 : 1
            }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "#e4e4e7", display: "flex", alignItems: "center", gap: 6 }}>
                        {draggable && job.status === "queued" && <span style={{ color: "#52525b" }}>⋮⋮</span>}
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
                <div style={{ display: "flex", gap: 6 }}>
                    {job.status === "running" && (
                        <button
                            onClick={() => stopJob(job.id)}
                            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", cursor: "pointer", fontSize: 10, padding: "2px 6px", borderRadius: 4 }}
                            title="Stop"
                        >
                            Stop
                        </button>
                    )}
                    {(job.status !== "running") && (
                        <button
                            onClick={() => removeJob(job.id)}
                            style={{ background: "none", border: "none", color: "#52525b", cursor: "pointer", fontSize: 12 }}
                            title="Remove"
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>
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
                    {job.result && <div style={{ fontSize: 11, color: "#00e5a0", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}><Check size={12} /> {job.result}</div>}
                    {job.artifacts.length > 0 && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {job.artifacts.map(art => (
                                <div key={art.id} style={{
                                    background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.2)",
                                    borderRadius: 4, padding: "4px 8px", fontSize: 10, color: "#38bdf8",
                                    display: "flex", alignItems: "center", gap: 4
                                }}>
                                    <FileText size={10} /> {art.name}
                                    <span style={{ opacity: 0.5, marginLeft: 4 }}>{art.type}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {job.status === "failed" && job.result && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#ef4444" }}>
                    <AlertTriangle size={12} style={{ marginRight: 4, verticalAlign: "bottom" }} /> {job.result}
                </div>
            )}
        </div>
    );
}
