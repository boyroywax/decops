
import type { CommandDefinition, CommandContext } from "../types";

export const saveEcosystemCommand: CommandDefinition = {
    id: "save_ecosystem",
    description: "Save the current agent, channel, and group configuration as a named ecosystem.",
    tags: ["ecosystem", "save"],
    rbac: ["orchestrator", "curator"],
    args: {
        name: {
            name: "name",
            type: "string",
            description: "Name for the saved ecosystem",
        }
    },
    output: "JSON object of the saved network configuration.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" }, network: { type: "object" } } },
    execute: async (args, context: CommandContext) => {
        // We'll simulate the saveCurrentNetwork logic by setting the save name then triggering saving if possible,
        // or by manually calling save if we can access the full state.
        // The implementation in useEcosystem relies on internal state (activeAgents, etc.) at the moment of save.
        // Ideally we should pass the current state to the command context to be saved.
        // Since `saveCurrentNetwork` in `useEcosystem` uses its closure state, calling it directly might save
        // whatever `useEcosystem` sees. However, `CommandContext.ecosystem.saveCurrentNetwork` is bound to that hook instance.
        // But `useEcosystem`'s `saveCurrentNetwork` checks `ecoSaveName` state validy.
        // We might need to Refactor `useEcosystem` to accept a name arg in `saveCurrentNetwork(name?: string)`.

        // For now, let's assume we can't easily change the hook signature without refactoring it.
        // A workaround: We can just manually implement the saving logic here since we have `setEcosystems` and the data.

        const net = {
            id: crypto.randomUUID(),
            name: args.name,
            did: `did:decops:net:${crypto.randomUUID()}`,
            color: "#00e5a0", // Default color
            agents: [...context.workspace.agents],
            channels: [...context.workspace.channels],
            groups: [...context.workspace.groups],
            messages: [...context.workspace.messages],
            createdAt: new Date().toISOString()
        };

        context.ecosystem.setEcosystems((prev: any[]) => [...prev, net]);
        context.workspace.addLog(`Ecosystem "${args.name}" saved.`);
        return { success: true, network: net };
    }
};

export const loadEcosystemCommand: CommandDefinition = {
    id: "load_ecosystem",
    description: "Load an ecosystem configuration into the active workspace.",
    tags: ["ecosystem", "load"],
    rbac: ["orchestrator", "curator"],
    args: {
        id: {
            name: "id",
            type: "network",
            description: "ID of the ecosystem to load",
            required: true
        }
    },
    output: "Confirmation of load operation.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" } } },
    execute: async (args, context: CommandContext) => {
        const net = context.ecosystem.ecosystems.find((n: any) => n.id === args.id);
        if (!net) throw new Error("Ecosystem not found");

        const { setAgents, setChannels, setGroups, setMessages, addLog } = context.workspace;

        setAgents([...net.agents]);
        setChannels([...net.channels]);
        setGroups([...net.groups]);
        setMessages([...net.messages]);

        addLog(`Loaded network "${net.name}" into workspace`);
        return { success: true };
    }
};

export const listEcosystemsCommand: CommandDefinition = {
    id: "list_ecosystems",
    description: "List all saved ecosystems.",
    tags: ["ecosystem", "query"],
    rbac: ["researcher", "builder", "curator", "orchestrator"],
    args: {},
    output: "List of all saved ecosystems.",
    outputSchema: { type: "object", properties: { ecosystems: { type: "array", items: { type: "object" } } } },
    execute: async (args, context: CommandContext) => {
        const list = context.ecosystem.ecosystems.map((e: any) => ({
            id: e.id,
            name: e.name,
            agentCount: e.agents.length
        }));
        return { ecosystems: list };
    }
};

export const deleteEcosystemCommand: CommandDefinition = {
    id: "delete_ecosystem",
    description: "Delete a saved ecosystem.",
    tags: ["ecosystem", "delete"],
    rbac: ["orchestrator"],
    args: {
        id: {
            name: "id",
            type: "network",
            description: "ID of the ecosystem to delete",
            required: true
        }
    },
    output: "Confirmation of deletion.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" } } },
    execute: async (args, context: CommandContext) => {
        const { setEcosystems, setBridges } = context.ecosystem;
        const id = args.id;

        setEcosystems((prev: any[]) => prev.filter((n: any) => n.id !== id));
        setBridges((prev: any[]) => prev.filter((b: any) => b.fromNetworkId !== id && b.toNetworkId !== id));

        context.workspace.addLog("Network dissolved from ecosystem");
        return { success: true };
    }
};
