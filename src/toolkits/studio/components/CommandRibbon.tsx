import { useState, useMemo } from "react";
import { Search, ChevronDown, ChevronUp } from "lucide-react";
import { registry } from "@/services/commands/registry";
import type { CommandDefinition } from "@/services/commands/types";

interface CommandRibbonProps {
    onAddStep: (commandId: string) => void;
}

/** Extract unique tag categories from commands for filtering */
function getCategories(commands: CommandDefinition[]): string[] {
    const tagSet = new Set<string>();
    commands.forEach(cmd => {
        if (cmd.tags?.[0]) tagSet.add(cmd.tags[0]);
    });
    return Array.from(tagSet).sort();
}

export function CommandRibbon({ onAddStep }: CommandRibbonProps) {
    const [collapsed, setCollapsed] = useState(false);
    const [search, setSearch] = useState("");
    const [activeCategory, setActiveCategory] = useState<string | null>(null);

    const commands = useMemo(() => registry.getAll().filter(c => !c.hidden), []);
    const categories = useMemo(() => getCategories(commands), [commands]);

    const filtered = useMemo(() => {
        let result = commands;
        if (activeCategory) {
            result = result.filter(c => c.tags?.includes(activeCategory));
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(c =>
                c.id.toLowerCase().includes(q) ||
                c.description.toLowerCase().includes(q) ||
                c.tags?.some(t => t.toLowerCase().includes(q))
            );
        }
        return result;
    }, [commands, activeCategory, search]);

    return (
        <div className={`jm-ribbon ${collapsed ? "jm-ribbon--collapsed" : ""}`}>
            <div className="jm-ribbon__header">
                <button
                    className="jm-ribbon__toggle"
                    onClick={() => setCollapsed(v => !v)}
                    title={collapsed ? "Expand commands" : "Collapse commands"}
                >
                    {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <span className="jm-ribbon__title">Commands ({filtered.length})</span>

                {!collapsed && (
                    <>
                        <div className="jm-ribbon__search">
                            <Search size={10} className="jm-ribbon__search-icon" />
                            <input
                                type="text"
                                className="jm-ribbon__search-input"
                                placeholder="Search commands..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>

                        <div className="jm-ribbon__categories">
                            <button
                                className={`jm-ribbon__category-btn ${!activeCategory ? "jm-ribbon__category-btn--active" : ""}`}
                                onClick={() => setActiveCategory(null)}
                            >
                                All
                            </button>
                            {categories.map(cat => (
                                <button
                                    key={cat}
                                    className={`jm-ribbon__category-btn ${activeCategory === cat ? "jm-ribbon__category-btn--active" : ""}`}
                                    onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {!collapsed && (
                <div className="jm-ribbon__body">
                    <div className="jm-ribbon__commands">
                        {filtered.map(cmd => (
                            <div
                                key={cmd.id}
                                className="jm-ribbon__cmd"
                                onClick={() => onAddStep(cmd.id)}
                                title={cmd.description}
                            >
                                <div className="jm-ribbon__cmd-name">{cmd.id}</div>
                                <div className="jm-ribbon__cmd-desc">{cmd.description}</div>
                                {cmd.tags && cmd.tags.length > 0 && (
                                    <div className="jm-ribbon__cmd-tags">
                                        {cmd.tags.slice(0, 3).map(t => (
                                            <span key={t} className="jm-ribbon__cmd-tag">{t}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                        {filtered.length === 0 && (
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-ghost)", padding: "8px" }}>
                                No commands match your search.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
