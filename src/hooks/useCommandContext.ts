
import { useMemo, useRef, useEffect } from "react";
import { CommandContext } from "@/services/commands/types";
import { type WorkspaceContextType } from "@/context/WorkspaceContext";
import { type User } from "@/types";
import type { JobDefinition } from "@/types/jobs";
import type { JobArtifact } from "@/types";
import type { UseJobsReturn } from "@/hooks/useJobs";
import type { UseEcosystemReturn } from "@/hooks/useEcosystem";
import { useAutomations } from "@/context/AutomationsContext";
import { getAgentModel, getCommandModel } from "@/services/ai";

// ── Narrow input types ──────────────────────────────────────
// useCommandContext is called from two places with subtly different shapes:
//
//   1. CommandContextProvider — passes `useJobsContext()` (= UseJobsReturn) and
//      `useEcosystem()` (= UseEcosystemReturn) verbatim.
//   2. ChatPanel — passes `useJobsContext()` for jobs, but accepts an
//      *external* `ecosystem` prop that may be a partial shape (the documented
//      fallback is `{ networks: [], bridges: [] }`), and an `architect` that
//      is either the real `useArchitect()` return or an inline no-op literal.
//
// These narrow shapes accept both producers. Fields that are optional here
// receive safe defaults inside the hook body. Notes:
//   • `JobsInput` augments `UseJobsReturn` with the catalog fields the hook
//     forwards to `CommandContext.jobs.getCatalog / saveDefinition /
//     deleteDefinition`. These are not produced by `useJobs()` today (a
//     pre-existing gap); the hook supplies empty/no-op defaults.
//   • `EcosystemInput` is `Partial<UseEcosystemReturn>` so the ChatPanel
//     fallback compiles. Missing setters/actions are replaced with no-ops.
//   • `ArchitectInput` widens return types to `void | Promise<void>` so both
//     the async `useArchitect()` impl and the sync `() => {}` fallback fit.

export type JobsInput = UseJobsReturn & {
    savedJobs?: JobDefinition[];
    saveJob?: (def: JobDefinition) => void;
    deleteJob?: (id: string) => void;
};

export type EcosystemInput = Partial<UseEcosystemReturn>;

export interface ArchitectInput {
    generateNetwork: (prompt: string) => void | Promise<void>;
    deployNetwork: () => void | Promise<void>;
}

interface UseCommandContextProps {
    workspace: WorkspaceContextType;
    user: User | null;
    jobs: JobsInput;
    ecosystem: EcosystemInput;
    architect: ArchitectInput;
    addLog: (msg: string) => void;
    /** Toolkit-injected extensions (e.g. { studio: StudioAPI, editor: EditorAPI }) */
    extensions?: Record<string, unknown>;
}


export function useCommandContext({
    workspace,
    user,
    jobs,
    ecosystem,
    architect,
    addLog,
    extensions,
}: UseCommandContextProps): CommandContext {
    const automations = useAutomations();

    // Live-state refs: always reflect the latest workspace arrays so that
    // long-running async `execute()` calls (multi-step jobs, AI tool loops)
    // can read fresh state instead of the snapshot frozen into the memoized
    // CommandContext value.
    const agentsRef = useRef(workspace.agents);
    const channelsRef = useRef(workspace.channels);
    const groupsRef = useRef(workspace.groups);
    const messagesRef = useRef(workspace.messages);
    useEffect(() => { agentsRef.current = workspace.agents; }, [workspace.agents]);
    useEffect(() => { channelsRef.current = workspace.channels; }, [workspace.channels]);
    useEffect(() => { groupsRef.current = workspace.groups; }, [workspace.groups]);
    useEffect(() => { messagesRef.current = workspace.messages; }, [workspace.messages]);

    const context = useMemo<CommandContext>(() => {
        const noop = () => { /* no-op fallback */ };
        return {
            workspace: {
                ...workspace,
                addLog: addLog || (() => { }),
                activeChannel: workspace.activeChannel,
                setActiveChannel: workspace.setActiveChannel,
                setActiveChannels: workspace.setActiveChannels,
                getAgents: () => agentsRef.current,
                getChannels: () => channelsRef.current,
                getGroups: () => groupsRef.current,
                getMessages: () => messagesRef.current,
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
                // Catalog Management — UseJobsReturn doesn't expose these yet;
                // empty/no-op defaults keep CommandContext invariants until
                // the catalog hook is consolidated into useJobs.
                getCatalog: () => jobs.savedJobs ?? [],
                saveDefinition: jobs.saveJob ?? noop,
                deleteDefinition: jobs.deleteJob ?? noop,
            },
            ecosystem: {
                // ChatPanel may pass a fallback that only carries
                // `{ networks: [], bridges: [] }`. The hook's output shape
                // requires non-null Ecosystem + setters / actions; we shim
                // missing fields with empty defaults / no-ops here so the
                // CommandContext invariants hold even on the lite path.
                ecosystem: ecosystem.ecosystem ?? {
                    id: "fallback",
                    name: "(none)",
                    description: "",
                    createdAt: 0,
                    networks: [],
                    bridges: [],
                    deployedAt: undefined,
                } as unknown as CommandContext["ecosystem"]["ecosystem"],
                setEcosystem: ecosystem.setEcosystem ?? noop,
                activeNetworkId: ecosystem.activeNetworkId ?? null,
                setActiveNetworkId: ecosystem.setActiveNetworkId ?? noop,
                networks: ecosystem.networks ?? [],
                bridges: ecosystem.bridges ?? [],
                bridgeMessages: ecosystem.bridgeMessages ?? [],
                setNetworks: ecosystem.setNetworks ?? noop,
                setBridges: ecosystem.setBridges ?? noop,
                setBridgeMessages: ecosystem.setBridgeMessages ?? noop,
                setActiveBridges: ecosystem.setActiveBridges ?? noop,
                createBridge: ecosystem.createBridge ?? noop,
                removeBridge: ecosystem.removeBridge ?? noop,
                dissolveNetwork: ecosystem.dissolveNetwork ?? noop,
            },
            system: {
                setApiKey: (key: string) => localStorage.setItem("anthropic_api_key", key),
                setModel: (model: string) => localStorage.setItem("anthropic_model", model),
                getModelForCommand: (commandId: string) => getCommandModel(commandId),
                getModelForAgent: (agentId: string) => getAgentModel(agentId),
            },
            architect: {
                // Discard the Promise so the output shape matches `() => void`.
                generateNetwork: (prompt: string) => { void architect.generateNetwork(prompt); },
                deployNetwork: () => { void architect.deployNetwork(); },
            },
            automations: {
                runAutomation: automations.runAutomation,
                runs: automations.runs
            },
            // Toolkit-injected extension APIs (studio, editor, etc.)
            extensions: extensions ?? {},
            // Chat-panel context has no job storage — provide empty defaults
            storage: {},
            addDeliverable: (deliverable) => {
                const artifact: JobArtifact = {
                    id: crypto.randomUUID(),
                    name: deliverable.name,
                    // `CommandContext.addDeliverable` accepts `type: string` for ergonomic
                    // call sites; the artifact storage layer narrows to ArtifactType.
                    // Callers are expected to pass one of the supported literal values.
                    type: deliverable.type as JobArtifact["type"],
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
        };
    }, [workspace, user, jobs, ecosystem, architect, addLog, automations, extensions]);

    return context;
}
