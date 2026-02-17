import React, { useState } from "react";
import { registry } from "../../services/commands/registry";
import { CommandDefinition } from "../../services/commands/types";
import { CommandCard } from "./CommandCard";
import "../../styles/components/action-library.css";

interface ActionLibraryProps {
    onRunCommand: (commandId: string, command: CommandDefinition) => void;
}

export function ActionLibrary({ onRunCommand }: ActionLibraryProps) {
    const commands = registry.getAll();
    const [filter, setFilter] = useState("");

    const filteredCommands = commands.filter(c =>
        c.id.toLowerCase().includes(filter.toLowerCase()) ||
        c.description.toLowerCase().includes(filter.toLowerCase())
    );

    return (
        <div className="action-library">
            <div className="action-library__search-row">
                <input
                    className="action-library__search"
                    placeholder="Search commands..."
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                />
            </div>

            <div className="action-library__grid">
                {filteredCommands.map(cmd => (
                    <CommandCard
                        key={cmd.id}
                        command={cmd}
                        onRun={() => onRunCommand(cmd.id, cmd)}
                    />
                ))}
            </div>
        </div>
    );
}
