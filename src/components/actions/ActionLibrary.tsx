import React, { useState } from "react";
import { registry } from "../../services/commands/registry";
import { CommandDefinition } from "../../services/commands/types";
import { CommandCard } from "./CommandCard";

interface ActionLibraryProps {
    onRunCommand: (commandId: string) => void;
}

export function ActionLibrary({ onRunCommand }: ActionLibraryProps) {
    const commands = registry.getAll();
    const [filter, setFilter] = useState("");

    const filteredCommands = commands.filter(c =>
        c.id.toLowerCase().includes(filter.toLowerCase()) ||
        c.description.toLowerCase().includes(filter.toLowerCase())
    );

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", gap: 12 }}>
                <input
                    placeholder="Search commands..."
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    style={{
                        flex: 1,
                        padding: "8px 12px",
                        background: "#09090b",
                        border: "1px solid #27272a",
                        borderRadius: 6,
                        color: "white"
                    }}
                />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
                {filteredCommands.map(cmd => (
                    <CommandCard
                        key={cmd.id}
                        command={cmd}
                        onRun={() => onRunCommand(cmd.id)}
                    />
                ))}
            </div>
        </div>
    );
}
