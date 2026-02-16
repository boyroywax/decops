import { useState, useRef, useEffect } from "react";
import { useWorkspaceManager } from "../../hooks/useWorkspaceManager";
import { useJobsContext } from "../../context/JobsContext";
import { X, Plus, Terminal } from "lucide-react";
import { WorkspaceCard } from "./WorkspaceCard";

interface WorkspaceManagerModalProps {
    onClose: () => void;
}

export function WorkspaceManagerModal({ onClose }: WorkspaceManagerModalProps) {
    const { workspaces, activeWorkspaceId } = useWorkspaceManager();
    const { addJob } = useJobsContext();
    const [isCreating, setIsCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [newDesc, setNewDesc] = useState("");

    const handleCreate = () => {
        if (!newName.trim()) return;

        addJob({
            type: "create_workspace",
            request: {
                name: newName,
                description: newDesc
            }
        });

        setIsCreating(false);
        setNewName("");
        setNewDesc("");
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
        <div style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(8px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            animation: "fadeIn 0.2s ease-out"
        }}>
            <div
                className="workspace-modal-content"
                style={{
                    width: "100%",
                    maxWidth: 1000,
                    height: "85vh",
                    background: "#0a0a0f",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 24,
                    display: "flex",
                    flexDirection: "column",
                    boxShadow: "0 50px 100px -20px rgba(0,0,0,0.8)",
                    overflow: "hidden",
                    position: "relative"
                }}
            >
                {/* Header */}
                <div style={{
                    padding: "24px 32px",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "rgba(255,255,255,0.02)"
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <div style={{
                            width: 48, height: 48,
                            borderRadius: 12,
                            background: "linear-gradient(135deg, rgba(0,229,160,0.2) 0%, rgba(0,229,160,0.05) 100%)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            color: "#00e5a0",
                            border: "1px solid rgba(0,229,160,0.2)"
                        }}>
                            <Terminal size={24} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#e4e4e7", letterSpacing: "-0.01em" }}>Workspace Manager</h2>
                            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#a1a1aa" }}>
                                Switch between environments or create new isolated workspaces.
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        style={{
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.05)",
                            borderRadius: 8,
                            color: "#71717a",
                            cursor: "pointer",
                            width: 36, height: 36,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            transition: "all 0.2s"
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = "#e4e4e7"; e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
                        onMouseLeave={e => { e.currentTarget.style.color = "#71717a"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflowY: "auto", padding: 32 }}>
                    <div style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                        gap: 32,
                        paddingBottom: 40
                    }}>
                        {/* Create New Card */}
                        <div
                            onClick={() => setIsCreating(true)}
                            style={{
                                height: 220,
                                border: "1px dashed rgba(255,255,255,0.15)",
                                borderRadius: 12,
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                                background: "rgba(255,255,255,0.02)",
                                transition: "all 0.2s",
                                color: "#71717a"
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.borderColor = "#00e5a0";
                                e.currentTarget.style.color = "#00e5a0";
                                e.currentTarget.style.background = "rgba(0,229,160,0.05)";
                                e.currentTarget.style.transform = "translateY(-4px)";
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
                                e.currentTarget.style.color = "#71717a";
                                e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                                e.currentTarget.style.transform = "translateY(0)";
                            }}
                        >
                            <div style={{
                                width: 56, height: 56, borderRadius: "50%",
                                background: "rgba(255,255,255,0.05)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                marginBottom: 16
                            }}>
                                <Plus size={24} strokeWidth={2} />
                            </div>
                            <span style={{ fontSize: 15, fontWeight: 500 }}>Create New Workspace</span>
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
                    <div style={{
                        position: "absolute",
                        top: 0, left: 0, right: 0, bottom: 0,
                        background: "rgba(10,10,15,0.8)",
                        backdropFilter: "blur(4px)",
                        zIndex: 20,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        animation: "fadeIn 0.2s"
                    }}>
                        <div style={{
                            width: 440,
                            background: "#18181b",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: 16,
                            padding: 32,
                            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)"
                        }}>
                            <h3 style={{ margin: "0 0 24px", color: "#e4e4e7", fontSize: 20, fontWeight: 600 }}>Create Workspace</h3>

                            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                                <div>
                                    <label style={{ display: "block", fontSize: 13, color: "#a1a1aa", marginBottom: 8, fontWeight: 500 }}>Workspace Name</label>
                                    <input
                                        value={newName}
                                        onChange={e => setNewName(e.target.value)}
                                        placeholder="e.g., Development Environment"
                                        style={{
                                            width: "100%", padding: "12px 16px",
                                            background: "rgba(0,0,0,0.2)",
                                            border: "1px solid rgba(255,255,255,0.1)",
                                            borderRadius: 8,
                                            color: "white", outline: "none",
                                            fontSize: 14,
                                            fontFamily: "inherit"
                                        }}
                                        autoFocus
                                    />
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: 13, color: "#a1a1aa", marginBottom: 8, fontWeight: 500 }}>Description (Optional)</label>
                                    <textarea
                                        value={newDesc}
                                        onChange={e => setNewDesc(e.target.value)}
                                        placeholder="What is this workspace for?"
                                        style={{
                                            width: "100%", padding: "12px 16px",
                                            background: "rgba(0,0,0,0.2)",
                                            border: "1px solid rgba(255,255,255,0.1)",
                                            borderRadius: 8,
                                            color: "white", outline: "none",
                                            minHeight: 100, resize: "none",
                                            fontSize: 14,
                                            fontFamily: "inherit",
                                            lineHeight: 1.5
                                        }}
                                    />
                                </div>

                                <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                                    <button
                                        onClick={() => setIsCreating(false)}
                                        style={{
                                            flex: 1, padding: "12px",
                                            background: "transparent",
                                            border: "1px solid rgba(255,255,255,0.1)",
                                            color: "#e4e4e7",
                                            borderRadius: 8,
                                            cursor: "pointer",
                                            fontWeight: 500,
                                            fontSize: 14
                                        }}
                                    >Cancel</button>
                                    <button
                                        onClick={handleCreate}
                                        disabled={!newName.trim()}
                                        style={{
                                            flex: 1, padding: "12px",
                                            background: newName.trim() ? "#00e5a0" : "rgba(255,255,255,0.1)",
                                            border: "none",
                                            color: newName.trim() ? "#09090b" : "rgba(255,255,255,0.3)",
                                            fontWeight: 600,
                                            borderRadius: 8,
                                            cursor: newName.trim() ? "pointer" : "not-allowed",
                                            fontSize: 14
                                        }}
                                    >Create Workspace</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
