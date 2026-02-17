import { useState, useRef, useEffect } from "react";
import { useWorkspaceManager } from "../../hooks/useWorkspaceManager";
import { useWorkspaceContext } from "../../context/WorkspaceContext";
import { Grid, Plus, Download, Upload, Check, Trash2, FolderOpen, Save } from "lucide-react";
import { WorkspaceMetadata } from "../../types";
import "../../styles/components/workspace-manager.css";

interface WorkspaceManagerProps {
    onClose: () => void;
}

export function WorkspaceManager({ onClose }: WorkspaceManagerProps) {
    const { workspaces, activeWorkspaceId, setActiveWorkspaceId, createWorkspace, saveWorkspace, loadWorkspace, deleteWorkspace } = useWorkspaceManager();
    const { exportWorkspace, importWorkspace, clearWorkspace } = useWorkspaceContext();
    const [newWorkspaceName, setNewWorkspaceName] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSwitchWorkspace = (id: string) => {
        if (id === activeWorkspaceId) return;

        // Auto-save current if valid? 
        // For now, let's assume manual save or auto-save logic elsewhere. 
        // Ideally we should save the *current* active Active Workspace state before switching.
        if (activeWorkspaceId) {
            const currentData = exportWorkspace();
            // We need the full object to save. We can reconstruct it or construct a partial one.
            // The hook expects a full Workspace object.
            // Let's load the *current metadata* to get the name/desc.
            const currentMeta = workspaces.find(w => w.id === activeWorkspaceId);
            if (currentMeta) {
                saveWorkspace({
                    metadata: currentMeta,
                    ...currentData
                });
            }
        }

        const newWorkspace = loadWorkspace(id);
        if (newWorkspace) {
            clearWorkspace(); // Reset current state
            importWorkspace(newWorkspace);
            setActiveWorkspaceId(id);
        } else {
            // Error loading?
            console.error("Could not load workspace", id);
        }
    };

    const handleCreateWorkspace = () => {
        if (!newWorkspaceName.trim()) return;

        // Save current before switching
        if (activeWorkspaceId) {
            const currentData = exportWorkspace();
            const currentMeta = workspaces.find(w => w.id === activeWorkspaceId);
            if (currentMeta) {
                saveWorkspace({
                    metadata: currentMeta,
                    ...currentData
                });
            }
        }

        const newWs = createWorkspace(newWorkspaceName.trim());
        clearWorkspace(); // Reset UI
        // New workspace starts empty, so no need to import anything other than maybe default agents if we wanted.
        setIsCreating(false);
        setNewWorkspaceName("");
    };

    const handleSaveCurrent = () => {
        if (activeWorkspaceId) {
            const currentData = exportWorkspace();
            const currentMeta = workspaces.find(w => w.id === activeWorkspaceId);
            if (currentMeta) {
                saveWorkspace({
                    metadata: currentMeta,
                    ...currentData
                });
                // Maybe show toast?
            }
        }
    };

    const handleExportJSON = () => {
        if (activeWorkspaceId) {
            const currentData = exportWorkspace();
            const currentMeta = workspaces.find(w => w.id === activeWorkspaceId);
            if (currentMeta) {
                const fullData = { metadata: currentMeta, ...currentData };
                const blob = new Blob([JSON.stringify(fullData, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `decops-workspace-${currentMeta.name.replace(/\s+/g, '-').toLowerCase()}.json`;
                a.click();
                URL.revokeObjectURL(url);
            }
        }
    };

    const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                if (json.metadata && json.agents) {
                    // Valid workspace?
                    // Create a new ID to avoid collisions or keep existing?
                    // Let's create a copy with a new ID to be safe if it conflicts? 
                    // Or just use `createWorkspace` logic but populate it.
                    // For simplicty, let's treat it as a "New" workspace with imported data.
                    const newId = crypto.randomUUID();
                    const importedMeta = { ...json.metadata, id: newId, name: `${json.metadata.name} (Imported)` };
                    const importedWorkspace = { ...json, metadata: importedMeta };

                    // Allow useWorkspaceManager to save it
                    saveWorkspace(importedWorkspace);

                    // Add to metadata list manually (since saveWorkspace updates via setWorkspaces if exists, but we need to Add it)
                    // Wait, `saveWorkspace` logic in hook updates `lastModified` but does NOT add new if missing?
                    // Let's check hook logic. 
                    // Hook: `setWorkspaces(prev => prev.map(...))` -> IT ONLY UPDATES. 
                    // We need a way to "Register" a saved workspace if it's new.
                    // `createWorkspace` adds to list.

                    // FIX: `useWorkspaceManager` needs an `addWorkspace` or `saveWorkspace` should handle new.
                    // Let's assume for now we call create first then save.
                    const newWs = createWorkspace(importedMeta.name);
                    // Now overwrite it
                    saveWorkspace({ ...importedWorkspace, metadata: { ...importedMeta, id: newWs.metadata.id } });

                    // Switch to it
                    handleSwitchWorkspace(newWs.metadata.id);
                }
            } catch (err) {
                console.error("Invalid workspace file", err);
            }
        };
        reader.readAsText(file);
    };

    const handleDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm("Are you sure you want to delete this workspace?")) {
            deleteWorkspace(id);
        }
    };

    // Click outside to close
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if ((event.target as HTMLElement).closest('.workspace-menu-container') === null) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    return (
        <div
            className="workspace-menu-container workspace-manager"
        >
            <div className="workspace-manager__header">
                <span className="workspace-manager__title">
                    <Grid size={14} color="#00e5a0" /> Workspaces
                </span>
                <div className="workspace-manager__header-actions">
                    <button
                        onClick={handleSaveCurrent}
                        className="workspace-manager__icon-btn"
                        title="Save Current Workspace"
                    >
                        <Save size={14} />
                    </button>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="workspace-manager__icon-btn"
                        title="Import Workspace"
                    >
                        <Upload size={14} />
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleImportJSON} className="workspace-manager__file-input" accept=".json" />
                </div>
            </div>

            <div className="workspace-manager__list">
                {workspaces.map(ws => (
                    <div
                        key={ws.id}
                        onClick={() => handleSwitchWorkspace(ws.id)}
                        className={`workspace-manager__item ${ws.id === activeWorkspaceId ? "workspace-manager__item--active" : ""}`}
                        onMouseEnter={(e) => { if (ws.id !== activeWorkspaceId) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                        onMouseLeave={(e) => { if (ws.id !== activeWorkspaceId) e.currentTarget.style.background = "transparent"; }}
                    >
                        <div className="workspace-manager__item-info">
                            <div className={`workspace-manager__item-name ${ws.id === activeWorkspaceId ? "workspace-manager__item-name--active" : ""}`}>
                                {ws.name}
                            </div>
                            <div className="workspace-manager__item-date">
                                {new Date(ws.lastModified).toLocaleDateString()}
                            </div>
                        </div>
                        {ws.id === activeWorkspaceId ? (
                            <Check size={14} color="#00e5a0" />
                        ) : (
                            <button
                                onClick={(e) => handleDelete(e, ws.id)}
                                className="workspace-manager__delete-btn"
                                title="Delete Workspace"
                            >
                                <Trash2 size={13} />
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {isCreating ? (
                <div className="workspace-manager__create-form">
                    <input
                        value={newWorkspaceName}
                        onChange={e => setNewWorkspaceName(e.target.value)}
                        placeholder="Workspace Name"
                        className="workspace-manager__create-input"
                        autoFocus
                        onKeyDown={e => e.key === 'Enter' && handleCreateWorkspace()}
                    />
                    <button
                        onClick={handleCreateWorkspace}
                        className="workspace-manager__create-submit"
                    >Create</button>
                </div>
            ) : (
                <button
                    onClick={() => setIsCreating(true)}
                    className="workspace-manager__new-btn"
                >
                    <Plus size={14} /> New Workspace
                </button>
            )}

            <div className="workspace-manager__footer">
                <button
                    onClick={handleExportJSON}
                    className="workspace-manager__export-btn"
                >
                    <Download size={12} /> Export JSON
                </button>
            </div>
        </div>
    );
}
