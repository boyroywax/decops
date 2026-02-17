import { useState } from "react";
import {
    Cpu, MessageSquare, Users, Network,
    Calendar, Trash2, Power, RotateCcw, Info
} from "lucide-react";
import { WorkspaceMetadata } from "../../types";
import "../../styles/components/workspace-card.css";

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
            className={`ws-card${(isFlipped || isHovered) ? " ws-card--elevated" : ""}${isActive ? " ws-card--active" : ""}`}
            onClick={() => setIsFlipped(!isFlipped)}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className={`ws-card__inner${isFlipped ? " ws-card__inner--flipped" : ""}`}>
                {/* FRONT */}
                <div className="ws-card__front">
                    <div>
                        <div className="ws-card__front-header">
                            <h3 className="ws-card__name">
                                {workspace.name}
                            </h3>
                            {isActive && <div className="ws-card__active-badge">ACTIVE</div>}
                        </div>
                        <div className="ws-card__date">
                            <Calendar size={12} />
                            Updated: {new Date(workspace.lastModified).toLocaleDateString()}
                        </div>
                    </div>

                    <div className="ws-card__stats">
                        <StatItem icon={<Cpu size={14} color="#38bdf8" />} label="Agents" value={stats.agentCount} />
                        <StatItem icon={<MessageSquare size={14} color="#a78bfa" />} label="Channels" value={stats.channelCount} />
                        <StatItem icon={<Users size={14} color="#f472b6" />} label="Groups" value={stats.groupCount} />
                        <StatItem icon={<Network size={14} color="#fbbf24" />} label="Networks" value={stats.networkCount} />
                    </div>
                </div>

                {/* BACK */}
                <div className={`ws-card__back${isDeleting ? " ws-card__back--deleting" : ""}`}>
                    {!isDeleting ? (
                        <>
                            <div>
                                <h3 className="ws-card__manage-title">
                                    Manage Workspace
                                </h3>
                                <p className="ws-card__description">
                                    {workspace.description || "No description provided."}
                                </p>
                                <div className="ws-card__id">
                                    {workspace.id}
                                </div>
                            </div>

                            <div className="ws-card__actions">
                                {!isActive && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onSwitch(workspace.id); }}
                                        className="ws-card__switch-btn"
                                    >
                                        <Power size={14} /> Switch
                                    </button>
                                )}
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDuplicate(workspace.id); }}
                                    className="ws-card__copy-btn"
                                    title="Duplicate Workspace"
                                >
                                    <RotateCcw size={14} /> Copy
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setIsDeleting(true); }}
                                    className="ws-card__delete-btn"
                                    title="Delete Workspace"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="ws-card__delete-confirm">
                                <Trash2 size={24} color="#ef4444" className="ws-card__delete-confirm-icon" />
                                <h3 className="ws-card__delete-confirm-title">
                                    Delete Workspace?
                                </h3>
                                <p className="ws-card__delete-confirm-text">
                                    This action cannot be undone. All agents and data will be lost.
                                </p>
                            </div>

                            <div className="ws-card__actions">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setIsDeleting(false); }}
                                    className="ws-card__cancel-btn"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDelete(workspace.id); }}
                                    className="ws-card__confirm-btn"
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
        <div className="ws-card__stat">
            {icon}
            <div>
                <div className="ws-card__stat-value">{value}</div>
                <div className="ws-card__stat-label">{label}</div>
            </div>
        </div>
    );
}
