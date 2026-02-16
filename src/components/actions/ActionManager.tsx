import { useState, useEffect } from "react";
import { X, LayoutGrid, List, Terminal, Play, Trash2, Plus, Zap, BookOpen, Activity } from "lucide-react";
import { ActionsMonitor } from "./ActionsMonitor";
import { UnifiedBuilder } from "./UnifiedBuilder";
import { ActionLibrary } from "./ActionLibrary";
import { JobCatalog } from "../jobs/JobCatalog";
import { useJobsContext } from "../../context/JobsContext";
import { useAutomations } from "../../context/AutomationsContext";
import { useEcosystemContext } from "../../context/EcosystemContext";
import { useWorkspaceContext } from "../../context/WorkspaceContext";
import { JobDefinition } from "../../types";

interface ActionManagerProps {
    onClose: () => void;
    isMobile?: boolean;
    savedJobs: any[];
    saveJob: (job: any) => void;
    deleteJob: (id: string) => void;
}

export function ActionManager({ onClose, isMobile, savedJobs, saveJob, deleteJob }: ActionManagerProps) {
    const [height, setHeight] = useState(500);
    const [isResizing, setIsResizing] = useState(false);
    const [activeTab, setActiveTab] = useState<"monitor" | "library" | "builder">("monitor");

    // Contexts
    const { jobs, addJob, removeJob, stopJob, clearJobs } = useJobsContext();
    const { automations, register, deleteAutomation } = useAutomations();

    // State to pass to Builder
    const [editingJob, setEditingJob] = useState<JobDefinition | null>(null);

    // Handlers
    const handleRunJob = (jobDef: JobDefinition) => {
        addJob({
            type: jobDef.name,
            request: { description: jobDef.description },
            steps: jobDef.steps,
            mode: jobDef.mode
        });
        setActiveTab("monitor");
    };

    const handleSaveAutomation = (automation: any) => {
        register(automation);
        setActiveTab("monitor");
    };

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
                        <Terminal size={12} color="#00e5a0" /> ACTION MANAGER
                    </span>
                    <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", padding: 3, borderRadius: 6 }}>
                        <button
                            onClick={() => setActiveTab("monitor")}
                            style={{
                                background: activeTab === "monitor" ? "rgba(255,255,255,0.08)" : "none",
                                color: activeTab === "monitor" ? "#fff" : "#71717a",
                                border: "none", borderRadius: 4, padding: "4px 10px", fontSize: 11, cursor: "pointer", transition: "all 0.15s",
                                fontWeight: activeTab === "monitor" ? 600 : 400,
                                display: "flex", alignItems: "center", gap: 6
                            }}
                        >
                            <Activity size={12} /> Monitor
                        </button>
                        <button
                            onClick={() => setActiveTab("library")}
                            style={{
                                background: activeTab === "library" ? "rgba(255,255,255,0.08)" : "none",
                                color: activeTab === "library" ? "#fff" : "#71717a",
                                border: "none", borderRadius: 4, padding: "4px 10px", fontSize: 11, cursor: "pointer", transition: "all 0.15s",
                                fontWeight: activeTab === "library" ? 600 : 400,
                                display: "flex", alignItems: "center", gap: 6
                            }}
                        >
                            <BookOpen size={12} /> Library
                        </button>
                        <button
                            onClick={() => setActiveTab("builder")}
                            style={{
                                background: activeTab === "builder" ? "rgba(255,255,255,0.08)" : "none",
                                color: activeTab === "builder" ? "#fff" : "#71717a",
                                border: "none", borderRadius: 4, padding: "4px 10px", fontSize: 11, cursor: "pointer", transition: "all 0.15s",
                                fontWeight: activeTab === "builder" ? 600 : 400,
                                display: "flex", alignItems: "center", gap: 6
                            }}
                        >
                            <Zap size={12} /> Builder
                        </button>
                    </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                        onClick={onClose}
                        style={{ background: "none", border: "none", color: "#71717a", cursor: "pointer", padding: 4 }}
                    ><X size={16} /></button>
                </div>
            </div>

            {/* Content Area */}
            <div style={{ flex: 1, overflow: "hidden", position: "relative", display: "flex", flexDirection: "column" }}>
                {activeTab === "monitor" && (
                    <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
                        <ActionsMonitor />
                    </div>
                )}
                {activeTab === "library" && (
                    <div style={{ flex: 1, overflow: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 32 }}>
                        <div>
                            <h3 style={{ fontSize: 16, fontWeight: 600, color: "#e4e4e7", marginBottom: 16 }}>Saved Jobs</h3>
                            <JobCatalog
                                jobs={savedJobs}
                                onRun={handleRunJob}
                                onEdit={(job) => {
                                    setEditingJob(job);
                                    setActiveTab("builder");
                                }}
                                onDelete={deleteJob}
                            />
                        </div>
                        <div>
                            <h3 style={{ fontSize: 16, fontWeight: 600, color: "#e4e4e7", marginBottom: 16 }}>Command Library</h3>
                            <ActionLibrary onRunCommand={() => { /* maybe open builder with this command? */ }} />
                        </div>
                    </div>
                )}
                {activeTab === "builder" && (
                    <UnifiedBuilder
                        onRunJob={handleRunJob}
                        onSaveAutomation={handleSaveAutomation}
                        onCancel={() => {
                            setEditingJob(null);
                            setActiveTab("monitor");
                        }}
                        initialJob={editingJob}
                    />
                )}
            </div>
        </div>
    );
}
