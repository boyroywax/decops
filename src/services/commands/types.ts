
import type { RoleId, JobRequest } from "../../types";

export type CommandArgType = "string" | "number" | "boolean" | "object" | "array" | "group" | "agent" | "channel" | "network";

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
        activeChannel?: string | null;
        setActiveChannel?: React.Dispatch<React.SetStateAction<string | null>>;
        setActiveChannels?: React.Dispatch<React.SetStateAction<Set<string>>>;
    };
    auth: {
        user: any;
    };
    jobs: {
        addArtifact: (jobId: string, artifact: any) => void;
        removeArtifact: (id: string) => void;
        importArtifact: (artifact: any) => void;
        allArtifacts: any[];
        // Queue Management
        addJob: (job: JobRequest) => void;
        removeJob: (id: string) => void;
        pauseQueue: () => void;
        resumeQueue: () => void;
        isPaused: boolean;
        getQueue: () => any[];
        // Catalog Management
        getCatalog: () => any[];
        saveDefinition: (def: any) => void;
        deleteDefinition: (id: string) => void;
        // Persistence
        setJobs?: (jobs: any[]) => void;
        setStandaloneArtifacts?: (artifacts: any[]) => void;
        clearJobs?: () => void;
    };
    ecosystem: {
        ecosystems: any[];
        bridges: any[];
        bridgeMessages: any[]; // [NEW]
        setEcosystems: React.Dispatch<React.SetStateAction<any[]>>;
        setBridges: React.Dispatch<React.SetStateAction<any[]>>;
        setBridgeMessages: React.Dispatch<React.SetStateAction<any[]>>; // [NEW]
        setActiveBridges: React.Dispatch<React.SetStateAction<Set<string>>>; // [NEW]
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
    automations: {
        runAutomation: (id: string) => Promise<void>;
        runs: any[];
        setAutomations?: (automations: any[]) => void;
        setRuns?: (runs: any[]) => void;
    };
    workspaceManager?: {
        list: () => any[];
        create: (name: string, description?: string) => Promise<string>;
        switch: (id: string) => Promise<void>;
        delete: (id: string) => Promise<void>;
        duplicate: (sourceId: string, name?: string) => Promise<string>;
        currentId: string | null;
    };
}

export interface CommandDefinition<TArgs = any> {
    id: string;
    description: string;
    args: Record<string, CommandArg>;
    rbac: RoleId[]; // Roles allowed to execute this command
    tags: string[];
    output: string; // Description of the output format/content
    outputSchema?: Record<string, any>; // Optional JSON schema of the output object
    execute: (args: TArgs, context: CommandContext) => Promise<any>;
}
