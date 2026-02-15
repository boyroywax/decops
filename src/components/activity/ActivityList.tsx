import { useMemo } from "react";
import type { NotebookEntry } from "../../types";
import { dayKey } from "./utils";
import { ActivityItem } from "./ActivityItem";
import { GradientIcon } from "../shared/GradientIcon";
import { Zap, Edit } from "lucide-react";

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
            <div style={{
                textAlign: "center",
                padding: "60px 24px",
                color: "var(--text-subtle)",
                fontFamily: "var(--font-mono)",
            }}>
                <GradientIcon icon={Zap} size={48} gradient={["#00e5a0", "#38bdf8"]} />
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" }}>
                    No Activity Yet
                </div>
                <div style={{ fontSize: 12, maxWidth: 400, margin: "0 auto", lineHeight: 1.6 }}>
                    As you navigate the app, create agents, run jobs, and send messages, your activity will be automatically captured here as a rich, auditable timeline.
                </div>
                {onWriteFirst && (
                    <button
                        onClick={onWriteFirst}
                        className="btn btn-primary"
                        style={{ marginTop: 20, fontSize: 12, padding: "8px 20px", color: "#000" }}
                    >
                        <Edit size={12} /> Write your first entry
                    </button>
                )}
            </div>
        );
    }

    return (
        <div style={{ position: "relative" }}>
            {grouped.map((group, gi) => (
                <div key={group.day + gi} style={{ marginBottom: 24 }}>
                    {/* Day header */}
                    <div style={{
                        display: "flex", alignItems: "center", gap: 12, marginBottom: 16,
                    }}>
                        <div style={{
                            fontSize: 11, fontWeight: 700, color: "var(--text-secondary)",
                            fontFamily: "var(--font-mono)", letterSpacing: "0.05em",
                            textTransform: "uppercase",
                            whiteSpace: "nowrap",
                        }}>
                            {group.day}
                        </div>
                        <div style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
                        <div style={{
                            fontSize: 10, color: "var(--text-ghost)",
                            fontFamily: "var(--font-mono)",
                        }}>
                            {group.entries.length} {group.entries.length === 1 ? "entry" : "entries"}
                        </div>
                    </div>

                    {/* Entries with timeline line */}
                    <div style={{ position: "relative", paddingLeft: 28 }}>
                        {/* Timeline line */}
                        <div style={{
                            position: "absolute", left: 9, top: 6, bottom: 6, width: 2,
                            background: "linear-gradient(180deg, rgba(0,229,160,0.3) 0%, rgba(0,229,160,0.05) 100%)",
                            borderRadius: 1,
                        }} />

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
