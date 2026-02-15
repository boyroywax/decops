import { useState, useMemo, isValidElement } from "react";
import { marked } from "marked";
import type { NotebookEntry, NotebookCategory } from "../../types";
import { Zap, Upload, Compass, Settings, FileText, Edit, Download, Trash2 } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";

interface ActivityViewProps {
    entries: NotebookEntry[];
    clearNotebook: () => void;
    exportNotebook: () => void;
    addEntry: (entry: Omit<NotebookEntry, "id" | "timestamp">) => void;
}

const CATEGORY_META: Record<NotebookCategory, { label: string; color: string; icon: React.ReactNode }> = {
    action: { label: "Action", color: "#00e5a0", icon: <Zap size={12} color="#00e5a0" /> },
    output: { label: "Output", color: "#38bdf8", icon: <Upload size={12} color="#38bdf8" /> },
    navigation: { label: "Navigation", color: "#a78bfa", icon: <Compass size={12} color="#a78bfa" /> },
    system: { label: "System", color: "#ef4444", icon: <Settings size={12} color="#ef4444" /> },
    narrative: { label: "Narrative", color: "#fbbf24", icon: <FileText size={12} color="#fbbf24" /> },
};

const FALLBACK_META = { label: "Unknown", color: "#71717a", icon: <Zap size={12} color="#71717a" /> };

function relativeTime(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function dayKey(ts: number): string {
    const d = new Date(ts);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

/** Renders markdown content as HTML */
function renderMarkdown(md: string): string {
    try {
        const result = marked.parse(md);
        if (result instanceof Promise) return md; // Safety check if marked returns a promise
        return result as string;
    } catch {
        return md;
    }
}

/** Returns true if this entry category should render its description as markdown */
function isMarkdownCategory(cat: NotebookCategory): boolean {
    return cat === "output" || cat === "narrative";
}

export function ActivityView({ entries, clearNotebook, exportNotebook, addEntry }: ActivityViewProps) {
    console.log("ActivityView rendering", { entriesCount: entries?.length });

    const safeEntries = Array.isArray(entries) ? entries : [];

    if (!Array.isArray(entries)) {
        console.error("ActivityView: entries is not an array", entries);
    }

    const [search, setSearch] = useState("");
    const [activeFilters, setActiveFilters] = useState<Set<NotebookCategory>>(new Set(["action", "output", "navigation", "system", "narrative"]));
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Custom entry creation state
    const [showCompose, setShowCompose] = useState(false);
    const [composeTitle, setComposeTitle] = useState("");
    const [composeBody, setComposeBody] = useState("");
    const [composeCategory, setComposeCategory] = useState<NotebookCategory>("narrative");

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

    // Group by day
    const grouped = useMemo(() => {
        const groups: { day: string; entries: NotebookEntry[] }[] = [];
        let currentDay = "";
        for (const entry of filtered) {
            const day = dayKey(entry.timestamp);
            if (day !== currentDay) {
                currentDay = day;
                groups.push({ day, entries: [entry] });
            } else {
                groups[groups.length - 1].entries.push(entry);
            }
        }
        return groups;
    }, [filtered]);

    const handleSubmitEntry = () => {
        if (!composeTitle.trim() && !composeBody.trim()) return;
        const meta = CATEGORY_META[composeCategory];
        addEntry({
            category: composeCategory,
            icon: meta.icon,
            title: composeTitle.trim() || "Untitled Note",
            description: composeBody.trim(),
            tags: ["user-note", composeCategory],
        });
        setComposeTitle("");
        setComposeBody("");
        setShowCompose(false);
    };

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
                <div style={{
                    marginBottom: 20, padding: 16,
                    background: "rgba(251,191,36,0.04)",
                    border: "1px solid rgba(251,191,36,0.2)",
                    borderRadius: "var(--radius-xl)",
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                        <FileText size={16} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
                            New Entry
                        </span>
                        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                            {(["narrative", "action", "system"] as NotebookCategory[]).map(cat => {
                                const meta = CATEGORY_META[cat];
                                const sel = composeCategory === cat;
                                return (
                                    <button
                                        key={cat}
                                        onClick={() => setComposeCategory(cat)}
                                        style={{
                                            padding: "2px 8px", borderRadius: 8,
                                            border: `1px solid ${sel ? meta.color + "60" : "var(--border-subtle)"}`,
                                            background: sel ? meta.color + "15" : "transparent",
                                            color: sel ? meta.color : "var(--text-ghost)",
                                            fontSize: 10, fontWeight: 600, cursor: "pointer",
                                            fontFamily: "var(--font-mono)",
                                        }}
                                    >
                                        {meta.icon} {meta.label}
                                    </button>
                                );
                            })}
                        </span>
                    </div>
                    <input
                        type="text"
                        value={composeTitle}
                        onChange={e => setComposeTitle(e.target.value)}
                        placeholder="Title (e.g., Design Decision, TODO, Observation...)"
                        style={{
                            width: "100%", padding: "8px 12px", marginBottom: 8,
                            background: "var(--bg-input)", border: "1px solid var(--border-default)",
                            borderRadius: "var(--radius-lg)", color: "var(--text-primary)",
                            fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600,
                            boxSizing: "border-box",
                        }}
                    />
                    <textarea
                        value={composeBody}
                        onChange={e => setComposeBody(e.target.value)}
                        placeholder="Write your note here... (supports **Markdown**)"
                        rows={4}
                        style={{
                            width: "100%", padding: "10px 12px", marginBottom: 10,
                            background: "var(--bg-input)", border: "1px solid var(--border-default)",
                            borderRadius: "var(--radius-lg)", color: "var(--text-primary)",
                            fontFamily: "var(--font-mono)", fontSize: 12,
                            resize: "vertical", boxSizing: "border-box",
                            lineHeight: 1.6,
                        }}
                    />
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button
                            onClick={() => { setShowCompose(false); setComposeTitle(""); setComposeBody(""); }}
                            className="btn btn-surface"
                            style={{ fontSize: 11, padding: "6px 14px" }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmitEntry}
                            className="btn btn-primary"
                            style={{ fontSize: 11, padding: "6px 18px", color: "#000", fontWeight: 700 }}
                            disabled={!composeTitle.trim() && !composeBody.trim()}
                        >
                            Add Entry
                        </button>
                    </div>
                </div>
            )}

            {/* Search & filters */}
            <div style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 12 }}>
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search entries..."
                    style={{
                        width: "100%",
                        padding: "10px 14px",
                        background: "var(--bg-input)",
                        border: "1px solid var(--border-default)",
                        borderRadius: "var(--radius-lg)",
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 13,
                        boxSizing: "border-box",
                    }}
                />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {(Object.keys(CATEGORY_META) as NotebookCategory[]).map(cat => {
                        const meta = CATEGORY_META[cat];
                        const active = activeFilters.has(cat);
                        return (
                            <button
                                key={cat}
                                onClick={() => toggleFilter(cat)}
                                style={{
                                    padding: "4px 10px",
                                    borderRadius: 12,
                                    border: `1px solid ${active ? meta.color + "60" : "var(--border-subtle)"}`,
                                    background: active ? meta.color + "15" : "transparent",
                                    color: active ? meta.color : "var(--text-ghost)",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    transition: "all 0.15s",
                                    fontFamily: "var(--font-mono)",
                                }}
                            >
                                {meta.icon} {meta.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Empty State */}
            {safeEntries.length === 0 && (
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
                    <button
                        onClick={() => setShowCompose(true)}
                        className="btn btn-primary"
                        style={{ marginTop: 20, fontSize: 12, padding: "8px 20px", color: "#000" }}
                    >
                        <Edit size={12} /> Write your first entry
                    </button>
                </div>
            )}

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

                            {group.entries.map((entry) => {
                                const meta = CATEGORY_META[entry.category] || FALLBACK_META;
                                const isExpanded = expandedId === entry.id;
                                const useMarkdown = isMarkdownCategory(entry.category);

                                return (
                                    <div
                                        key={entry.id}
                                        style={{ position: "relative", marginBottom: 12 }}
                                    >
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
                                            onClick={() => setExpandedId(isExpanded ? null : entry.id)}
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
                                                }}>
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
                            })}
                        </div>
                    </div>
                ))}
            </div>

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
