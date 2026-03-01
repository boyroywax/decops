import { useState, useCallback } from "react";
import { LayoutGrid, List, Plus, X, ZoomIn, ZoomOut, Sparkles } from "lucide-react";
import { registry } from "../../services/commands/registry";
import { CommandCard } from "./CommandCard";
import { CommandCardModal } from "./CommandCardModal";
import { useLLM } from "../../context/LLMContext";
import "../../styles/components/commands-panel.css";

interface CommandsPanelProps {
    isStudioMode?: boolean;
}

const TAG_COLORS: Record<string, string> = {
    architect: "#fb923c",
    data: "#3b82f6",
    ecosystem: "#38bdf8",
    agent: "#00e5a0",
    channel: "#a78bfa",
    messaging: "#f472b6",
    topology: "#38bdf8",
    group: "#f472b6",
    system: "#94a3b8",
    artifact: "#fbbf24",
    modification: "#ef4444",
};

const getTagColor = (tag: string) => TAG_COLORS[tag] || "#71717a";

const getCommandColor = (tags: string[]) => {
    for (const tag of tags) {
        if (TAG_COLORS[tag]) return TAG_COLORS[tag];
    }
    return "#71717a";
};

export function CommandsPanel({ isStudioMode }: CommandsPanelProps) {
    const commands = registry.getAll().filter(c => !c.hidden);
    const llm = useLLM();
    const [filter, setFilter] = useState("");
    const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
    const [view, setView] = useState<"cards" | "table">("cards");
    const [cardSize, setCardSize] = useState(1); // 0=small, 1=medium, 2=large
    const [modalCommandId, setModalCommandId] = useState<string | null>(null);

    const toggleTag = useCallback((tag: string) => {
        setActiveTags(prev => {
            const next = new Set(prev);
            if (next.has(tag)) next.delete(tag);
            else next.add(tag);
            return next;
        });
    }, []);

    const removeTag = useCallback((tag: string) => {
        setActiveTags(prev => {
            const next = new Set(prev);
            next.delete(tag);
            return next;
        });
    }, []);

    const clearTags = useCallback(() => setActiveTags(new Set()), []);

    const filteredCommands = commands.filter(c => {
        // Tag filter: command must have ALL active tags
        if (activeTags.size > 0 && !Array.from(activeTags).every(t => c.tags.includes(t))) {
            return false;
        }
        // Text filter
        if (!filter) return true;
        const q = filter.toLowerCase();
        return (
            c.id.toLowerCase().includes(q) ||
            c.description.toLowerCase().includes(q) ||
            c.tags.some(t => t.toLowerCase().includes(q))
        );
    });

    // Modal navigation
    const modalIndex = modalCommandId ? filteredCommands.findIndex(c => c.id === modalCommandId) : -1;
    const modalCommand = modalIndex >= 0 ? filteredCommands[modalIndex] : null;

    const handlePrev = useCallback(() => {
        if (modalIndex > 0) setModalCommandId(filteredCommands[modalIndex - 1].id);
    }, [modalIndex, filteredCommands]);

    const handleNext = useCallback(() => {
        if (modalIndex < filteredCommands.length - 1) setModalCommandId(filteredCommands[modalIndex + 1].id);
    }, [modalIndex, filteredCommands]);

    return (
        <div className="commands-panel">
            {/* Toolbar */}
            <div className="commands-panel__toolbar">
                <div className="commands-panel__search-wrap">
                    {Array.from(activeTags).map(tag => {
                        const tagColor = getTagColor(tag);
                        return (
                            <span
                                key={tag}
                                className="commands-panel__active-tag"
                                style={{
                                    background: `${tagColor}18`,
                                    border: `1px solid ${tagColor}35`,
                                    color: tagColor,
                                }}
                            >
                                #{tag}
                                <button
                                    className="commands-panel__active-tag-x"
                                    onClick={() => removeTag(tag)}
                                    style={{ color: tagColor }}
                                >
                                    <X size={10} />
                                </button>
                            </span>
                        );
                    })}
                    <input
                        className="commands-panel__search"
                        placeholder={activeTags.size > 0 ? "Refine..." : "Search commands..."}
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                    />
                    {activeTags.size > 0 && (
                        <button className="commands-panel__clear-tags" onClick={clearTags} title="Clear all tag filters">
                            <X size={12} />
                        </button>
                    )}
                </div>
                <div className="commands-panel__view-toggle">
                    <button
                        onClick={() => setView("cards")}
                        className={`commands-panel__view-btn${view === "cards" ? " commands-panel__view-btn--active" : ""}`}
                        title="Card view"
                    >
                        <LayoutGrid size={12} />
                    </button>
                    <button
                        onClick={() => setView("table")}
                        className={`commands-panel__view-btn${view === "table" ? " commands-panel__view-btn--active" : ""}`}
                        title="Table view"
                    >
                        <List size={12} />
                    </button>
                </div>
                {view === "cards" && (
                    <div className="commands-panel__size-control">
                        <ZoomOut size={11} className="commands-panel__size-icon" />
                        <input
                            type="range"
                            min={0}
                            max={2}
                            step={1}
                            value={cardSize}
                            onChange={e => setCardSize(Number(e.target.value))}
                            className="commands-panel__size-slider"
                            title={["Small cards", "Medium cards", "Large cards"][cardSize]}
                        />
                        <ZoomIn size={11} className="commands-panel__size-icon" />
                    </div>
                )}
                <span className="commands-panel__count">
                    {filteredCommands.length} command{filteredCommands.length !== 1 ? "s" : ""}
                </span>
            </div>

            {/* Card View */}
            {view === "cards" && (
                <div className={`commands-panel__grid commands-panel__grid--${["sm", "md", "lg"][cardSize]}`}>
                    {filteredCommands.map(cmd => (
                        <CommandCard
                            key={cmd.id}
                            command={cmd}
                            cardSize={(["sm", "md", "lg"] as const)[cardSize]}
                            onTagClick={toggleTag}
                            activeTags={activeTags}
                            onShowDetail={() => setModalCommandId(cmd.id)}
                            onAddToStudio={isStudioMode ? () => {
                                window.dispatchEvent(new CustomEvent("studio:add-command", { detail: { commandId: cmd.id } }));
                            } : undefined}
                        />
                    ))}
                </div>
            )}

            {/* Table View */}
            {view === "table" && (
                <div className="commands-panel__table-wrap">
                    <table className="commands-panel__table">
                        <thead>
                            <tr>
                                <th className="commands-panel__th">Command</th>
                                <th className="commands-panel__th">Description</th>
                                <th className="commands-panel__th">Tags</th>
                                <th className="commands-panel__th commands-panel__th--args">Args</th>
                                <th className="commands-panel__th commands-panel__th--action">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredCommands.map(cmd => {
                                const color = getCommandColor(cmd.tags);
                                const argCount = Object.keys(cmd.args).length;
                                const requiredCount = Object.values(cmd.args).filter(a => a.required !== false).length;
                                return (
                                    <tr key={cmd.id} className="commands-panel__row">
                                        <td className="commands-panel__td commands-panel__td--name">
                                            <span className="commands-panel__cmd-name" style={{ color }}>
                                                <span className="commands-panel__slash">/</span>{cmd.id}
                                            </span>
                                            {cmd.usesAI && (() => {
                                                const modelId = cmd.recommendedModel
                                                    ? llm.getCommandModel(cmd.id, cmd.recommendedModel)
                                                    : llm.getCommandModel(cmd.id);
                                                const modelInfo = llm.getModelById(modelId);
                                                const modelLabel = modelInfo?.label || modelId?.split('-').slice(0, 2).join(' ') || 'AI';
                                                return (
                                                    <span className="commands-panel__ai-badge" title={`Uses AI: ${modelLabel}`}>
                                                        <Sparkles size={9} />
                                                        <span>{modelLabel}</span>
                                                    </span>
                                                );
                                            })()}
                                        </td>
                                        <td className="commands-panel__td commands-panel__td--desc">
                                            {cmd.description}
                                        </td>
                                        <td className="commands-panel__td commands-panel__td--tags">
                                            <div className="commands-panel__tag-list">
                                                {cmd.tags.map(tag => {
                                                    const isActive = activeTags.has(tag);
                                                    return (
                                                        <span
                                                            key={tag}
                                                            className={`commands-panel__tag commands-panel__tag--clickable${isActive ? " commands-panel__tag--active" : ""}`}
                                                            style={{
                                                                background: isActive ? `${color}25` : `${color}10`,
                                                                border: `1px solid ${isActive ? `${color}50` : `${color}18`}`,
                                                                color,
                                                            }}
                                                            onClick={(e) => { e.stopPropagation(); toggleTag(tag); }}
                                                        >
                                                            #{tag}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                        <td className="commands-panel__td commands-panel__td--args-count">
                                            <span className="commands-panel__args-badge">
                                                {argCount}{requiredCount > 0 && <span className="commands-panel__args-req">({requiredCount} req)</span>}
                                            </span>
                                        </td>
                                        <td className="commands-panel__td commands-panel__td--run">
                                            {isStudioMode && (
                                                <button
                                                    onClick={() => window.dispatchEvent(new CustomEvent("studio:add-command", { detail: { commandId: cmd.id } }))}
                                                    className="commands-panel__studio-btn"
                                                    title="Add to Studio"
                                                >
                                                    <Plus size={10} /> Add
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {filteredCommands.length === 0 && (
                <div className="commands-panel__empty">
                    No commands match "{filter}"
                </div>
            )}

            {/* Shared Command Detail Modal */}
            {modalCommand && (
                <CommandCardModal
                    command={modalCommand}
                    isOpen={!!modalCommand}
                    onClose={() => setModalCommandId(null)}
                    onPrev={modalIndex > 0 ? handlePrev : undefined}
                    onNext={modalIndex < filteredCommands.length - 1 ? handleNext : undefined}
                    position={`${modalIndex + 1} / ${filteredCommands.length}`}
                />
            )}
        </div>
    );
}
