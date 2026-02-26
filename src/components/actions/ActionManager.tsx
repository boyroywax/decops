import { useState, useEffect } from "react";
import { X, Terminal, Zap, BookOpen, Activity, ChevronsUp, ChevronsDown, Briefcase, TerminalSquare, Clock } from "lucide-react";
import { ActionsMonitor } from "./ActionsMonitor";
import { AutomationsPanel } from "./AutomationsPanel";
import { HistoryPanel } from "./HistoryPanel";
import { UnifiedBuilder } from "./UnifiedBuilder";
import { CommandsPanel } from "./CommandsPanel";
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
    height: number;
    setHeight: (h: number) => void;
    isExpanded: boolean;
    onToggleExpand: () => void;
}

export function ActionManager({ onClose, isMobile, savedJobs, saveJob, deleteJob, height, setHeight, isExpanded, onToggleExpand }: ActionManagerProps) {
    const [isResizing, setIsResizing] = useState(false);
    const [activeTab, setActiveTab] = useState<"monitor" | "automations" | "history" | "catalog" | "commands" | "builder">("monitor");

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
            mode: jobDef.mode,
            ...(jobDef.storageDefaults ? { storageDefaults: jobDef.storageDefaults } : {}),
            ...(jobDef.deliverables ? { deliverables: jobDef.deliverables } : {}),
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
                            onClick={() => setActiveTab("automations")}
                            className={`action-manager__tab${activeTab === "automations" ? " action-manager__tab--active" : ""}`}
                        >
                            <Zap size={9} /> Automations
                        </button>
                        <button
                            onClick={() => setActiveTab("history")}
                            className={`action-manager__tab${activeTab === "history" ? " action-manager__tab--active" : ""}`}
                        >
                            <Clock size={9} /> History
                        </button>
                        <button
                            onClick={() => setActiveTab("catalog")}
                            className={`action-manager__tab${activeTab === "catalog" ? " action-manager__tab--active" : ""}`}
                        >
                            <Briefcase size={9} /> Job Catalog
                        </button>
                        <button
                            onClick={() => setActiveTab("commands")}
                            className={`action-manager__tab${activeTab === "commands" ? " action-manager__tab--active" : ""}`}
                        >
                            <TerminalSquare size={9} /> Commands
                        </button>
                        <button
                            onClick={() => setActiveTab("builder")}
                            className={`action-manager__tab${activeTab === "builder" ? " action-manager__tab--active" : ""}`}
                        >
                            <BookOpen size={9} /> Builder
                        </button>
                    </div>
                </div>

                <div className="action-manager__header-actions">
                    <button
                        onClick={onToggleExpand}
                        className="action-manager__expand-btn"
                        title={isExpanded ? "Collapse panel" : "Expand panel"}
                    >{isExpanded ? <ChevronsDown size={14} /> : <ChevronsUp size={14} />}</button>
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
                {activeTab === "automations" && (
                    <div className="action-manager__tab-content">
                        <AutomationsPanel />
                    </div>
                )}
                {activeTab === "history" && (
                    <div className="action-manager__tab-content">
                        <HistoryPanel />
                    </div>
                )}
                {activeTab === "catalog" && (
                    <div className="action-manager__tab-content">
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
                )}
                {activeTab === "commands" && (
                    <div className="action-manager__tab-content">
                        <CommandsPanel onRunCommand={(commandId, command) => {
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
