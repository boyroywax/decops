import { useState } from "react";
import { LayoutGrid, List, Play, Plus } from "lucide-react";
import { registry } from "../../services/commands/registry";
import { CommandDefinition } from "../../services/commands/types";
import { CommandCard } from "./CommandCard";
import "../../styles/components/commands-panel.css";

interface CommandsPanelProps {
    onRunCommand: (commandId: string, command: CommandDefinition) => void;
    isStudioMode?: boolean;
}

const getCommandColor = (tags: string[]) => {
    if (tags.includes("architect")) return "#fb923c";
    if (tags.includes("data")) return "#3b82f6";
    if (tags.includes("ecosystem")) return "#38bdf8";
    if (tags.includes("agent")) return "#00e5a0";
    if (tags.includes("channel")) return "#a78bfa";
    if (tags.includes("messaging")) return "#f472b6";
    if (tags.includes("topology")) return "#38bdf8";
    if (tags.includes("group")) return "#f472b6";
    if (tags.includes("system")) return "#94a3b8";
    if (tags.includes("artifact")) return "#fbbf24";
    if (tags.includes("modification")) return "#ef4444";
    return "#71717a";
};

export function CommandsPanel({ onRunCommand, isStudioMode }: CommandsPanelProps) {
    const commands = registry.getAll().filter(c => !c.hidden);
    const [filter, setFilter] = useState("");
    const [view, setView] = useState<"cards" | "table">("cards");

    const filteredCommands = commands.filter(c =>
        c.id.toLowerCase().includes(filter.toLowerCase()) ||
        c.description.toLowerCase().includes(filter.toLowerCase()) ||
        c.tags.some(t => t.toLowerCase().includes(filter.toLowerCase()))
    );

    return (
        <div className="commands-panel">
            {/* Toolbar */}
            <div className="commands-panel__toolbar">
                <input
                    className="commands-panel__search"
                    placeholder="Search commands..."
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                />
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
                <span className="commands-panel__count">
                    {filteredCommands.length} command{filteredCommands.length !== 1 ? "s" : ""}
                </span>
            </div>

            {/* Card View */}
            {view === "cards" && (
                <div className="commands-panel__grid">
                    {filteredCommands.map(cmd => (
                        <CommandCard
                            key={cmd.id}
                            command={cmd}
                            onRun={() => onRunCommand(cmd.id, cmd)}
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
                                <th className="commands-panel__th commands-panel__th--action"></th>
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
                                        </td>
                                        <td className="commands-panel__td commands-panel__td--desc">
                                            {cmd.description}
                                        </td>
                                        <td className="commands-panel__td commands-panel__td--tags">
                                            <div className="commands-panel__tag-list">
                                                {cmd.tags.map(tag => (
                                                    <span key={tag} className="commands-panel__tag" style={{
                                                        background: `${color}10`,
                                                        border: `1px solid ${color}18`,
                                                        color,
                                                    }}>
                                                        #{tag}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="commands-panel__td commands-panel__td--args-count">
                                            <span className="commands-panel__args-badge">
                                                {argCount}{requiredCount > 0 && <span className="commands-panel__args-req">({requiredCount} req)</span>}
                                            </span>
                                        </td>
                                        <td className="commands-panel__td commands-panel__td--run">
                                            <button
                                                onClick={() => onRunCommand(cmd.id, cmd)}
                                                className="commands-panel__run-btn"
                                                style={{
                                                    background: `${color}15`,
                                                    border: `1px solid ${color}30`,
                                                    color,
                                                }}
                                                title="Run command"
                                            >
                                                <Play size={10} fill={color} />
                                            </button>
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
        </div>
    );
}
