
import type { RoleId } from "../../types";

export type CommandArgType = "string" | "number" | "boolean" | "object" | "array";

export interface CommandArg {
    name: string;
    type: CommandArgType;
    required?: boolean; // Defaults to true
    description: string;
    defaultValue?: any;
    validation?: (value: any) => boolean | string; // Returns true if valid, or error message string
}

export interface CommandContext {
    workspace: {
        agents: any[];
        channels: any[];
        groups: any[];
        setAgents: React.Dispatch<React.SetStateAction<any[]>>;
        setChannels: React.Dispatch<React.SetStateAction<any[]>>;
        setGroups: React.Dispatch<React.SetStateAction<any[]>>;
        setMessages: React.Dispatch<React.SetStateAction<any[]>>;
        addLog: (msg: string) => void;
    };
    auth: {
        user: any;
    };
}

export interface CommandDefinition {
    id: string;
    description: string;
    args: Record<string, CommandArg>;
    rbac: RoleId[]; // Roles allowed to execute this command
    tags: string[];
    execute: (args: any, context: CommandContext) => Promise<any>;
}
