import { CommandDefinition } from "../types";

export const resetWorkspaceCommand: CommandDefinition = {
    id: "reset_workspace",
    description: "Clears all agents, channels, groups, and messages from the workspace.",
    tags: ["maintenance", "system", "danger"],
    rbac: ["orchestrator"], // High privilege
    args: {},
    output: "Confirmation message",
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
    description: "Deletes multiple items of a specific type by ID.",
    tags: ["maintenance", "modification"],
    rbac: ["orchestrator"],
    args: {
        type: { name: "type", type: "string", description: "agents | channels | groups | messages", required: true },
        ids: { name: "ids", type: "array", description: "List of IDs to delete", required: true }
    },
    output: "Confirmation",
    execute: async (args, context) => {
        const { type, ids } = args;
        const idSet = new Set(ids as string[]);
        const { setAgents, setChannels, setGroups, setMessages, addLog, agents, channels, groups, messages } = context.workspace;

        if (idSet.size === 0) {
            throw new Error("No IDs provided for bulk delete");
        }

        // Validate IDs exist and compute actual matches
        let existingIds: Set<string>;
        if (type === "agents") {
            existingIds = new Set(agents.filter((a: any) => idSet.has(a.id)).map((a: any) => a.id));
        } else if (type === "channels") {
            existingIds = new Set(channels.filter((c: any) => idSet.has(c.id)).map((c: any) => c.id));
        } else if (type === "groups") {
            existingIds = new Set(groups.filter((g: any) => idSet.has(g.id)).map((g: any) => g.id));
        } else if (type === "messages") {
            existingIds = new Set(messages.filter((m: any) => idSet.has(m.id)).map((m: any) => m.id));
        } else {
            throw new Error(`Unknown type: ${type}`);
        }

        const missingIds = Array.from(idSet).filter(id => !existingIds.has(id));
        const matchedCount = existingIds.size;

        if (matchedCount === 0) {
            throw new Error(`None of the ${idSet.size} provided ${type} IDs were found`);
        }

        // Perform the deletions using only validated IDs
        if (type === "agents") {
            setAgents((prev: any[]) => prev.filter((a: any) => !existingIds.has(a.id)));
            // Cleanup dependencies
            setChannels((prev: any[]) => prev.filter((c: any) => !existingIds.has(c.from) && !existingIds.has(c.to)));
            setGroups((prev: any[]) => prev.map((g: any) => ({ ...g, members: g.members.filter((m: any) => !existingIds.has(m)) })));
            setMessages((prev: any[]) => prev.filter((m: any) => !existingIds.has(m.fromId) && !existingIds.has(m.toId)));
        } else if (type === "channels") {
            setChannels((prev: any[]) => prev.filter((c: any) => !existingIds.has(c.id)));
            setMessages((prev: any[]) => prev.filter((m: any) => !existingIds.has(m.channelId)));
        } else if (type === "groups") {
            setGroups((prev: any[]) => prev.filter((g: any) => !existingIds.has(g.id)));
        } else if (type === "messages") {
            setMessages((prev: any[]) => prev.filter((m: any) => !existingIds.has(m.id)));
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
