import { useState, useMemo } from "react";
import type { NotebookEntry, NotebookCategory } from "../../types";
import { Zap, Download, Edit, Trash2 } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import { ComposePanel } from "../activity/ComposePanel";
import { ActivityFilter } from "../activity/ActivityFilter";
import { ActivityList } from "../activity/ActivityList";

interface ActivityViewProps {
    entries: NotebookEntry[];
    clearNotebook: () => void;
    exportNotebook: () => void;
    addEntry: (entry: Omit<NotebookEntry, "id" | "timestamp">) => void;
}

export function ActivityView({ entries, clearNotebook, exportNotebook, addEntry }: ActivityViewProps) {

    const safeEntries = Array.isArray(entries) ? entries : [];

    const [search, setSearch] = useState("");
    const [activeFilters, setActiveFilters] = useState<Set<NotebookCategory>>(new Set(["action", "output", "navigation", "system", "narrative"]));
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [showCompose, setShowCompose] = useState(false);

    const toggleFilter = (cat: NotebookCategory) => {
        setActiveFilters(prev => {
            const next = new Set(prev);
            if (next.has(cat)) next.delete(cat);
            else next.add(cat);
            return next;
        });
    };

    const filtered = useMemo(() => {
        return safeEntries.filter(e => {
            if (!activeFilters.has(e.category)) return false;
            if (search) {
                const q = search.toLowerCase();
                return e.title.toLowerCase().includes(q) || e.description.toLowerCase().includes(q) || (e.tags || []).some(t => t.toLowerCase().includes(q));
            }
            return true;
        });
    }, [safeEntries, activeFilters, search]);

    return (
        <div style={{ maxWidth: 800 }}>
            <h2 className="settings-header" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <GradientIcon icon={Zap} size={22} gradient={["#00e5a0", "#38bdf8"]} />
                Activity
                <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                    <button
                        onClick={() => setShowCompose(!showCompose)}
                        className="btn btn-primary"
                        style={{ fontSize: 11, padding: "6px 14px", color: "#000", fontWeight: 700 }}
                    >
                        <Edit size={12} /> New Entry
                    </button>
                    <button
                        onClick={exportNotebook}
                        className="btn btn-surface"
                        style={{ fontSize: 11, padding: "6px 12px" }}
                    >
                        <Download size={12} /> Export
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setTimeout(() => {
                                if (window.confirm("Clear all notebook entries?")) {
                                    clearNotebook();
                                }
                            }, 0);
                        }}
                        className="btn btn-surface"
                        style={{ fontSize: 11, padding: "6px 12px", color: "#ef4444" }}
                    >
                        <Trash2 size={12} /> Clear
                    </button>
                </span>
            </h2>

            {/* Compose Panel */}
            {showCompose && (
                <ComposePanel
                    onAddEntry={(entry) => {
                        addEntry(entry);
                        setShowCompose(false);
                    }}
                    onCancel={() => setShowCompose(false)}
                />
            )}

            {/* Search & filters */}
            <ActivityFilter
                search={search}
                setSearch={setSearch}
                activeFilters={activeFilters}
                toggleFilter={toggleFilter}
            />

            {/* No results after filter */}
            {safeEntries.length > 0 && filtered.length === 0 && (
                <div style={{
                    textAlign: "center", padding: "40px 24px",
                    color: "var(--text-subtle)", fontSize: 13, fontFamily: "var(--font-mono)",
                }}>
                    No entries match your filters.
                </div>
            )}

            {/* Timeline */}
            <ActivityList
                entries={filtered}
                expandedId={expandedId}
                setExpandedId={setExpandedId}
                onWriteFirst={() => setShowCompose(true)}
            />

            {/* Footer stats */}
            {safeEntries.length > 0 && (
                <div style={{
                    marginTop: 24, padding: 12,
                    textAlign: "center",
                    fontSize: 11, color: "var(--text-ghost)",
                    fontFamily: "var(--font-mono)",
                    borderTop: "1px solid var(--border-subtle)",
                }}>
                    {safeEntries.length} total {safeEntries.length === 1 ? "entry" : "entries"} · Showing {filtered.length} · Storage: ~{(JSON.stringify(safeEntries).length / 1024).toFixed(1)} KB
                </div>
            )}

            {/* Markdown styles for notebook content */}
            <style>{`
                .notebook-markdown p { margin: 0 0 6px 0; }
                .notebook-markdown p:last-child { margin-bottom: 0; }
                .notebook-markdown h1, .notebook-markdown h2, .notebook-markdown h3 {
                    margin: 8px 0 4px 0; font-size: 13px; font-weight: 700;
                    color: var(--text-primary);
                }
                .notebook-markdown h1 { font-size: 15px; }
                .notebook-markdown h2 { font-size: 14px; }
                .notebook-markdown ul, .notebook-markdown ol {
                    margin: 4px 0; padding-left: 20px;
                }
                .notebook-markdown li { margin: 2px 0; }
                .notebook-markdown code {
                    background: rgba(255,255,255,0.06);
                    padding: 1px 5px; border-radius: 3px;
                    font-family: var(--font-mono); font-size: 11px;
                }
                .notebook-markdown pre {
                    background: rgba(0,0,0,0.4); border-radius: 6px;
                    padding: 10px 12px; overflow-x: auto; margin: 6px 0;
                }
                .notebook-markdown pre code {
                    background: none; padding: 0;
                }
                .notebook-markdown blockquote {
                    border-left: 3px solid rgba(0,229,160,0.3);
                    margin: 6px 0; padding: 2px 12px;
                    color: var(--text-subtle);
                }
                .notebook-markdown a {
                    color: var(--color-info); text-decoration: none;
                }
                .notebook-markdown strong { color: var(--text-primary); }
                .notebook-markdown table {
                    border-collapse: collapse; width: 100%; margin: 6px 0;
                }
                .notebook-markdown th, .notebook-markdown td {
                    border: 1px solid var(--border-subtle); padding: 4px 8px;
                    font-size: 11px; text-align: left;
                }
                .notebook-markdown th {
                    background: rgba(255,255,255,0.03); font-weight: 600;
                }
            `}</style>
        </div>
    );
}
