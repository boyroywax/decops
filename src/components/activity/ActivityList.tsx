import { useMemo } from "react";
import type { NotebookEntry } from "../../types";
import { dayKey } from "./utils";
import { ActivityItem } from "./ActivityItem";
import { GradientIcon } from "../shared/GradientIcon";
import { Zap, Edit } from "lucide-react";
import "../../styles/components/activity-list.css";

interface ActivityListProps {
    entries: NotebookEntry[];
    expandedId: string | null;
    setExpandedId: (id: string | null) => void;
    onWriteFirst?: () => void;
}

export function ActivityList({ entries, expandedId, setExpandedId, onWriteFirst }: ActivityListProps) {

    // Group by day
    const grouped = useMemo(() => {
        const groups: { day: string; entries: NotebookEntry[] }[] = [];
        let currentDay = "";
        for (const entry of entries) {
            const day = dayKey(entry.timestamp);
            if (day !== currentDay) {
                currentDay = day;
                groups.push({ day, entries: [entry] });
            } else {
                groups[groups.length - 1].entries.push(entry);
            }
        }
        return groups;
    }, [entries]);

    if (entries.length === 0) {
        return (
            <div className="activity-list__empty">
                <GradientIcon icon={Zap} size={48} gradient={["#00e5a0", "#38bdf8"]} />
                <div className="activity-list__empty-title">
                    No Activity Yet
                </div>
                <div className="activity-list__empty-desc">
                    As you navigate the app, create agents, run jobs, and send messages, your activity will be automatically captured here as a rich, auditable timeline.
                </div>
                {onWriteFirst && (
                    <button
                        onClick={onWriteFirst}
                        className="btn btn-primary activity-list__empty-btn"
                    >
                        <Edit size={12} /> Write your first entry
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="activity-list">
            {grouped.map((group, gi) => (
                <div key={group.day + gi} className="activity-list__group">
                    {/* Day header */}
                    <div className="activity-list__day-header">
                        <div className="activity-list__day-label">
                            {group.day}
                        </div>
                        <div className="activity-list__day-line" />
                        <div className="activity-list__day-count">
                            {group.entries.length} {group.entries.length === 1 ? "entry" : "entries"}
                        </div>
                    </div>

                    {/* Entries with timeline line */}
                    <div className="activity-list__entries">
                        {/* Timeline line */}
                        <div className="activity-list__timeline" />

                        {group.entries.map((entry) => (
                            <ActivityItem
                                key={entry.id}
                                entry={entry}
                                isExpanded={expandedId === entry.id}
                                onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                            />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
