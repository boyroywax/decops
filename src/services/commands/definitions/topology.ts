
import type { CommandDefinition, CommandContext } from "@/services/commands/types";

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
        type: { name: "type", type: "string", description: "Type: data, task, consensus", required: false, defaultValue: "data" },
        items: { name: "items", type: "array", description: "Batch mode: array of {from_network, to_network, from_agent, to_agent, type?} specs. Overrides individual args.", required: false }
    },
    output: "Details of the created bridge.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" }, bridge: { type: "object" } } },
    execute: async (args, context: CommandContext) => {
        const specs = args.items
            ? (Array.isArray(args.items) ? args.items : [args.items])
            : [{ from_network: args.from_network, to_network: args.to_network, from_agent: args.from_agent, to_agent: args.to_agent, type: args.type }];

        const created: any[] = [];

        for (const spec of specs) {
            const exists = context.ecosystem.bridges.some((b: any) =>
                (b.fromAgentId === spec.from_agent && b.toAgentId === spec.to_agent) ||
                (b.fromAgentId === spec.to_agent && b.toAgentId === spec.from_agent)
            );
            if (exists) {
                if (specs.length === 1) throw new Error("Bridge already exists.");
                continue; // skip duplicates in batch
            }

            const bridge = {
                id: crypto.randomUUID(),
                fromNetworkId: spec.from_network,
                toNetworkId: spec.to_network,
                fromAgentId: spec.from_agent,
                toAgentId: spec.to_agent,
                type: spec.type || "data",
                offset: Math.random() * 100,
                createdAt: new Date().toISOString()
            };

            created.push(bridge);
            context.storage.lastBridgeId = bridge.id;
        }

        if (created.length > 0) {
            context.ecosystem.setBridges((prev: any[]) => [...prev, ...created]);
            context.workspace.addLog(`Created ${created.length} bridge(s).`);
        }

        if (!args.items) {
            return { success: true, bridge: created[0] };
        }
        return { success: true, results: created.map(b => ({ bridgeId: b.id })) };
    }
};

export const deleteBridgeCommand: CommandDefinition = {
    id: "delete_bridge",
    description: "Remove a bridge connection.",
    tags: ["topology", "bridge", "delete"],
    rbac: ["orchestrator"],
    args: {
        id: { name: "id", type: "string", description: "Bridge ID", required: true },
        ids: { name: "ids", type: "array", description: "Batch mode: array of bridge IDs to delete. Overrides single id.", required: false }
    },
    output: "Confirmation of deletion.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" } } },
    execute: async (args, context: CommandContext) => {
        const targetIds = args.ids
            ? (Array.isArray(args.ids) ? args.ids : [args.ids])
            : [args.id];
        const idSet = new Set(targetIds);
        context.ecosystem.setBridges((prev: any[]) => prev.filter((b: any) => !idSet.has(b.id)));
        context.workspace.addLog(`Dissolved ${targetIds.length} bridge(s)`);
        return { success: true, deleted: targetIds.length };
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
        const eco = context.ecosystem.ecosystem;
        const topology = {
            ecosystem: eco ? { id: eco.id, name: eco.name, did: eco.did } : null,
            agents: context.workspace.agents.map((a: any) => ({ id: a.id, name: a.name, role: a.role, networkId: a.networkId })),
            channels: context.workspace.channels.map((c: any) => ({ from: c.from, to: c.to, type: c.type, networkId: c.networkId })),
            groups: context.workspace.groups.map((g: any) => ({ name: g.name, members: g.members, networkId: g.networkId })),
            networks: context.ecosystem.ecosystems.map((e: any) => ({
                id: e.id, name: e.name,
                agentCount: e.agents?.length || 0,
                channelCount: e.channels?.length || 0,
                groupCount: e.groups?.length || 0,
            })),
            bridges: context.ecosystem.bridges
        };
        // Write to storage and produce deliverable
        context.storage.lastTopology = topology;
        context.addDeliverable({
            key: 'topology',
            name: 'Network Topology',
            type: 'json',
            content: JSON.stringify(topology, null, 2),
            tags: ['topology', 'report'],
        });

        return topology;
    }
};
