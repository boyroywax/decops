import { CommandDefinition } from "../types";

export const resetWorkspaceCommand: CommandDefinition = {
    id: "reset_workspace",
    description: "Clears all agents, channels, groups, and messages from the workspace.",
    tags: ["maintenance", "system", "danger"],
    rbac: ["orchestrator"], // High privilege
    args: {},
    output: "Confirmation message",
    execute: async (args, context) => {
        const { setAgents, setChannels, setGroups, setMessages, addLog } = context.workspace;
        const { setJobs, setStandaloneArtifacts, clearJobs } = context.jobs;
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
            context.automations.setRuns([]);
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
        const count = idSet.size;
        const { setAgents, setChannels, setGroups, setMessages, addLog } = context.workspace;

        if (type === "agents") {
            setAgents((prev: any[]) => prev.filter((a: any) => !idSet.has(a.id)));
            // Cleanup dependencies
            setChannels((prev: any[]) => prev.filter((c: any) => !idSet.has(c.from) && !idSet.has(c.to)));
            setGroups((prev: any[]) => prev.map((g: any) => ({ ...g, members: g.members.filter((m: any) => !idSet.has(m)) })));
            setMessages((prev: any[]) => prev.filter((m: any) => !idSet.has(m.fromId) && !idSet.has(m.toId)));
        } else if (type === "channels") {
            setChannels((prev: any[]) => prev.filter((c: any) => !idSet.has(c.id)));
            setMessages((prev: any[]) => prev.filter((m: any) => !idSet.has(m.channelId)));
        } else if (type === "groups") {
            setGroups((prev: any[]) => prev.filter((g: any) => !idSet.has(g.id)));
        } else if (type === "messages") {
            setMessages((prev: any[]) => prev.filter((m: any) => !idSet.has(m.id)));
        } else {
            throw new Error(`Unknown type: ${type}`);
        }

        addLog(`Bulk deleted ${count} ${type}`);
        return `Deleted ${count} ${type}`;
    }
};
