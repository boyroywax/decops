
import type { CommandDefinition, CommandContext } from "../types";

export const createBridgeCommand: CommandDefinition = {
    id: "create_bridge",
    description: "Create a bridge between two agents in different networks.",
    tags: ["topology", "bridge", "create"],
    rbac: ["orchestrator", "builder"],
    args: {
        from_network: { name: "from_network", type: "network", description: "Source Network ID", required: true },
        to_network: { name: "to_network", type: "network", description: "Target Network ID", required: true },
        from_agent: { name: "from_agent", type: "agent", description: "Source Agent ID", required: true },
        to_agent: { name: "to_agent", type: "agent", description: "Target Agent ID", required: true },
        type: { name: "type", type: "string", description: "Type: data, task, consensus", required: false, defaultValue: "data" }
    },
    output: "Details of the created bridge.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" }, bridge: { type: "object" } } },
    execute: async (args, context: CommandContext) => {
        // We can iterate bridges to check existence
        const exists = context.ecosystem.bridges.some((b: any) =>
            (b.fromAgentId === args.from_agent && b.toAgentId === args.to_agent) ||
            (b.fromAgentId === args.to_agent && b.toAgentId === args.from_agent)
        );

        if (exists) throw new Error("Bridge already exists.");

        const bridge = {
            id: crypto.randomUUID(),
            fromNetworkId: args.from_network,
            toNetworkId: args.to_network,
            fromAgentId: args.from_agent,
            toAgentId: args.to_agent,
            type: args.type || "data",
            offset: Math.random() * 100,
            createdAt: new Date().toISOString()
        };

        context.ecosystem.setBridges((prev: any[]) => [...prev, bridge]);
        context.workspace.addLog("Bridge created successfully.");
        return { success: true, bridge };
    }
};

export const deleteBridgeCommand: CommandDefinition = {
    id: "delete_bridge",
    description: "Remove a bridge connection.",
    tags: ["topology", "bridge", "delete"],
    rbac: ["orchestrator"],
    args: {
        id: { name: "id", type: "string", description: "Bridge ID", required: true }
    },
    output: "Confirmation of deletion.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" } } },
    execute: async (args, context: CommandContext) => {
        const bridgeId = args.id;
        context.ecosystem.setBridges((prev: any[]) => prev.filter((b: any) => b.id !== bridgeId));
        context.workspace.addLog("Bridge dissolved");
        return { success: true };
    }
};

export const printTopologyCommand: CommandDefinition = {
    id: "print_topology",
    description: "Output the current network topology (agents, channels, bridges) as JSON.",
    tags: ["topology", "query"],
    rbac: ["researcher", "builder", "orchestrator", "curator"],
    args: {},
    output: "JSON representation of the entire network topology.",
    outputSchema: {
        type: "object",
        properties: {
            agents: { type: "array" }, users: { type: "array" },
            channels: { type: "array" }, groups: { type: "array" },
            bridges: { type: "array" }
        }
    },
    execute: async (args, context: CommandContext) => {
        const topology = {
            agents: context.workspace.agents.map((a: any) => ({ id: a.id, name: a.name, role: a.role })),
            channels: context.workspace.channels.map((c: any) => ({ from: c.from, to: c.to, type: c.type })),
            groups: context.workspace.groups.map((g: any) => ({ name: g.name, members: g.members })),
            ecosystems: context.ecosystem.ecosystems.map((e: any) => ({ id: e.id, name: e.name })),
            bridges: context.ecosystem.bridges
        };
        return topology;
    }
};
