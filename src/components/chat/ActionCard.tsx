import { useState } from "react";
import { Bot, ArrowLeftRight, Hexagon, MessageSquare, Sparkles, Settings, PlusCircle, Image, FileJson, FileText } from "lucide-react";
import type { WorkspaceContext } from "../../services/ai";
import type { ParsedAction } from "./types";

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
        <div style={{
            background: `${meta.color}08`,
            border: `1px solid ${meta.color}30`,
            borderRadius: 8,
            padding: "8px 12px",
            marginTop: 6,
            fontSize: 11,
            position: "relative",
        }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: meta.color, display: "flex", alignItems: "center" }}>{meta.icon}</span>
                    <span style={{ color: meta.color, fontWeight: 600, fontSize: 10, letterSpacing: "0.05em" }}>{meta.label}</span>
                </div>

                {matchingJob ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{
                            fontSize: 9,
                            color: getStatusColor(matchingJob.status),
                            background: getStatusColor(matchingJob.status) + "20",
                            padding: "2px 6px",
                            borderRadius: 4,
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                            gap: 4
                        }}>
                            <span style={{
                                display: "inline-block", width: 4, height: 4, borderRadius: "50%",
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
                            style={{
                                background: "rgba(255,255,255,0.06)",
                                border: "1px solid rgba(255,255,255,0.1)",
                                color: "#a1a1aa",
                                borderRadius: 4,
                                padding: "2px 6px",
                                fontSize: 9,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                transition: "all 0.15s"
                            }}
                            title="Add to Job Queue"
                        >
                            <PlusCircle size={10} /> Add to Job
                        </button>
                    )
                )}
            </div>

            {details.map((d, i) => (
                <div key={i} style={{ color: "#a1a1aa", fontSize: 10, marginLeft: 16 }}>{d}</div>
            ))}

            {matchingJob && matchingJob.status === "completed" && matchingJob.artifacts.length > 0 && (
                <div style={{ marginTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8 }}>
                    <div style={{ fontSize: 10, color: "#71717a", marginBottom: 4 }}>Generated Artifacts:</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {matchingJob.artifacts.map((art: any) => (
                            <button
                                key={art.id}
                                onClick={() => setExpandedArtifact(expandedArtifact === art.id ? null : art.id)}
                                style={{
                                    background: expandedArtifact === art.id ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)",
                                    border: `1px solid ${expandedArtifact === art.id ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.08)"}`,
                                    borderRadius: 4,
                                    padding: "2px 6px",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                    color: expandedArtifact === art.id ? "#fff" : "#e4e4e7",
                                    cursor: "pointer",
                                    fontSize: 10,
                                    fontFamily: "inherit"
                                }}
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
                            <div style={{
                                marginTop: 8,
                                background: "rgba(0,0,0,0.3)",
                                border: "1px solid rgba(255,255,255,0.1)",
                                borderRadius: 6,
                                padding: 8,
                                fontSize: 10,
                                fontFamily: "monospace",
                                color: "#d4d4d8",
                                overflowX: "auto",
                                maxHeight: 200,
                                whiteSpace: "pre-wrap"
                            }}>
                                {content || "No content available"}
                            </div>
                        );
                    })()}
                </div>
            )}
        </div>
    );
}
