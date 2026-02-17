import type { NotebookCategory } from "../../types";
import { CATEGORY_META } from "./utils";
import "../../styles/components/activity-filter.css";

interface ActivityFilterProps {
    search: string;
    setSearch: (val: string) => void;
    activeFilters: Set<NotebookCategory>;
    toggleFilter: (cat: NotebookCategory) => void;
}

export function ActivityFilter({ search, setSearch, activeFilters, toggleFilter }: ActivityFilterProps) {
    return (
        <div className="activity-filter">
            <input
                className="activity-filter__search"
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search entries..."
            />
            <div className="activity-filter__tags">
                {(Object.keys(CATEGORY_META) as NotebookCategory[]).map(cat => {
                    const meta = CATEGORY_META[cat];
                    const active = activeFilters.has(cat);
                    return (
                        <button
                            key={cat}
                            onClick={() => toggleFilter(cat)}
                            className="activity-filter__tag"
                            style={{
                                borderColor: active ? meta.color + "60" : undefined,
                                background: active ? meta.color + "15" : undefined,
                                color: active ? meta.color : undefined,
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
