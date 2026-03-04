
import { useMemo } from "react";
import { CommandContext } from "@/services/commands/types";
import { type WorkspaceContextType } from "@/context/WorkspaceContext";
import { type User } from "@/types";
import { useAutomations } from "@/context/AutomationsContext";
import { useStudioContext } from "@/context/StudioContext";
import { getAgentModel, getCommandModel } from "@/services/ai";

// Interfaces for props that are usually passed from other hooks
// We are mimicking the dependencies required to build the context.
// In a perfect world, these would be provided by a CommandProvider at the top level
// but since they depend on Workspace/Jobs/Ecosystem which are changing, we often
// reconstruct the context.

interface UseCommandContextProps {
    workspace: WorkspaceContextType;
    user: User | null;
    jobs: any; // JobsContextType
    ecosystem: any; // EcosystemContextType
    architect: any; // Architect return
    addLog: (msg: string) => void;
    // We can add more if needed
}

export function useCommandContext({
    workspace,
    user,
    jobs,
    ecosystem,
    architect,
    addLog
}: UseCommandContextProps): CommandContext {
    const automations = useAutomations();
    const { api: studioApi } = useStudioContext();

    const context = useMemo<CommandContext>(() => {
        return {
            workspace: {
                ...workspace,
                addLog: addLog || (() => { }),
                activeChannel: workspace.activeChannel,
                setActiveChannel: workspace.setActiveChannel,
                setActiveChannels: workspace.setActiveChannels
            },
            auth: { user },
            jobs: {
                addArtifact: jobs.addArtifact,
                removeArtifact: jobs.removeArtifact,
                importArtifact: jobs.importArtifact,
                updateArtifact: jobs.updateArtifact || (() => {}),
                allArtifacts: jobs.allArtifacts,
                // Queue Management
                addJob: jobs.addJob,
                removeJob: jobs.removeJob,
                pauseQueue: jobs.toggleQueuePause, // Mapped from toggle
                resumeQueue: jobs.toggleQueuePause,
                isPaused: jobs.isPaused,
                getQueue: () => jobs.jobs, // Assuming jobs.jobs is the list
                // Catalog Management
                getCatalog: () => jobs.savedJobs,
                saveDefinition: jobs.saveJob,
                deleteDefinition: jobs.deleteJob
            },
            ecosystem: {
                ecosystem: ecosystem.ecosystem,
                setEcosystem: ecosystem.setEcosystem,
                activeNetworkId: ecosystem.activeNetworkId ?? null,
                ecosystems: ecosystem.ecosystems,
                bridges: ecosystem.bridges,
                bridgeMessages: ecosystem.bridgeMessages,
                setEcosystems: ecosystem.setEcosystems,
                setBridges: ecosystem.setBridges,
                setBridgeMessages: ecosystem.setBridgeMessages,
                setActiveBridges: ecosystem.setActiveBridges,
                createBridge: ecosystem.createBridge,
                removeBridge: ecosystem.removeBridge,
                saveCurrentNetwork: ecosystem.saveCurrentNetwork,
                loadNetwork: ecosystem.loadNetwork,
                dissolveNetwork: ecosystem.dissolveNetwork
            },
            system: {
                setApiKey: (key: string) => localStorage.setItem("anthropic_api_key", key),
                setModel: (model: string) => localStorage.setItem("anthropic_model", model),
                getModelForCommand: (commandId: string) => getCommandModel(commandId),
                getModelForAgent: (agentId: string) => getAgentModel(agentId),
            },
            architect: {
                generateNetwork: architect.generateNetwork,
                deployNetwork: architect.deployNetwork
            },
            automations: {
                runAutomation: automations.runAutomation,
                runs: automations.runs
            },
            // Chat-panel context has no job storage — provide empty defaults
            storage: {},
            addDeliverable: (deliverable) => {
                const artifact = {
                    id: crypto.randomUUID(),
                    name: deliverable.name,
                    type: deliverable.type,
                    content: deliverable.content,
                    createdAt: Date.now(),
                    tags: [
                        `type:${deliverable.type}`,
                        `source:chat`,
                        `deliverable:${deliverable.key}`,
                        ...(deliverable.tags || []),
                    ],
                    source: "command" as const,
                };
                jobs.importArtifact(artifact);
            },
            // Studio visual job editor (may be null if tab not yet mounted)
            studio: studioApi ?? null,
        };
    }, [workspace, user, jobs, ecosystem, architect, addLog, automations, studioApi]);

    return context;
}
