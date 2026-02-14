
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
        messages: any[];
        setAgents: React.Dispatch<React.SetStateAction<any[]>>;
        setChannels: React.Dispatch<React.SetStateAction<any[]>>;
        setGroups: React.Dispatch<React.SetStateAction<any[]>>;
        setMessages: React.Dispatch<React.SetStateAction<any[]>>;
        addLog: (msg: string) => void;
    };
    auth: {
        user: any;
    };
    jobs: {
        addArtifact: (jobId: string, artifact: any) => void;
        removeArtifact: (id: string) => void;
        importArtifact: (artifact: any) => void;
        allArtifacts: any[];
    };
    ecosystem: {
        ecosystems: any[];
        bridges: any[];
        setEcosystems: React.Dispatch<React.SetStateAction<any[]>>;
        setBridges: React.Dispatch<React.SetStateAction<any[]>>;
        createBridge: (from: string, to: string) => void;
        removeBridge: (id: string) => void;
        saveCurrentNetwork: () => void;
        loadNetwork: (id: string) => void;
        dissolveNetwork: (id: string) => void;
    };
    system: {
        setApiKey: (key: string) => void;
        setModel: (model: string) => void;
    };
    architect: {
        generateNetwork: (prompt: string) => void;
        deployNetwork: () => void;
    };
}

export interface CommandDefinition {
    id: string;
    description: string;
    args: Record<string, CommandArg>;
    rbac: RoleId[]; // Roles allowed to execute this command
    tags: string[];
    output: string; // Description of the output format/content
    outputSchema?: Record<string, any>; // Optional JSON schema of the output object
    execute: (args: any, context: CommandContext) => Promise<any>;
}
