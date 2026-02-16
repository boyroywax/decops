import { useState, useRef, useEffect } from "react";
import { useWorkspaceManager } from "../../hooks/useWorkspaceManager";
import { useWorkspaceContext } from "../../context/WorkspaceContext";
import { Grid, Plus, Download, Upload, Check, Trash2, FolderOpen, Save } from "lucide-react";
import { WorkspaceMetadata } from "../../types";

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
            className="workspace-menu-container"
            style={{
                position: "absolute",
                top: 50,
                right: 80, // Adjust based on header layout
                width: 320,
                background: "rgba(10, 10, 15, 0.95)",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(0, 229, 160, 0.2)",
                borderRadius: 12,
                padding: 16,
                zIndex: 1000,
                boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                display: "flex",
                flexDirection: "column",
                gap: 12
            }}
        >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#e4e4e7", display: "flex", alignItems: "center", gap: 8 }}>
                    <Grid size={14} color="#00e5a0" /> Workspaces
                </span>
                <div style={{ display: "flex", gap: 4 }}>
                    <button
                        onClick={handleSaveCurrent}
                        style={{ padding: 6, borderRadius: 6, background: "rgba(255,255,255,0.05)", border: "none", cursor: "pointer", color: "#a1a1aa" }}
                        title="Save Current Workspace"
                    >
                        <Save size={14} />
                    </button>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        style={{ padding: 6, borderRadius: 6, background: "rgba(255,255,255,0.05)", border: "none", cursor: "pointer", color: "#a1a1aa" }}
                        title="Import Workspace"
                    >
                        <Upload size={14} />
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleImportJSON} style={{ display: "none" }} accept=".json" />
                </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 300, overflowY: "auto" }}>
                {workspaces.map(ws => (
                    <div
                        key={ws.id}
                        onClick={() => handleSwitchWorkspace(ws.id)}
                        style={{
                            padding: "10px 12px",
                            borderRadius: 8,
                            background: ws.id === activeWorkspaceId ? "rgba(0, 229, 160, 0.1)" : "transparent",
                            border: ws.id === activeWorkspaceId ? "1px solid rgba(0, 229, 160, 0.2)" : "1px solid transparent",
                            cursor: "pointer",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            transition: "all 0.2s"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = ws.id === activeWorkspaceId ? "rgba(0, 229, 160, 0.15)" : "rgba(255,255,255,0.03)"}
                        onMouseLeave={(e) => e.currentTarget.style.background = ws.id === activeWorkspaceId ? "rgba(0, 229, 160, 0.1)" : "transparent"}
                    >
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <div style={{ fontSize: 13, color: ws.id === activeWorkspaceId ? "#fff" : "#e4e4e7", fontWeight: 500 }}>
                                {ws.name}
                            </div>
                            <div style={{ fontSize: 10, color: "#71717a" }}>
                                {new Date(ws.lastModified).toLocaleDateString()}
                            </div>
                        </div>
                        {ws.id === activeWorkspaceId ? (
                            <Check size={14} color="#00e5a0" />
                        ) : (
                            <button
                                onClick={(e) => handleDelete(e, ws.id)}
                                style={{ padding: 4, background: "none", border: "none", cursor: "pointer", color: "#52525b" }}
                                title="Delete Workspace"
                            >
                                <Trash2 size={13} />
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {isCreating ? (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <input
                        value={newWorkspaceName}
                        onChange={e => setNewWorkspaceName(e.target.value)}
                        placeholder="Workspace Name"
                        style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "#000", color: "white", fontSize: 12 }}
                        autoFocus
                        onKeyDown={e => e.key === 'Enter' && handleCreateWorkspace()}
                    />
                    <button
                        onClick={handleCreateWorkspace}
                        style={{ padding: "6px 10px", borderRadius: 6, background: "#00e5a0", color: "#000", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                    >Create</button>
                </div>
            ) : (
                <button
                    onClick={() => setIsCreating(true)}
                    style={{
                        marginTop: 4,
                        padding: "8px",
                        borderRadius: 8,
                        border: "1px dashed rgba(255,255,255,0.1)",
                        background: "none",
                        color: "#a1a1aa",
                        fontSize: 12,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6
                    }}
                >
                    <Plus size={14} /> New Workspace
                </button>
            )}

            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
                <button
                    onClick={handleExportJSON}
                    style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        background: "rgba(255,255,255,0.05)",
                        color: "#e4e4e7",
                        border: "none",
                        fontSize: 11,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 6
                    }}
                >
                    <Download size={12} /> Export JSON
                </button>
            </div>
        </div>
    );
}
