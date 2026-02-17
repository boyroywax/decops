import React from "react";
import { CommandArg, CommandArgType } from "../../services/commands/types";
import { useWorkspaceContext } from "../../context/WorkspaceContext";
import { useEcosystemContext } from "../../context/EcosystemContext";
import "../../styles/components/command-arg-input.css";

interface CommandArgInputProps {
    arg: CommandArg;
    value: any;
    onChange: (value: any) => void;
}

export function CommandArgInput({ arg, value, onChange }: CommandArgInputProps) {
    const { agents, channels, groups } = useWorkspaceContext();
    const { ecosystems } = useEcosystemContext();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        let newValue: any = e.target.value;
        if (arg.type === "number") {
            newValue = parseFloat(newValue);
        } else if (arg.type === "boolean") {
            // handled separately for checkbox
        }
        onChange(newValue);
    };

    if (arg.type === "boolean") {
        return (
            <div className="command-arg__boolean">
                <input
                    type="checkbox"
                    checked={!!value}
                    onChange={(e) => onChange(e.target.checked)}
                    id={`arg-${arg.name}`}
                />
                <label htmlFor={`arg-${arg.name}`} className="command-arg__label">{arg.description}</label>
            </div>
        );
    }

    if (arg.type === "agent") {
        return (
            <select
                value={value || ""}
                onChange={handleChange}
                className="command-arg__select"
            >
                <option value="">Select an Agent</option>
                {agents.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                ))}
            </select>
        );
    }

    if (arg.type === "channel") {
        return (
            <select
                value={value || ""}
                onChange={handleChange}
                className="command-arg__select"
            >
                <option value="">Select a Channel</option>
                {channels.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </select>
        );
    }

    if (arg.type === "group") {
        return (
            <select
                value={value || ""}
                onChange={handleChange}
                className="command-arg__select"
            >
                <option value="">Select a Group</option>
                {groups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                ))}
            </select>
        );
    }

    if (arg.type === "network") {
        return (
            <select
                value={value || ""}
                onChange={handleChange}
                className="command-arg__select"
            >
                <option value="">Select a Network</option>
                {ecosystems.map(n => (
                    <option key={n.id} value={n.id}>{n.name}</option>
                ))}
            </select>
        );
    }

    // Default to text input for string, number, array, object (as JSON string for now maybe?)
    return (
        <div className="command-arg__field">
            <input
                type={arg.type === "number" ? "number" : "text"}
                value={value || ""}
                onChange={handleChange}
                placeholder={arg.description}
                className="command-arg__input"
            />
            {arg.type === "array" && <span className="command-arg__hint">Comma separated values</span>}
            {arg.type === "object" && <span className="command-arg__hint">JSON string</span>}
        </div>
    );
}
