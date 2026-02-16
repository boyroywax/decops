import React from "react";
import { CommandArg, CommandArgType } from "../../services/commands/types";
import { useWorkspaceContext } from "../../context/WorkspaceContext";
import { useEcosystemContext } from "../../context/EcosystemContext";

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
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                    type="checkbox"
                    checked={!!value}
                    onChange={(e) => onChange(e.target.checked)}
                    id={`arg-${arg.name}`}
                />
                <label htmlFor={`arg-${arg.name}`} style={{ fontSize: 14 }}>{arg.description}</label>
            </div>
        );
    }

    if (arg.type === "agent") {
        return (
            <select
                value={value || ""}
                onChange={handleChange}
                style={{
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: "1px solid #27272a",
                    background: "#18181b",
                    color: "white",
                    width: "100%"
                }}
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
                style={{
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: "1px solid #27272a",
                    background: "#18181b",
                    color: "white",
                    width: "100%"
                }}
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
                style={{
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: "1px solid #27272a",
                    background: "#18181b",
                    color: "white",
                    width: "100%"
                }}
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
                style={{
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: "1px solid #27272a",
                    background: "#18181b",
                    color: "white",
                    width: "100%"
                }}
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
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <input
                type={arg.type === "number" ? "number" : "text"}
                value={value || ""}
                onChange={handleChange}
                placeholder={arg.description}
                style={{
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: "1px solid #27272a",
                    background: "#18181b",
                    color: "white",
                    width: "100%"
                }}
            />
            {arg.type === "array" && <span style={{ fontSize: 10, color: '#71717a' }}>Comma separated values</span>}
            {arg.type === "object" && <span style={{ fontSize: 10, color: '#71717a' }}>JSON string</span>}
        </div>
    );
}
