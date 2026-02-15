import { isValidElement } from "react";
import type { NotebookEntry } from "../../types";
import { CATEGORY_META, FALLBACK_META, isMarkdownCategory, relativeTime, renderMarkdown } from "./utils";

interface ActivityItemProps {
    entry: NotebookEntry;
    isExpanded: boolean;
    onToggle: () => void;
}

export function ActivityItem({ entry, isExpanded, onToggle }: ActivityItemProps) {
    const meta = CATEGORY_META[entry.category] || FALLBACK_META;
    const useMarkdown = isMarkdownCategory(entry.category);

    return (
        <div style={{ position: "relative", marginBottom: 12 }}>
            {/* Timeline dot */}
            <div style={{
                position: "absolute", left: -22, top: 14,
                width: 10, height: 10, borderRadius: "50%",
                background: meta.color,
                border: "2px solid #0a0a0f",
                zIndex: 1,
            }} />

            {/* Entry card */}
            <div
                onClick={onToggle}
                style={{
                    padding: "12px 16px",
                    background: "rgba(255,255,255,0.02)",
                    border: `1px solid ${isExpanded ? meta.color + "40" : "var(--border-subtle)"}`,
                    borderRadius: "var(--radius-xl)",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                }}
                onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.borderColor = "var(--border-medium)"; }}
                onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.borderColor = "var(--border-subtle)"; }}
            >
                {/* Header row */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 16, flexShrink: 0 }}>
                        {isValidElement(entry.icon) ? entry.icon : (typeof entry.icon === 'string' ? entry.icon : meta.icon)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{
                                fontSize: 13, fontWeight: 600,
                                color: "var(--text-primary)",
                                fontFamily: "var(--font-display)",
                            }}>
                                {entry.title}
                            </span>
                            <span style={{
                                fontSize: 9, fontWeight: 600,
                                padding: "2px 6px", borderRadius: 3,
                                background: meta.color + "18",
                                color: meta.color,
                                fontFamily: "var(--font-mono)",
                                letterSpacing: "0.03em",
                                textTransform: "uppercase",
                            }}>
                                {meta.label}
                            </span>
                            {entry.tags?.includes("user-note") && (
                                <span style={{
                                    fontSize: 9, fontWeight: 600,
                                    padding: "2px 6px", borderRadius: 3,
                                    background: "rgba(251,191,36,0.12)",
                                    color: "#fbbf24",
                                    fontFamily: "var(--font-mono)",
                                }}>
                                    USER
                                </span>
                            )}
                        </div>

                        {/* Description — rendered as markdown for output/narrative categories */}
                        {useMarkdown ? (
                            <div
                                className="notebook-markdown"
                                style={{
                                    fontSize: 12, color: "var(--text-secondary)",
                                    marginTop: 4, lineHeight: 1.6,
                                }}
                                dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.description) }}
                            />
                        ) : (
                            <div style={{
                                fontSize: 12, color: "var(--text-subtle)",
                                marginTop: 2, lineHeight: 1.4,
                            }}>
                                {entry.description}
                            </div>
                        )}
                    </div>
                    <div style={{
                        fontSize: 10, color: "var(--text-ghost)",
                        fontFamily: "var(--font-mono)",
                        flexShrink: 0, whiteSpace: "nowrap",
                        alignSelf: "flex-start",
                        marginTop: 2,
                    }}>
                        {relativeTime(entry.timestamp)}
                    </div>
                </div>

                {/* Tags */}
                {entry.tags && entry.tags.length > 0 && (
                    <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
                        {entry.tags.filter(t => t !== "user-note").map(tag => (
                            <span key={tag} style={{
                                fontSize: 9, padding: "1px 6px", borderRadius: 4,
                                background: "rgba(255,255,255,0.05)",
                                color: "var(--text-ghost)",
                                fontFamily: "var(--font-mono)",
                            }}>
                                {tag}
                            </span>
                        ))}
                    </div>
                )}

                {/* Expanded details */}
                {isExpanded && entry.details && (
                    <div style={{
                        marginTop: 12, padding: 12,
                        background: "rgba(0,0,0,0.3)",
                        borderRadius: "var(--radius-lg)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--text-secondary)",
                        overflowX: "auto",
                        maxHeight: 300,
                        overflowY: "auto",
                    }}
                        onClick={e => e.stopPropagation()} // Prevent collapse when interacting with details? No, let's allow collapse on click anywhere on card, but maybe text selection needs care.
                    >
                        {/* Try rendering details as markdown if it contains a result string */}
                        {typeof entry.details.result === "string" ? (
                            <div
                                className="notebook-markdown"
                                dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.details.result) }}
                            />
                        ) : (
                            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                                {JSON.stringify(entry.details, null, 2)}
                            </pre>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
