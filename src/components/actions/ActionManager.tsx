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
import "../../styles/components/action-manager.css";

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
        <div className={`action-manager${isResizing ? " action-manager--resizing" : ""}`} style={{ height }}>
            {/* Resize Handle */}
            <div onMouseDown={startResizing} className="action-manager__resize-handle">
                <div className="action-manager__resize-grip" />
            </div>

            {/* Header */}
            <div className="action-manager__header">
                <div className="action-manager__header-left">
                    <span className="action-manager__title">
                        <Terminal size={10} color="#00e5a0" /> ACTIONS
                    </span>
                    <span className="action-manager__separator">│</span>
                    <div className="action-manager__tabs">
                        <button
                            onClick={() => setActiveTab("monitor")}
                            className={`action-manager__tab${activeTab === "monitor" ? " action-manager__tab--active" : ""}`}
                        >
                            <Activity size={9} /> Monitor
                        </button>
                        <button
                            onClick={() => setActiveTab("library")}
                            className={`action-manager__tab${activeTab === "library" ? " action-manager__tab--active" : ""}`}
                        >
                            <BookOpen size={9} /> Library
                        </button>
                        <button
                            onClick={() => setActiveTab("builder")}
                            className={`action-manager__tab${activeTab === "builder" ? " action-manager__tab--active" : ""}`}
                        >
                            <Zap size={9} /> Builder
                        </button>
                    </div>
                </div>

                <div className="action-manager__header-actions">
                    <button
                        onClick={onClose}
                        className="action-manager__close-btn"
                        title="Close actions"
                    ><X size={14} /></button>
                </div>
            </div>

            {/* Content Area */}
            <div className="action-manager__content">
                {activeTab === "monitor" && (
                    <div className="action-manager__tab-content">
                        <ActionsMonitor />
                    </div>
                )}
                {activeTab === "library" && (
                    <div className="action-manager__library">
                        <div>
                            <h3 className="action-manager__section-title">Saved Jobs</h3>
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
                            <h3 className="action-manager__section-title">Command Library</h3>
                            <ActionLibrary onRunCommand={(commandId, command) => {
                                const step: import("../../types").JobStep = {
                                    id: `step-${Date.now()}`,
                                    commandId,
                                    args: Object.fromEntries(
                                        Object.values(command.args)
                                            .filter(a => a.defaultValue !== undefined)
                                            .map(a => [a.name, a.defaultValue])
                                    ),
                                    name: command.description,
                                    status: "pending",
                                };
                                addJob({
                                    type: commandId,
                                    request: { description: command.description },
                                    steps: [step],
                                    mode: "serial",
                                });
                                setActiveTab("monitor");
                            }} />
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
