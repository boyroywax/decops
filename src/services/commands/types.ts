
import type {
    RoleId, JobRequest, JobDeliverable,
    Agent, Channel, Group, Message,
    Network, Bridge, BridgeMessage, Ecosystem,
    User, JobArtifact,
} from "@/types";
import type { Job, JobDefinition } from "@/types/jobs";
import type { AutomationDefinition, AutomationRun } from "@/services/automations/types";

export type CommandArgType = "string" | "number" | "boolean" | "object" | "array" | "group" | "agent" | "channel" | "network" | "workspace";

export interface CommandArg {
    name: string;
    type: CommandArgType;
    required?: boolean; // Defaults to true
    description: string;
    defaultValue?: unknown;
    enum?: string[]; // Allowed values — surfaced to AI tool schema
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validation?: (value: any) => boolean | string; // Returns true if valid, or error message string
    /** When type is "agent", also show a "You (Current User)" option that resolves to "user" */
    includeUserOption?: boolean;
}

/** A summary record of a saved workspace (returned by workspaceManager.list()). */
export interface WorkspaceSummary {
    id: string;
    name: string;
    description?: string;
    createdAt?: number;
    updatedAt?: number;
}

export interface CommandContext {
    workspace: {
        agents: Agent[];
        channels: Channel[];
        groups: Group[];
        messages: Message[];
        setAgents: React.Dispatch<React.SetStateAction<Agent[]>>;
        setChannels: React.Dispatch<React.SetStateAction<Channel[]>>;
        setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
        setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
        addLog: (msg: string) => void;
        activeChannel?: string | null;
        setActiveChannel?: React.Dispatch<React.SetStateAction<string | null>>;
        setActiveChannels?: React.Dispatch<React.SetStateAction<Set<string>>>;
        /**
         * Live-state getters. The `agents`/`channels`/`groups`/`messages`
         * arrays above are snapshots taken when this CommandContext was
         * built — they go stale during long-running async `execute()` calls
         * (multi-step jobs, AI tool loops). The getters always return the
         * latest React state via a ref maintained by the provider.
         *
         * Optional for backward compat with test contexts; production
         * commands that read state mid-execution should prefer them.
         */
        getAgents?: () => Agent[];
        getChannels?: () => Channel[];
        getGroups?: () => Group[];
        getMessages?: () => Message[];
    };
    auth: {
        user: User | null;
    };
    jobs: {
        addArtifact: (jobId: string, artifact: JobArtifact) => void;
        removeArtifact: (id: string) => void;
        importArtifact: (artifact: JobArtifact) => void;
        updateArtifact: (id: string, updates: Partial<JobArtifact>) => void;
        allArtifacts: JobArtifact[];
        // Queue Management
        addJob: (job: JobRequest) => Job;
        removeJob: (id: string) => void;
        pauseQueue: () => void;
        resumeQueue: () => void;
        isPaused: boolean;
        getQueue: () => Job[];
        // Catalog Management
        getCatalog: () => JobDefinition[];
        saveDefinition: (def: JobDefinition) => void;
        deleteDefinition: (id: string) => void;
        // Persistence
        setJobs?: (jobs: Job[]) => void;
        setStandaloneArtifacts?: (artifacts: JobArtifact[]) => void;
        clearJobs?: () => void;
    };
    /** Mutable shared storage for inter-step data passing within jobs/automations.
     *  Values are arbitrary command results so the type is intentionally loose. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        ecosystem: Ecosystem;
        setEcosystem: (updater: Ecosystem | ((prev: Ecosystem) => Ecosystem)) => void;
        // Active network
        activeNetworkId: string | null;
        setActiveNetworkId: (id: string | null) => void;
        // Derived arrays
        networks: Network[];
        bridges: Bridge[];
        bridgeMessages: BridgeMessage[];
        setNetworks: React.Dispatch<React.SetStateAction<Network[]>>;
        setBridges: React.Dispatch<React.SetStateAction<Bridge[]>>;
        setBridgeMessages: React.Dispatch<React.SetStateAction<BridgeMessage[]>>;
        setActiveBridges: React.Dispatch<React.SetStateAction<Set<string>>>;
        createBridge: (from: string, to: string) => void;
        removeBridge: (id: string) => void;
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
        runs: AutomationRun[];
        setAutomations?: (automations: AutomationDefinition[]) => void;
        setRuns?: (runs: AutomationRun[]) => void;
    };
    workspaceManager?: {
        list: () => WorkspaceSummary[];
        create: (name: string, description?: string) => Promise<string>;
        switch: (id: string) => Promise<void>;
        delete: (id: string) => Promise<void>;
        duplicate: (sourceId: string, name?: string) => Promise<string>;
        edit?: (title?: string, description?: string) => Promise<void>;
        currentId: string | null;
    };
    /**
     * Extension point for toolkits to inject their APIs into the command context.
     * E.g. Studio injects its StudioAPI as `extensions.studio`, Editor as `extensions.editor`.
     * Core code never reads specific keys — only toolkit command definitions do.
     */
    extensions?: Record<string, unknown>;
}

/**
 * A command definition. `TArgs` is the shape of the args object passed to
 * `execute()`. Defaults to `any` for backward compatibility with the large
 * existing command catalog that accesses args without narrowing — new
 * commands should narrow it explicitly (e.g.
 * `CommandDefinition<{ agentId: string }>`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface CommandDefinition<TArgs = any> {
    id: string;
    description: string;
    args: Record<string, CommandArg>;
    rbac: RoleId[]; // Roles allowed to execute this command
    tags: string[];
    output: string; // Description of the output format/content
    outputSchema?: Record<string, unknown>; // Optional JSON schema of the output object
    recommendedModel?: string; // Suggested LLM model id (fallback between user override and global default)
    /** Marks this command as using AI — shows AI badge in UI.
     *  `true` or `"ai-text"` = text generation, `"ai-image"` = image generation */
    usesAI?: boolean | "ai-text" | "ai-image";
    /** Hide from Commands panel & AI tools — still executable by job executor */
    hidden?: boolean;
    /** Base64 data-URI or URL for a custom icon image */
    icon?: string;
    /**
     * If true, this command spawns one or more child jobs and waits for them
     * to complete. The tool-call adapter uses a longer default timeout for
     * these (see `timeoutMs` for an explicit override).
     */
    spawnsChildJobs?: boolean;
    /**
     * Explicit timeout (in ms) for the tool-call adapter's wait on the
     * job-executor result. Overrides the platform default and the
     * `spawnsChildJobs` heuristic.
     */
    timeoutMs?: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: (args: TArgs, context: CommandContext) => Promise<any>;
}
