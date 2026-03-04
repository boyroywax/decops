
import type { RoleId, JobRequest, JobDeliverable } from "@/types";
import type { StudioAPI } from "@/context/StudioContext";

export type CommandArgType = "string" | "number" | "boolean" | "object" | "array" | "group" | "agent" | "channel" | "network" | "workspace";

export interface CommandArg {
    name: string;
    type: CommandArgType;
    required?: boolean; // Defaults to true
    description: string;
    defaultValue?: any;
    enum?: string[]; // Allowed values — surfaced to AI tool schema
    validation?: (value: any) => boolean | string; // Returns true if valid, or error message string
    /** When type is "agent", also show a "You (Current User)" option that resolves to "user" */
    includeUserOption?: boolean;
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
        updateArtifact: (id: string, updates: Record<string, any>) => void;
        allArtifacts: any[];
        // Queue Management
        addJob: (job: JobRequest) => any;
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
    /** Mutable shared storage for inter-step data passing within jobs/automations */
    storage: Record<string, any>;
    /** Produce a deliverable (auto-creates artifact and tags it with the job) */
    addDeliverable: (deliverable: {
        key: string;
        name: string;
        type: string;
        content: string;
        tags?: string[];
    }) => void;
    ecosystem: {
        // First-class ecosystem object
        ecosystem: any; // Ecosystem object
        setEcosystem: (updater: any) => void;
        // Active network
        activeNetworkId: string | null;
        setActiveNetworkId: (id: string | null) => void;
        // Backward-compat derived arrays
        ecosystems: any[];
        bridges: any[];
        bridgeMessages: any[];
        setEcosystems: React.Dispatch<React.SetStateAction<any[]>>;
        setBridges: React.Dispatch<React.SetStateAction<any[]>>;
        setBridgeMessages: React.Dispatch<React.SetStateAction<any[]>>;
        setActiveBridges: React.Dispatch<React.SetStateAction<Set<string>>>;
        createBridge: (from: string, to: string) => void;
        removeBridge: (id: string) => void;
        saveCurrentNetwork: () => void;
        loadNetwork: (id: string) => void;
        dissolveNetwork: (id: string) => void;
    };
    system: {
        setApiKey: (key: string) => void;
        setModel: (model: string) => void;
        /** Resolve the model to use for a given command (checks per-command override → global) */
        getModelForCommand: (commandId: string) => string;
        /** Resolve the model to use for a given agent (checks per-agent override → global) */
        getModelForAgent: (agentId: string) => string;
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
    /** Studio visual job editor — available when the Studio tab is mounted */
    studio?: StudioAPI | null;
}

export interface CommandDefinition<TArgs = any> {
    id: string;
    description: string;
    args: Record<string, CommandArg>;
    rbac: RoleId[]; // Roles allowed to execute this command
    tags: string[];
    output: string; // Description of the output format/content
    outputSchema?: Record<string, any>; // Optional JSON schema of the output object
    recommendedModel?: string; // Suggested LLM model id (fallback between user override and global default)
    /** Marks this command as using AI — shows AI badge in UI.
     *  `true` or `"ai-text"` = text generation, `"ai-image"` = image generation */
    usesAI?: boolean | "ai-text" | "ai-image";
    /** Hide from Commands panel & AI tools — still executable by job executor */
    hidden?: boolean;
    /** Base64 data-URI or URL for a custom icon image */
    icon?: string;
    execute: (args: TArgs, context: CommandContext) => Promise<any>;
}
