
import type { CommandDefinition, CommandContext } from "@/services/commands/types";
import type { Agent, Bridge, Channel, Group, Network } from "@/types";
import { useEcosystemStore, useWorkspaceStore } from "@/stores";

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

        // Build lookup helpers: accept either an ID or a name (case-insensitive).
        // Read from the live Zustand stores so we always see the latest state
        // (avoids closure-staleness when this job runs after sibling parallel
        // jobs that created the networks/agents we need to resolve).
        const buildResolvers = () => {
            const liveAgents = useWorkspaceStore.getState().agents;
            const liveNetworks = useEcosystemStore.getState().ecosystem.networks;
            const storage = context.storage as { _agents?: Agent[]; _networks?: Network[] };
            const ctxAgents = context.workspace.getAgents?.() ?? context.workspace.agents;
            const allAgents: Agent[] = [
                ...liveAgents,
                ...ctxAgents,
                ...(storage._agents || [])
            ];
            const allNetworks: Network[] = [
                ...liveNetworks,
                ...context.ecosystem.networks,
                ...(storage._networks || [])
            ];
            return {
                resolveAgent: (key: string): string | null => {
                    if (!key) return null;
                    const byId = allAgents.find((a) => a.id === key);
                    if (byId) return byId.id;
                    const byName = allAgents.find((a) => a.name && String(a.name).toLowerCase() === String(key).toLowerCase());
                    return byName?.id || null;
                },
                resolveNetwork: (key: string): string | null => {
                    if (!key) return null;
                    const byId = allNetworks.find((n) => n.id === key);
                    if (byId) return byId.id;
                    const byName = allNetworks.find((n) => n.name && String(n.name).toLowerCase() === String(key).toLowerCase());
                    return byName?.id || null;
                }
            };
        };

        // Resolve a single spec, retrying briefly to allow concurrent network/
        // agent creation jobs (in parallel architect deploys) to finish.
        //
        // Uses exponential backoff (50 ms → 100 → 200 → 400 → 800 → 1000 cap)
        // with a 5 s total budget. Previous strategy of 30 × 500 ms = 15 s
        // fixed wait blocked the chat round unnecessarily when the dependent
        // jobs had already failed.
        const resolveSpecWithRetry = async (spec: { from_network: string; to_network: string; from_agent: string; to_agent: string; type?: string }): Promise<{ fromNetId: string|null; toNetId: string|null; fromAgentId: string|null; toAgentId: string|null }> => {
            const totalBudgetMs = 5_000;
            const maxDelayMs = 1_000;
            const startedAt = Date.now();
            let delayMs = 50;
            for (;;) {
                const { resolveAgent, resolveNetwork } = buildResolvers();
                const fromNetId = resolveNetwork(spec.from_network);
                const toNetId = resolveNetwork(spec.to_network);
                const fromAgentId = resolveAgent(spec.from_agent);
                const toAgentId = resolveAgent(spec.to_agent);
                if (fromNetId && toNetId && fromAgentId && toAgentId) {
                    return { fromNetId, toNetId, fromAgentId, toAgentId };
                }
                const elapsed = Date.now() - startedAt;
                if (elapsed + delayMs >= totalBudgetMs) break;
                await new Promise(r => setTimeout(r, delayMs));
                delayMs = Math.min(delayMs * 2, maxDelayMs);
            }
            const { resolveAgent, resolveNetwork } = buildResolvers();
            return {
                fromNetId: resolveNetwork(spec.from_network),
                toNetId: resolveNetwork(spec.to_network),
                fromAgentId: resolveAgent(spec.from_agent),
                toAgentId: resolveAgent(spec.to_agent),
            };
        };

        const created: Bridge[] = [];

        for (const spec of specs) {
            const { fromNetId, toNetId, fromAgentId, toAgentId } = await resolveSpecWithRetry(spec);

            if (!fromNetId || !toNetId || !fromAgentId || !toAgentId) {
                const missing: string[] = [];
                if (!fromNetId) missing.push(`from_network "${spec.from_network}"`);
                if (!toNetId) missing.push(`to_network "${spec.to_network}"`);
                if (!fromAgentId) missing.push(`from_agent "${spec.from_agent}"`);
                if (!toAgentId) missing.push(`to_agent "${spec.to_agent}"`);
                const msg = `Cannot create bridge — could not resolve: ${missing.join(", ")}`;
                if (specs.length === 1) throw new Error(msg);
                context.workspace.addLog(`[create_bridge] ${msg} — skipping`);
                continue;
            }

            const exists = context.ecosystem.bridges.some((b) =>
                (b.fromAgentId === fromAgentId && b.toAgentId === toAgentId) ||
                (b.fromAgentId === toAgentId && b.toAgentId === fromAgentId)
            );
            if (exists) {
                if (specs.length === 1) throw new Error("Bridge already exists.");
                continue; // skip duplicates in batch
            }

            const bridge = {
                id: crypto.randomUUID(),
                fromNetworkId: fromNetId,
                toNetworkId: toNetId,
                fromAgentId: fromAgentId,
                toAgentId: toAgentId,
                type: spec.type || "data",
                offset: Math.random() * 100,
                createdAt: new Date().toISOString()
            };

            created.push(bridge);
            context.storage.lastBridgeId = bridge.id;
        }

        if (created.length > 0) {
            context.ecosystem.setBridges((prev: Bridge[]) => [...prev, ...created]);
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
        context.ecosystem.setBridges((prev: Bridge[]) => prev.filter((b) => !idSet.has(b.id)));
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
        const liveAgents = context.workspace.getAgents?.() ?? context.workspace.agents;
        const liveChannels = context.workspace.getChannels?.() ?? context.workspace.channels;
        const liveGroups = context.workspace.getGroups?.() ?? context.workspace.groups;
        const topology = {
            ecosystem: eco ? { id: eco.id, name: eco.name, did: eco.did } : null,
            agents: liveAgents.map((a: Agent) => ({ id: a.id, name: a.name, role: a.role, networkId: a.networkId })),
            channels: liveChannels.map((c: Channel) => ({ from: c.from, to: c.to, type: c.type, networkId: c.networkId })),
            groups: liveGroups.map((g: Group) => ({ name: g.name, members: g.members, networkId: g.networkId })),
            networks: context.ecosystem.networks.map((e: Network) => ({
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
