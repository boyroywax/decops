import { useState } from "react";
import { Bot, ArrowLeftRight, Hexagon, MessageSquare, Sparkles, Settings, PlusCircle, Image, FileJson, FileText } from "lucide-react";
import type { WorkspaceContext } from "../../services/ai";
import type { ParsedAction } from "./types";
import "../../styles/components/action-card.css";

interface ActionCardProps {
    action: ParsedAction;
    context: WorkspaceContext;
}

export default function ActionCard({ action, context }: ActionCardProps) {
    const typeLabels: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
        create_agent: { icon: <Bot size={12} color="#00e5a0" />, color: "#00e5a0", label: "Create Agent" },
        create_channel: { icon: <ArrowLeftRight size={12} color="#a78bfa" />, color: "#a78bfa", label: "Create Channel" },
        create_group: { icon: <Hexagon size={12} color="#f472b6" />, color: "#f472b6", label: "Create Group" },
        send_message: { icon: <MessageSquare size={12} color="#fbbf24" />, color: "#fbbf24", label: "Send Message" },
        generate_mesh: { icon: <Sparkles size={12} color="#fbbf24" />, color: "#fbbf24", label: "Generate Mesh" },
    };

    const meta = typeLabels[action.type] || { icon: <Settings size={12} color="#71717a" />, color: "#71717a", label: action.type };
    const details = Object.entries(action)
        .filter(([k]) => k !== "type")
        .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);

    // Check if this action is associated with a job
    const matchingJob = context.jobs?.find(j =>
        j.type === action.type &&
        JSON.stringify(j.request) === JSON.stringify(action)
    );

    const getStatusColor = (status: string) => {
        switch (status) {
            case "queued": return "#fbbf24";
            case "running": return "#38bdf8";
            case "completed": return "#00e5a0";
            case "failed": return "#ef4444";
            default: return "#71717a";
        }
    };

    const [expandedArtifact, setExpandedArtifact] = useState<string | null>(null);

    return (
        <div className="action-card" style={{
            background: `${meta.color}08`,
            border: `1px solid ${meta.color}30`,
        }}>
            <div className="action-card__header">
                <div className="action-card__type">
                    <span className="action-card__type-icon" style={{ color: meta.color }}>{meta.icon}</span>
                    <span className="action-card__type-label" style={{ color: meta.color }}>{meta.label}</span>
                </div>

                {matchingJob ? (
                    <div className="action-card__status-group">
                        <span className="action-card__status" style={{
                            color: getStatusColor(matchingJob.status),
                            background: getStatusColor(matchingJob.status) + "20",
                        }}>
                            <span className="action-card__status-dot" style={{
                                background: getStatusColor(matchingJob.status),
                                boxShadow: matchingJob.status === "running" ? `0 0 4px ${getStatusColor(matchingJob.status)}` : "none"
                            }} />
                            {matchingJob.status.toUpperCase()}
                        </span>
                    </div>
                ) : (
                    context.addJob && (
                        <button
                            onClick={() => context.addJob!({ type: action.type, request: action })}
                            className="action-card__add-btn"
                            title="Add to Job Queue"
                        >
                            <PlusCircle size={10} /> Add to Job
                        </button>
                    )
                )}
            </div>

            {details.map((d, i) => (
                <div key={i} className="action-card__detail">{d}</div>
            ))}

            {matchingJob && matchingJob.status === "completed" && matchingJob.artifacts.length > 0 && (
                <div className="action-card__artifacts">
                    <div className="action-card__artifacts-title">Generated Artifacts:</div>
                    <div className="action-card__artifacts-list">
                        {matchingJob.artifacts.map((art: any) => (
                            <button
                                key={art.id}
                                onClick={() => setExpandedArtifact(expandedArtifact === art.id ? null : art.id)}
                                className={`action-card__artifact-btn ${expandedArtifact === art.id ? "action-card__artifact-btn--active" : ""}`}
                            >
                                {art.type === "image" ? <Image size={10} /> : art.type === "json" ? <FileJson size={10} /> : <FileText size={10} />}
                                {art.name}
                            </button>
                        ))}
                    </div>
                    {expandedArtifact && (() => {
                        const art = matchingJob.artifacts.find((a: any) => a.id === expandedArtifact);
                        if (!art) return null;

                        let content = art.content;
                        if (!content && art.url) {
                            content = typeof art.url === "object" ? JSON.stringify(art.url, null, 2) : art.url;
                        }

                        return (
                            <div className="action-card__artifact-content">
                                {content || "No content available"}
                            </div>
                        );
                    })()}
                </div>
            )}
        </div>
    );
}
