import React, { useState } from "react";
import { registry } from "@/services/commands/registry";
import { CommandCard } from "./CommandCard";
import "../../styles/components/action-library.css";

export function ActionLibrary() {
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
                    />
                ))}
            </div>
        </div>
    );
}
