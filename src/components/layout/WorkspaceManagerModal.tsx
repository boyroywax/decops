import { useState, useRef, useEffect } from "react";
import { useWorkspaceManager } from "../../hooks/useWorkspaceManager";
import { useJobsContext } from "../../context/JobsContext";
import { X, Plus, Terminal, ArrowRight, Check } from "lucide-react";
import { WorkspaceCard } from "./WorkspaceCard";
import type { WorkspaceMetadata } from "../../types";
import "../../styles/components/workspace-modal.css";

interface WorkspaceManagerModalProps {
    onClose: () => void;
}

export function WorkspaceManagerModal({ onClose }: WorkspaceManagerModalProps) {
    const { workspaces, activeWorkspaceId } = useWorkspaceManager();
    const { addJob } = useJobsContext();
    const [isCreating, setIsCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [newDesc, setNewDesc] = useState("");

    // Track pending creation for the "switch now?" prompt
    const [pendingCreationName, setPendingCreationName] = useState<string | null>(null);
    const [switchPrompt, setSwitchPrompt] = useState<WorkspaceMetadata | null>(null);
    const prevWorkspaceIdsRef = useRef<Set<string>>(new Set(workspaces.map(w => w.id)));

    // Detect when a newly created workspace appears in the list
    useEffect(() => {
        if (!pendingCreationName) {
            prevWorkspaceIdsRef.current = new Set(workspaces.map(w => w.id));
            return;
        }
        const newWs = workspaces.find(w =>
            !prevWorkspaceIdsRef.current.has(w.id) && w.name === pendingCreationName
        );
        if (newWs) {
            setSwitchPrompt(newWs);
            setPendingCreationName(null);
            prevWorkspaceIdsRef.current = new Set(workspaces.map(w => w.id));
        }
    }, [workspaces, pendingCreationName]);

    const handleCreate = () => {
        if (!newName.trim()) return;

        const name = newName.trim();
        addJob({
            type: "create_workspace",
            request: {
                name,
                description: newDesc
            }
        });

        setPendingCreationName(name);
        setIsCreating(false);
        setNewName("");
        setNewDesc("");
    };

    const handleSwitchToNew = () => {
        if (switchPrompt) {
            handleSwitch(switchPrompt.id);
        }
        setSwitchPrompt(null);
    };

    const handleStayHere = () => {
        setSwitchPrompt(null);
    };

    const handleSwitch = (id: string) => {
        addJob({
            type: "switch_workspace",
            request: { id }
        });
        // We might want to close the modal, but the job is async.
        // Let's keep it open or close it? 
        // Switching might be fast or slow. Let's close it for now.
        onClose();
    };

    const handleDelete = (id: string) => {
        addJob({
            type: "delete_workspace",
            request: { id }
        });
    };

    const handleDuplicate = (id: string) => {
        addJob({
            type: "duplicate_workspace",
            request: { sourceId: id }
        });
    };

    // Click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if ((e.target as HTMLElement).closest('.workspace-modal-content') === null) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    return (
        <div className="ws-modal__backdrop">
            <div className="workspace-modal-content ws-modal__container">
                {/* Header */}
                <div className="ws-modal__header">
                    <div className="ws-modal__header-left">
                        <div className="ws-modal__header-icon">
                            <Terminal size={24} />
                        </div>
                        <div>
                            <h2 className="ws-modal__title">Workspace Manager</h2>
                            <p className="ws-modal__subtitle">
                                Switch between environments or create new isolated workspaces.
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="ws-modal__close-btn"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="ws-modal__content">
                    <div className="ws-modal__grid">
                        {/* Create New Card */}
                        <div
                            onClick={() => setIsCreating(true)}
                            className="ws-modal__create-card"
                        >
                            <div className="ws-modal__create-circle">
                                <Plus size={24} strokeWidth={2} />
                            </div>
                            <span className="ws-modal__create-label">Create New Workspace</span>
                        </div>

                        {/* Existing Workspaces */}
                        {workspaces.map(ws => (
                            <WorkspaceCard
                                key={ws.id}
                                workspace={ws}
                                isActive={ws.id === activeWorkspaceId}
                                onSwitch={handleSwitch}
                                onDelete={handleDelete}
                                onDuplicate={handleDuplicate}
                            />
                        ))}
                    </div>
                </div>

                {/* Creation Overlay */}
                {isCreating && (
                    <div className="ws-modal__overlay">
                        <div className="ws-modal__form">
                            <h3 className="ws-modal__form-title">Create Workspace</h3>

                            <div className="ws-modal__form-fields">
                                <div>
                                    <label className="ws-modal__label">Workspace Name</label>
                                    <input
                                        value={newName}
                                        onChange={e => setNewName(e.target.value)}
                                        placeholder="e.g., Development Environment"
                                        className="ws-modal__input"
                                        autoFocus
                                    />
                                </div>
                                <div>
                                    <label className="ws-modal__label">Description (Optional)</label>
                                    <textarea
                                        value={newDesc}
                                        onChange={e => setNewDesc(e.target.value)}
                                        placeholder="What is this workspace for?"
                                        className="ws-modal__textarea"
                                    />
                                </div>

                                <div className="ws-modal__form-actions">
                                    <button
                                        onClick={() => setIsCreating(false)}
                                        className="ws-modal__cancel-btn"
                                    >Cancel</button>
                                    <button
                                        onClick={handleCreate}
                                        disabled={!newName.trim()}
                                        className={`ws-modal__create-btn${newName.trim() ? " ws-modal__create-btn--enabled" : ""}`}
                                    >Create Workspace</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* Switch Prompt after workspace creation */}
                {switchPrompt && (
                    <div className="ws-modal__overlay ws-modal__overlay--switch">
                        <div className="ws-modal__switch-card">
                            <div className="ws-modal__switch-check">
                                <Check size={28} strokeWidth={2.5} />
                            </div>
                            <h3 className="ws-modal__switch-title">
                                Workspace Created
                            </h3>
                            <p className="ws-modal__switch-desc">
                                <strong>{switchPrompt.name}</strong> is ready. Would you like to switch to it now or stay in your current workspace?
                            </p>
                            <div className="ws-modal__switch-actions">
                                <button
                                    onClick={handleStayHere}
                                    className="ws-modal__stay-btn"
                                >Stay Here</button>
                                <button
                                    onClick={handleSwitchToNew}
                                    className="ws-modal__switch-btn"
                                >
                                    Switch Now <ArrowRight size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
