import { isValidElement } from "react";
import type { NotebookEntry } from "../../types";
import { CATEGORY_META, FALLBACK_META, isMarkdownCategory, relativeTime, renderMarkdown } from "./utils";
import "../../styles/components/activity-item.css";

interface ActivityItemProps {
    entry: NotebookEntry;
    isExpanded: boolean;
    onToggle: () => void;
}

export function ActivityItem({ entry, isExpanded, onToggle }: ActivityItemProps) {
    const meta = CATEGORY_META[entry.category] || FALLBACK_META;
    const useMarkdown = isMarkdownCategory(entry.category);

    return (
        <div className="activity-item" style={{ '--item-color': meta.color } as React.CSSProperties}>
            {/* Timeline dot */}
            <div className="activity-item__dot" />

            {/* Entry card */}
            <div
                onClick={onToggle}
                className={`activity-item__card ${isExpanded ? "activity-item__card--expanded" : ""}`}
                style={isExpanded ? { borderColor: meta.color + "40" } : undefined}
                onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.borderColor = "var(--border-medium)"; }}
                onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.borderColor = "var(--border-subtle)"; }}
            >
                {/* Header row */}
                <div className="activity-item__header">
                    <span className="activity-item__icon">
                        {isValidElement(entry.icon) ? entry.icon : (typeof entry.icon === 'string' ? entry.icon : meta.icon)}
                    </span>
                    <div className="activity-item__content">
                        <div className="activity-item__title-row">
                            <span className="activity-item__title">
                                {entry.title}
                            </span>
                            <span className="activity-item__badge" style={{ '--badge-color': meta.color } as React.CSSProperties}>
                                {meta.label}
                            </span>
                            {entry.tags?.includes("user-note") && (
                                <span className="activity-item__badge activity-item__badge--user">
                                    USER
                                </span>
                            )}
                        </div>

                        {/* Description — rendered as markdown for output/narrative categories */}
                        {useMarkdown ? (
                            <div
                                className="notebook-markdown activity-item__markdown"
                                dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.description) }}
                            />
                        ) : (
                            <div className="activity-item__description">
                                {entry.description}
                            </div>
                        )}
                    </div>
                    <div className="activity-item__time">
                        {relativeTime(entry.timestamp)}
                    </div>
                </div>

                {/* Tags */}
                {entry.tags && entry.tags.length > 0 && (
                    <div className="activity-item__tags">
                        {entry.tags.filter(t => t !== "user-note").map(tag => (
                            <span key={tag} className="activity-item__tag">
                                {tag}
                            </span>
                        ))}
                    </div>
                )}

                {/* Expanded details */}
                {isExpanded && entry.details && (
                    <div className="activity-item__details"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Try rendering details as markdown if it contains a result string */}
                        {typeof entry.details.result === "string" ? (
                            <div
                                className="notebook-markdown"
                                dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.details.result) }}
                            />
                        ) : (
                            <pre className="activity-item__details-pre">
                                {JSON.stringify(entry.details, null, 2)}
                            </pre>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
