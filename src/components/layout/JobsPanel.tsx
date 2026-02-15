import { useState, useEffect } from "react";
import { X, Plus, Play, Trash2, LayoutGrid, List, Terminal, Loader2, Check, AlertTriangle, Clock, Maximize2, StopCircle, FileText, ImageIcon, Code } from "lucide-react";
import type { Job, JobArtifact, JobDefinition, JobStatus } from "../../types";
import { registry } from "../../services/commands/registry";
import { JobCreator } from "../jobs/JobCreator";
import { JobCatalog } from "../jobs/JobCatalog";
import { CommandCard } from "../jobs/CommandCard";
import { JobCard } from "../jobs/JobCard";
import { JobRow } from "../jobs/JobRow";
import { JobDetailView } from "../jobs/JobDetailView";
import { ArtifactViewer } from "../jobs/ArtifactViewer";

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
