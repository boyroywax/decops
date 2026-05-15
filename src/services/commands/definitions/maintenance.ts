import { CommandDefinition } from "@/services/commands/types";
import type { Agent, Channel, Group, Message, Network, Bridge } from "@/types";

/** Subset of items deletable through `bulk_delete`. */
type DeletableItem = Agent | Channel | Group | Message | Network | Bridge;

export const resetWorkspaceCommand: CommandDefinition = {
    id: "reset_workspace",
    description: "Clears all agents, channels, groups, and messages from the workspace.",
    tags: ["maintenance", "system", "danger"],
    rbac: ["orchestrator"], // High privilege
    args: {},
    output: "Confirmation message",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const { setAgents, setChannels, setGroups, setMessages } = context.workspace;
        const addLog = context.workspace.addLog || (() => { });
        const { setJobs, setStandaloneArtifacts } = context.jobs;
        const clearJobs = context.jobs.clearJobs;
        // Automations context access if available in command context
        // Assuming context.automations exists as mocked/typed in some places.
        // It's safer to check existence.

        setAgents([]);
        setChannels([]);
        setGroups([]);
        setMessages([]);

        if (clearJobs) {
            clearJobs();
        } else if (setJobs) {
            setJobs([]);
        }

        if (setStandaloneArtifacts) setStandaloneArtifacts([]);

        // context.automations might differ based on where it's constructed.
        // references `useJobExecutor` construction of context.
        if (context.automations && context.automations.setAutomations) {
            context.automations.setAutomations([]);
            if (context.automations.setRuns) context.automations.setRuns([]);
        }

        addLog("Workspace completely reset via command");
        return "Workspace reset";
    }
};

export const bulkDeleteCommand: CommandDefinition = {
    id: "bulk_delete",
    description: "Deletes multiple items of a specific type by ID or name. Pass `all: true` to delete every item of the given type. Deleting `networks` cascades to their agents, channels, groups, and bridges.",
    tags: ["maintenance", "modification"],
    rbac: ["orchestrator"],
    args: {
        type: { name: "type", type: "string", description: "agents | channels | groups | messages | networks | bridges", required: true },
        ids: { name: "ids", type: "array", description: "List of IDs (or names) to delete. Ignored if `all` is true.", required: false },
        all: { name: "all", type: "boolean", description: "Delete every item of the given type", required: false, defaultValue: false }
    },
    output: "Confirmation",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        const { type, ids, all } = args;
        const { setAgents, setChannels, setGroups, setMessages, addLog, agents, channels, groups, messages } = context.workspace;
        const ecosystem = (context as { ecosystem?: {
            networks?: Network[];
            bridges?: Bridge[];
            setNetworks?: (updater: (prev: Network[]) => Network[]) => void;
            setBridges?: (updater: (prev: Bridge[]) => Bridge[]) => void;
        } }).ecosystem || {};
        const networks: Network[] = ecosystem.networks || [];
        const bridges: Bridge[] = ecosystem.bridges || [];
        const setNetworks = ecosystem.setNetworks;
        const setBridges = ecosystem.setBridges;

        // Pick collection by type
        let collection: DeletableItem[];
        if (type === "agents") collection = agents;
        else if (type === "channels") collection = channels;
        else if (type === "groups") collection = groups;
        else if (type === "messages") collection = messages;
        else if (type === "networks") collection = networks;
        else if (type === "bridges") collection = bridges;
        else throw new Error(`Unknown type: ${type}`);

        // Resolve target IDs
        let existingIds: Set<string>;
        let missingIds: string[] = [];

        if (all === true) {
            existingIds = new Set(collection.map((item) => item.id));
        } else {
            const rawIds = (ids as string[] | undefined) || [];
            const idSet = new Set(rawIds);
            if (idSet.size === 0) {
                throw new Error("No IDs provided for bulk delete (pass `all: true` to delete every item)");
            }

            // Match by id OR name (case-insensitive) so AI can pass names too
            const lowerSet = new Set(rawIds.map(s => String(s).toLowerCase()));
            existingIds = new Set(
                collection
                    .filter((item) => idSet.has(item.id)
                        || ((item as { name?: string }).name && lowerSet.has(String((item as { name?: string }).name).toLowerCase())))
                    .map((item) => item.id)
            );

            // Track which inputs didn't resolve
            const matchedKeys = new Set<string>();
            for (const item of collection) {
                if (idSet.has(item.id)) matchedKeys.add(item.id);
                const named = item as { name?: string };
                if (named.name && lowerSet.has(String(named.name).toLowerCase())) {
                    // find original-cased key from rawIds
                    const orig = rawIds.find(r => String(r).toLowerCase() === String(named.name).toLowerCase());
                    if (orig) matchedKeys.add(orig);
                }
            }
            missingIds = rawIds.filter(k => !matchedKeys.has(k));
        }

        const matchedCount = existingIds.size;

        if (matchedCount === 0) {
            const total = (ids as string[] | undefined)?.length ?? 0;
            throw new Error(`None of the ${total} provided ${type} IDs were found`);
        }

        // Perform the deletions using only validated IDs
        if (type === "agents") {
            setAgents((prev: Agent[]) => prev.filter((a) => !existingIds.has(a.id)));
            // Cleanup dependencies
            setChannels((prev: Channel[]) => prev.filter((c) => !existingIds.has(c.from) && !existingIds.has(c.to)));
            setGroups((prev: Group[]) => prev.map((g) => ({ ...g, members: g.members.filter((m) => !existingIds.has(m)) })));
            setMessages((prev: Message[]) => prev.filter((m) => !existingIds.has(m.fromId) && !existingIds.has(m.toId)));
        } else if (type === "channels") {
            setChannels((prev: Channel[]) => prev.filter((c) => !existingIds.has(c.id)));
            setMessages((prev: Message[]) => prev.filter((m) => !existingIds.has(m.channelId)));
        } else if (type === "groups") {
            setGroups((prev: Group[]) => prev.filter((g) => !existingIds.has(g.id)));
        } else if (type === "messages") {
            setMessages((prev: Message[]) => prev.filter((m) => !existingIds.has(m.id)));
        } else if (type === "networks") {
            if (!setNetworks) throw new Error("Ecosystem context unavailable: cannot delete networks");
            // Compute agents being cascaded so we can also clean orphan channels/messages
            const cascadedAgentIds = new Set(
                agents.filter((a) => a.networkId !== undefined && existingIds.has(a.networkId)).map((a) => a.id)
            );
            setNetworks((prev: Network[]) => prev.filter((n) => !existingIds.has(n.id)));
            if (setBridges) {
                setBridges((prev: Bridge[]) => prev.filter((b) =>
                    !existingIds.has(b.fromNetworkId) && !existingIds.has(b.toNetworkId)));
            }
            setAgents((prev: Agent[]) => prev.filter((a) => a.networkId === undefined || !existingIds.has(a.networkId)));
            setChannels((prev: Channel[]) => prev.filter((c) =>
                (c.networkId === undefined || !existingIds.has(c.networkId))
                && !cascadedAgentIds.has(c.from)
                && !cascadedAgentIds.has(c.to)));
            setGroups((prev: Group[]) => prev.filter((g) => g.networkId === undefined || !existingIds.has(g.networkId)));
            if (cascadedAgentIds.size > 0) {
                setMessages((prev: Message[]) => prev.filter((m) =>
                    !cascadedAgentIds.has(m.fromId) && !cascadedAgentIds.has(m.toId)));
            }
        } else if (type === "bridges") {
            if (!setBridges) throw new Error("Ecosystem context unavailable: cannot delete bridges");
            setBridges((prev: Bridge[]) => prev.filter((b) => !existingIds.has(b.id)));
        }

        // Build result message
        let result = `Deleted ${matchedCount} ${type}`;
        if (missingIds.length > 0) {
            addLog(`Bulk deleted ${matchedCount} ${type} (${missingIds.length} IDs not found: ${missingIds.join(", ")})`);
            result += ` (${missingIds.length} ID${missingIds.length !== 1 ? "s" : ""} not found)`;
        } else {
            addLog(`Bulk deleted ${matchedCount} ${type}`);
        }
        return result;
    }
};
