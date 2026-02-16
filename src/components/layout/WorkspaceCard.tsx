import { useState } from "react";
import {
    Cpu, MessageSquare, Users, Network,
    Calendar, Trash2, Power, RotateCcw, Info
} from "lucide-react";
import { WorkspaceMetadata } from "../../types";

interface WorkspaceCardProps {
    workspace: WorkspaceMetadata;
    isActive: boolean;
    onSwitch: (id: string) => void;
    onDelete: (id: string) => void;
    onDuplicate: (id: string) => void;
}

export function WorkspaceCard({ workspace, isActive, onSwitch, onDelete, onDuplicate }: WorkspaceCardProps) {
    const [isFlipped, setIsFlipped] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const stats = workspace.stats || {
        agentCount: 0,
        channelCount: 0,
        groupCount: 0,
        networkCount: 0
    };

    // Reset delete state when card flips back
    if (!isFlipped && isDeleting) {
        setIsDeleting(false);
    }

    const [isHovered, setIsHovered] = useState(false);

    return (
        <div
            style={{
                perspective: "1000px",
                width: "100%",
                height: "220px",
                cursor: "pointer",
                zIndex: isFlipped || isHovered ? 10 : 1,
                position: "relative"
            }}
            onClick={() => setIsFlipped(!isFlipped)}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div style={{
                position: "relative",
                width: "100%",
                height: "100%",
                transition: "transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
                transformStyle: "preserve-3d",
                transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)"
            }}>
                {/* FRONT */}
                <div style={{
                    position: "absolute",
                    width: "100%",
                    height: "100%",
                    backfaceVisibility: "hidden",
                    background: isActive
                        ? "linear-gradient(135deg, rgba(0,229,160,0.05) 0%, #0a0a0f 100%)"
                        : "#0a0a0f",
                    border: isActive ? "1px solid #00e5a0" : "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                    padding: 20,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    boxShadow: isActive ? "0 0 30px rgba(0,229,160,0.15)" : "none"
                }}>
                    <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: isActive ? "#00e5a0" : "#e4e4e7" }}>
                                {workspace.name}
                            </h3>
                            {isActive && <div style={{
                                padding: "4px 8px",
                                borderRadius: 100,
                                background: "rgba(0,229,160,0.1)",
                                color: "#00e5a0",
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: "0.05em"
                            }}>ACTIVE</div>}
                        </div>
                        <div style={{ fontSize: 12, color: "#71717a", marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                            <Calendar size={12} />
                            Updated: {new Date(workspace.lastModified).toLocaleDateString()}
                        </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <StatItem icon={<Cpu size={14} color="#38bdf8" />} label="Agents" value={stats.agentCount} />
                        <StatItem icon={<MessageSquare size={14} color="#a78bfa" />} label="Channels" value={stats.channelCount} />
                        <StatItem icon={<Users size={14} color="#f472b6" />} label="Groups" value={stats.groupCount} />
                        <StatItem icon={<Network size={14} color="#fbbf24" />} label="Networks" value={stats.networkCount} />
                    </div>
                </div>

                {/* BACK */}
                <div style={{
                    position: "absolute",
                    width: "100%",
                    height: "100%",
                    backfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                    background: "#18181b",
                    border: isDeleting ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 12,
                    padding: 20,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between"
                }}>
                    {!isDeleting ? (
                        <>
                            <div>
                                <h3 style={{ margin: "0 0 12px 0", fontSize: 16, fontWeight: 600, color: "#e4e4e7" }}>
                                    Manage Workspace
                                </h3>
                                <p style={{ fontSize: 13, color: "#a1a1aa", margin: 0, lineHeight: 1.5 }}>
                                    {workspace.description || "No description provided."}
                                </p>
                                <div style={{ marginTop: 16, fontSize: 11, color: "#52525b", fontFamily: "monospace", background: "rgba(0,0,0,0.2)", padding: 6, borderRadius: 4 }}>
                                    {workspace.id}
                                </div>
                            </div>

                            <div style={{ display: "flex", gap: 10 }}>
                                {!isActive && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onSwitch(workspace.id); }}
                                        style={{
                                            flex: 1,
                                            height: 36,
                                            borderRadius: 6,
                                            background: "#00e5a0",
                                            border: "none",
                                            color: "#09090b",
                                            cursor: "pointer",
                                            fontWeight: 600,
                                            fontSize: 13,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            gap: 6
                                        }}
                                    >
                                        <Power size={14} /> Switch
                                    </button>
                                )}
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDuplicate(workspace.id); }}
                                    style={{
                                        flex: 1,
                                        height: 36,
                                        borderRadius: 6,
                                        background: "rgba(255,255,255,0.05)",
                                        border: "1px solid rgba(255,255,255,0.1)",
                                        color: "#e4e4e7",
                                        cursor: "pointer",
                                        fontWeight: 500,
                                        fontSize: 13,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        gap: 6
                                    }}
                                    title="Duplicate Workspace"
                                >
                                    <RotateCcw size={14} /> Copy
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setIsDeleting(true); }}
                                    style={{
                                        flex: 0,
                                        padding: "0 12px",
                                        height: 36,
                                        borderRadius: 6,
                                        background: "rgba(239,68,68,0.1)",
                                        border: "1px solid rgba(239,68,68,0.2)",
                                        color: "#ef4444",
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        gap: 6,
                                        fontSize: 13,
                                        fontWeight: 500,
                                        minWidth: 36
                                    }}
                                    title="Delete Workspace"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div style={{ textAlign: "center", paddingTop: 10 }}>
                                <Trash2 size={24} color="#ef4444" style={{ marginBottom: 12 }} />
                                <h3 style={{ margin: "0 0 8px 0", fontSize: 16, fontWeight: 600, color: "#e4e4e7" }}>
                                    Delete Workspace?
                                </h3>
                                <p style={{ fontSize: 13, color: "#a1a1aa", margin: 0 }}>
                                    This action cannot be undone. All agents and data will be lost.
                                </p>
                            </div>

                            <div style={{ display: "flex", gap: 10 }}>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setIsDeleting(false); }}
                                    style={{
                                        flex: 1,
                                        height: 36,
                                        borderRadius: 6,
                                        background: "rgba(255,255,255,0.05)",
                                        border: "1px solid rgba(255,255,255,0.1)",
                                        color: "#e4e4e7",
                                        cursor: "pointer",
                                        fontWeight: 500,
                                        fontSize: 13
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDelete(workspace.id); }}
                                    style={{
                                        flex: 1,
                                        height: 36,
                                        borderRadius: 6,
                                        background: "#ef4444",
                                        border: "none",
                                        color: "white",
                                        cursor: "pointer",
                                        fontWeight: 600,
                                        fontSize: 13
                                    }}
                                >
                                    Confirm
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function StatItem({ icon, label, value }: { icon: React.ReactNode, label: string, value: number }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.02)", padding: "6px 8px", borderRadius: 6 }}>
            {icon}
            <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#e4e4e7" }}>{value}</div>
                <div style={{ fontSize: 10, color: "#71717a" }}>{label}</div>
            </div>
        </div>
    );
}
