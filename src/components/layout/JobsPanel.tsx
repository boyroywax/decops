import { useState, useEffect } from "react";
import { X, Plus, Play, Trash2, LayoutGrid, List, Terminal, Loader2, Check, AlertTriangle, Clock, Maximize2, StopCircle, FileText, ImageIcon, Code } from "lucide-react";
import type { Job, JobArtifact, JobDefinition, JobStatus } from "../../types";
import { registry } from "../../services/commands/registry";
import { JobCreator } from "../jobs/JobCreator";
import { JobCatalog } from "../jobs/JobCatalog";
import { CommandCard } from "../jobs/CommandCard";

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
    const [activeTab, setActiveTab] = useState<"stream" | "catalog" | "commands">("stream");
    const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
    const [editingJob, setEditingJob] = useState<JobDefinition | null>(null);
    const [viewingJob, setViewingJob] = useState<Job | null>(null);
    const [viewingArtifact, setViewingArtifact] = useState<JobArtifact | null>(null);

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

    // Sort jobs: Running first, then by date desc
    const sortedJobs = [...jobs].sort((a, b) => {
        if (a.status === "running" && b.status !== "running") return -1;
        if (a.status !== "running" && b.status === "running") return 1;
        return b.createdAt - a.createdAt;
    });

    const commands = registry.getAll();

    const handleRunJobDef = (jobDef: JobDefinition) => {
        addJob({
            type: jobDef.name,
            request: { description: jobDef.description },
            jobDefinitionId: jobDef.id,
            steps: jobDef.steps,
            mode: jobDef.mode,
            status: "queued"
        });
        setActiveTab("stream");
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
                        <Terminal size={12} color="#00e5a0" /> JOB MANAGER
                    </span>
                    <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", padding: 3, borderRadius: 6 }}>
                        <button
                            onClick={() => { setEditingJob(null); setActiveTab("stream"); }}
                            style={{
                                background: activeTab === "stream" ? "rgba(255,255,255,0.08)" : "none",
                                color: activeTab === "stream" ? "#fff" : "#71717a",
                                border: "none", borderRadius: 4, padding: "4px 10px", fontSize: 11, cursor: "pointer", transition: "all 0.15s",
                                fontWeight: activeTab === "stream" ? 600 : 400
                            }}
                        >
                            Stream
                        </button>
                        <button
                            onClick={() => { setEditingJob(null); setActiveTab("catalog"); }}
                            style={{
                                background: activeTab === "catalog" ? "rgba(255,255,255,0.08)" : "none",
                                color: activeTab === "catalog" ? "#fff" : "#71717a",
                                border: "none", borderRadius: 4, padding: "4px 10px", fontSize: 11, cursor: "pointer", transition: "all 0.15s",
                                fontWeight: activeTab === "catalog" ? 600 : 400
                            }}
                        >
                            Catalog
                        </button>
                        <button
                            onClick={() => setActiveTab("commands")}
                            style={{
                                background: activeTab === "commands" ? "rgba(255,255,255,0.08)" : "none",
                                color: activeTab === "commands" ? "#fff" : "#71717a",
                                border: "none", borderRadius: 4, padding: "4px 10px", fontSize: 11, cursor: "pointer", transition: "all 0.15s",
                                fontWeight: activeTab === "commands" ? 600 : 400
                            }}
                        >
                            Commands
                        </button>
                    </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {activeTab === "stream" && sortedJobs.length > 0 && (
                        <button
                            onClick={clearJobs}
                            style={{
                                background: "rgba(239, 68, 68, 0.1)",
                                color: "#ef4444",
                                border: "1px solid rgba(239, 68, 68, 0.2)",
                                borderRadius: 4, padding: "4px 10px", fontSize: 10, cursor: "pointer",
                                display: "flex", alignItems: "center", gap: 4
                            }}
                        >
                            <Trash2 size={10} /> Clear
                        </button>
                    )}
                    {activeTab === "stream" && (
                        <div style={{ display: "flex", background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: 2 }}>
                            <button
                                onClick={() => setViewMode("grid")}
                                style={{
                                    background: viewMode === "grid" ? "rgba(255,255,255,0.1)" : "none",
                                    color: viewMode === "grid" ? "#fff" : "#71717a",
                                    border: "none", borderRadius: 4, padding: 4, cursor: "pointer", display: "flex"
                                }}
                                title="Grid View"
                            >
                                <LayoutGrid size={14} />
                            </button>
                            <button
                                onClick={() => setViewMode("table")}
                                style={{
                                    background: viewMode === "table" ? "rgba(255,255,255,0.1)" : "none",
                                    color: viewMode === "table" ? "#fff" : "#71717a",
                                    border: "none", borderRadius: 4, padding: 4, cursor: "pointer", display: "flex"
                                }}
                                title="Table View"
                            >
                                <List size={14} />
                            </button>
                        </div>
                    )}
                    <button
                        onClick={() => { setEditingJob(null); setActiveTab("catalog"); setTimeout(() => setEditingJob({} as any), 0); }}
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
                {activeTab === "catalog" && editingJob ? (
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
                        }}
                    />
                ) : (
                    <div style={{ height: "100%", overflow: "auto", padding: 12 }}>
                        {activeTab === "stream" && (
                            <>
                                {sortedJobs.length === 0 ? (
                                    <div style={{ textAlign: "center", padding: "60px 0", color: "#3f3f46" }}>
                                        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16, opacity: 0.5 }}>
                                            <div style={{ width: 48, height: 48, borderRadius: 24, background: "rgba(255,255,255,0.03)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                <Play size={24} style={{ marginLeft: 4 }} />
                                            </div>
                                        </div>
                                        <div style={{ fontSize: 13, fontWeight: 500, color: "#71717a" }}>No jobs found</div>
                                    </div>
                                ) : viewMode === "grid" ? (
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                                        {sortedJobs.map(job => (
                                            <JobCard
                                                key={job.id}
                                                job={job}
                                                removeJob={removeJob}
                                                stopJob={stopJob}
                                                onView={() => setViewingJob(job)}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                        {sortedJobs.map(job => (
                                            <JobRow
                                                key={job.id}
                                                job={job}
                                                removeJob={removeJob}
                                                stopJob={stopJob}
                                                onView={() => setViewingJob(job)}
                                            />
                                        ))}
                                    </div>
                                )}
                            </>
                        )}

                        {activeTab === "catalog" && !editingJob && (
                            <JobCatalog
                                jobs={savedJobs}
                                onRun={handleRunJobDef}
                                onEdit={(job) => {
                                    setEditingJob(job);
                                }}
                                onDelete={deleteJob}
                            />
                        )}

                        {activeTab === "commands" && (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
                                {commands.map(cmd => (
                                    <CommandCard key={cmd.id} command={cmd} />
                                ))}
                            </div>
                        )}
                    </div>
                )}

            </div>

            {viewingJob && (
                <JobDetailView
                    job={viewingJob}
                    onClose={() => setViewingJob(null)}
                    stopJob={stopJob}
                    removeJob={removeJob}
                    onViewArtifact={setViewingArtifact}
                />
            )}

            {viewingArtifact && (
                <ArtifactViewer
                    artifact={viewingArtifact}
                    onClose={() => setViewingArtifact(null)}
                />
            )}
        </div>

    );
}

interface JobCardProps {
    job: Job;
    removeJob: (id: string) => void;
    stopJob: (id: string) => void;
    onView: () => void;
}

function JobCard({ job, removeJob, stopJob, onView }: JobCardProps) {
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
                    <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
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
                                    {job.artifacts.map(art => (
                                        <div key={art.id} style={{
                                            background: "rgba(56,189,248,0.08)",
                                            border: "1px solid rgba(56,189,248,0.15)",
                                            borderRadius: 2,
                                            padding: "2px 6px",
                                            fontSize: 9,
                                            color: "#38bdf8",
                                            display: "flex", alignItems: "center", gap: 3
                                        }}>
                                            <FileText size={8} />
                                            {art.name}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>

    );
}

function JobRow({ job, removeJob, stopJob, onView }: JobCardProps) {
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

function JobDetailView({ job, onClose, stopJob, removeJob, onViewArtifact }: {
    job: Job,
    onClose: () => void,
    stopJob: (id: string) => void,
    removeJob: (id: string) => void,
    onViewArtifact: (art: JobArtifact) => void
}) {
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

function ArtifactViewer({ artifact, onClose }: { artifact: JobArtifact, onClose: () => void }) {
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
            background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)",
            zIndex: 60, display: "flex", justifyContent: "center", alignItems: "center",
            padding: 24
        }} onClick={onClose}>
            <div style={{
                width: "100%", maxWidth: 800, maxHeight: "90vh",
                background: "#09090b", border: "1px solid #27272a",
                borderRadius: 12, boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
                display: "flex", flexDirection: "column", overflow: "hidden"
            }} onClick={e => e.stopPropagation()}>
                <div style={{
                    padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)",
                    background: "rgba(255,255,255,0.02)",
                    display: "flex", justifyContent: "space-between", alignItems: "center"
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <FileText size={16} color="#38bdf8" />
                        <span style={{ fontWeight: 500, color: "#fff" }}>{artifact.name}</span>
                        <span style={{ fontSize: 10, background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: 4, color: "#a1a1aa" }}>{artifact.type}</span>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ background: "none", border: "none", color: "#71717a", cursor: "pointer", padding: 4 }}
                    ><X size={18} /></button>
                </div>

                <div style={{ flex: 1, overflow: "auto", background: "#000", padding: 0 }}>
                    {artifact.type === 'image' && artifact.url ? (
                        <div style={{ display: "flex", justifyContent: "center", padding: 20 }}>
                            <img src={artifact.url} alt={artifact.name} style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 4 }} />
                        </div>
                    ) : (
                        <pre style={{
                            margin: 0, padding: 20,
                            fontSize: 12, color: "#d4d4d8", fontFamily: "monospace", lineHeight: 1.5
                        }}>
                            {artifact.content || "No content available"}
                        </pre>
                    )}
                </div>
            </div>
        </div>
    );
}
