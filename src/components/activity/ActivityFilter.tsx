import type { NotebookCategory } from "../../types";
import { CATEGORY_META } from "./utils";

interface ActivityFilterProps {
    search: string;
    setSearch: (val: string) => void;
    activeFilters: Set<NotebookCategory>;
    toggleFilter: (cat: NotebookCategory) => void;
}

export function ActivityFilter({ search, setSearch, activeFilters, toggleFilter }: ActivityFilterProps) {
    return (
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
    );
}
