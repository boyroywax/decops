/**
 * jobContext — per-job `CommandContext` builder extracted from useJobExecutor.
 *
 * `useJobExecutor` runs each queued job inside a freshly constructed
 * `CommandContext`. That construction is large, mostly boilerplate, and not
 * concerned with the polling/dispatch loop itself, so it lives here.
 *
 * §3.5 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
import type { CommandContext } from "@/services/commands/types";
import type { WorkspaceContextType } from "@/context/WorkspaceContext";
import type { User, JobArtifact, Agent, Channel, Group, Message } from "@/types";
import type { UseJobsReturn } from "./useJobs";
import type { UseJobCatalogReturn } from "./useJobCatalog";
import type { UseEcosystemReturn } from "./useEcosystem";
import type { UseArchitectReturn } from "@/toolkits/architect/hooks/useArchitect";
import type { AutomationRun } from "@/services/automations/types";
import { getAgentModel, getCommandModel } from "@/services/ai";
import { DELIVERABLE_STORAGE_PREFIX } from "@/utils/jobRuntime";

/**
 * Environment captured from the hook closure so {@link buildJobContext}
 * can stay a plain function. All entries map 1:1 onto `CommandContext` fields.
 */
export interface JobExecutorEnv {
    workspace: WorkspaceContextType;
    /** Live getters — return current refs so jobs see fresh state mid-run. */
    getAgents: () => Agent[];
    getChannels: () => Channel[];
    getGroups: () => Group[];
    getMessages: () => Message[];

    user: User | null;
    addLog: (log: string) => void;

    // Jobs API
    addJob: UseJobsReturn["addJob"];
    removeJob: UseJobsReturn["removeJob"];
    addArtifact: UseJobsReturn["addArtifact"];
    removeArtifact: UseJobsReturn["removeArtifact"];
    importArtifact: UseJobsReturn["importArtifact"];
    updateArtifact: UseJobsReturn["updateArtifact"];
    allArtifacts: JobArtifact[];
    isPaused: boolean;
    toggleQueuePause: UseJobsReturn["toggleQueuePause"];
    getQueue: () => UseJobsReturn["jobs"];
    setJobs?: UseJobsReturn["setJobs"];
    setStandaloneArtifacts?: UseJobsReturn["setStandaloneArtifacts"];
    clearJobs: UseJobsReturn["clearJobs"];

    // Saved-job catalog
    savedJobs: UseJobCatalogReturn["savedJobs"];
    saveJob: UseJobCatalogReturn["saveJob"];
    deleteJob: UseJobCatalogReturn["deleteJob"];

    // Extensions
    ecosystem: UseEcosystemReturn;
    architect: UseArchitectReturn;
    automations?: { runAutomation: (id: string) => Promise<void>; runs: AutomationRun[] };
    workspaceManager?: CommandContext["workspaceManager"];
    studioApi: unknown;
}

/**
 * Build a `CommandContext` for one job execution.
 *
 * @param env             Hook-level environment (workspace, refs, callbacks).
 * @param jobStorage      Mutable per-job storage map (refs/deliverables alias entries).
 * @param deliverableContents Mutable per-job deliverable map (key → content).
 */
export function buildJobContext(
    env: JobExecutorEnv,
    jobStorage: Record<string, unknown>,
    deliverableContents: Record<string, unknown>,
): CommandContext {
    return {
        workspace: {
            ...env.workspace,
            addLog: env.addLog,
            activeChannel: env.workspace.activeChannel,
            setActiveChannel: env.workspace.setActiveChannel,
            setActiveChannels: env.workspace.setActiveChannels,
            getAgents: env.getAgents,
            getChannels: env.getChannels,
            getGroups: env.getGroups,
            getMessages: env.getMessages,
        },
        auth: { user: env.user },
        jobs: {
            addArtifact: env.addArtifact,
            removeArtifact: env.removeArtifact,
            importArtifact: env.importArtifact,
            updateArtifact: env.updateArtifact,
            allArtifacts: env.allArtifacts,
            addJob: env.addJob,
            removeJob: env.removeJob,
            pauseQueue: () => (!env.isPaused && env.toggleQueuePause()),
            resumeQueue: () => (env.isPaused && env.toggleQueuePause()),
            isPaused: env.isPaused,
            getQueue: env.getQueue,
            getCatalog: () => env.savedJobs,
            saveDefinition: env.saveJob,
            deleteDefinition: env.deleteJob,
            setJobs: env.setJobs,
            setStandaloneArtifacts: env.setStandaloneArtifacts,
            clearJobs: env.clearJobs,
        },
        ecosystem: {
            ecosystem: env.ecosystem.ecosystem,
            setEcosystem: env.ecosystem.setEcosystem,
            activeNetworkId: env.ecosystem.activeNetworkId ?? null,
            setActiveNetworkId: env.ecosystem.setActiveNetworkId ?? (() => { }),
            networks: env.ecosystem.networks,
            bridges: env.ecosystem.bridges,
            bridgeMessages: env.ecosystem.bridgeMessages,
            setNetworks: env.ecosystem.setNetworks,
            setBridges: env.ecosystem.setBridges,
            setBridgeMessages: env.ecosystem.setBridgeMessages,
            setActiveBridges: env.ecosystem.setActiveBridges,
            createBridge: env.ecosystem.createBridge,
            removeBridge: env.ecosystem.removeBridge,
            dissolveNetwork: env.ecosystem.dissolveNetwork,
        },
        system: {
            setApiKey: (key: string) => localStorage.setItem("anthropic_api_key", key),
            setModel: (model: string) => localStorage.setItem("anthropic_model", model),
            getModelForCommand: (commandId: string) => getCommandModel(commandId),
            getModelForAgent: (agentId: string) => getAgentModel(agentId),
        },
        architect: {
            generateNetwork: env.architect.generateNetwork,
            deployNetwork: env.architect.deployNetwork,
        },
        automations: env.automations || { runAutomation: async () => { }, runs: [] as AutomationRun[] },
        workspaceManager: env.workspaceManager as CommandContext["workspaceManager"],
        extensions: { studio: env.studioApi ?? undefined },
        storage: jobStorage as Record<string, unknown>,
        addDeliverable: (deliverable) => {
            const storageKey = `${DELIVERABLE_STORAGE_PREFIX}${deliverable.key}`;
            jobStorage[storageKey] = deliverable.content;
            deliverableContents[deliverable.key] = deliverable.content;
            env.addLog(`Deliverable staged: ${deliverable.name} → storage[${storageKey}]`);
        },
    };
}
