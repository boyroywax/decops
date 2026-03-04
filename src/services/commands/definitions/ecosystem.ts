
import type { CommandDefinition, CommandContext } from "@/services/commands/types";
import type { RoleId } from "@/types";
import { generateNetworkDID } from "@/utils/identity";
import { generateMeshConfig } from "@/services/ai";
import { ROLES, CHANNEL_TYPES, GOVERNANCE_MODELS, GROUP_COLORS, NETWORK_COLORS } from "@/constants";
import { generateDID, generateKeyPair, generateGroupDID } from "@/utils/identity";
import { createAieosEntity } from "@/utils/aieos";

export const createNetworkCommand: CommandDefinition = {
    id: "create_network",
    description: "Create a new network in the workspace, optionally populated via the AI Architect.",
    tags: ["ecosystem", "network", "create"],
    rbac: ["orchestrator", "builder"],
    usesAI: true,
    args: {
        name: {
            name: "name",
            type: "string",
            description: "Name for the new network",
            required: true
        },
        description: {
            name: "description",
            type: "string",
            description: "Optional description",
            required: false,
            defaultValue: ""
        },
        architectPrompt: {
            name: "architectPrompt",
            type: "string",
            description: "If provided, use the AI Architect to generate the network contents",
            required: false,
            defaultValue: ""
        },
        items: {
            name: "items",
            type: "array",
            description: "Batch mode: array of {name, description?} specs. Overrides individual args (architectPrompt not supported in batch).",
            required: false,
        }
    },
    output: "The created network object.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" }, network: { type: "object" } } },
    execute: async (args, context: CommandContext) => {
        // Batch mode: create multiple bare networks (architectPrompt not supported)
        if (args.items) {
            const specs = Array.isArray(args.items) ? args.items : [args.items];
            const existingNetworks = context.ecosystem.ecosystems || [];
            const created: any[] = [];

            for (let i = 0; i < specs.length; i++) {
                const spec = specs[i];
                const netId = crypto.randomUUID();
                const cIdx = (existingNetworks.length + i) % (NETWORK_COLORS?.length || 6);
                const clr = NETWORK_COLORS?.[cIdx] || "#00e5a0";

                const net = {
                    id: netId,
                    name: spec.name,
                    description: spec.description || "",
                    did: generateNetworkDID(),
                    color: clr,
                    agents: [] as any[], channels: [] as any[], groups: [] as any[], messages: [] as any[],
                    createdAt: new Date().toISOString(),
                };

                created.push(net);
                context.storage.lastNetworkId = netId;
                context.storage[`network_${spec.name}`] = netId;
            }

            context.ecosystem.setEcosystems((prev: any[]) => [...prev, ...created]);
            context.storage._networks = [...(context.storage._networks || []), ...created];
            context.workspace.addLog(`Created ${created.length} network(s): ${created.map((n: any) => n.name).join(", ")}`);
            return { success: true, results: created.map((n: any) => ({ networkId: n.id, name: n.name })) };
        }

        // Single mode
        const networkId = crypto.randomUUID();
        const existingNetworks = context.ecosystem.ecosystems || [];
        const colorIdx = existingNetworks.length % (NETWORK_COLORS?.length || 6);
        const color = NETWORK_COLORS?.[colorIdx] || "#00e5a0";

        let agents: any[] = [];
        let channels: any[] = [];
        let groups: any[] = [];
        let messages: any[] = [];

        // If architectPrompt is provided, generate the network contents via AI
        if (args.architectPrompt) {
            context.workspace.addLog(`Architect generating network "${args.name}"...`);
            try {
                const config = await generateMeshConfig(args.architectPrompt);

                // Create agents
                for (const a of (config.agents || [])) {
                    if (!a || !a.name) continue;
                    const validRole = (ROLES.find((r: any) => r.id === a.role) ? a.role : "researcher") as RoleId;
                    agents.push({
                        id: crypto.randomUUID(), name: a.name, role: validRole,
                        prompt: a.prompt || "", did: generateDID(), keys: generateKeyPair(),
                        createdAt: new Date().toISOString(), status: "active",
                        networkId,
                        aieos: createAieosEntity(a.name, validRole, a.prompt || ""),
                    });
                }

                // Create channels
                for (const c of (config.channels || [])) {
                    if (c.from == null || c.to == null) continue;
                    const fromAgent = agents[c.from];
                    const toAgent = agents[c.to];
                    if (!fromAgent || !toAgent) continue;
                    const validType = CHANNEL_TYPES.find((t: any) => t.id === c.type) ? c.type : "data";
                    channels.push({
                        id: crypto.randomUUID(), from: fromAgent.id, to: toAgent.id,
                        type: validType, offset: Math.random() * 120, createdAt: new Date().toISOString(),
                        networkId,
                    });
                }

                // Create groups
                for (const g of (config.groups || [])) {
                    if (!g || !g.name) continue;
                    const memberIds = (g.members || []).map((idx: number) => agents[idx]?.id).filter(Boolean);
                    if (memberIds.length < 2) continue;
                    const validGov = GOVERNANCE_MODELS.find((m: any) => m.id === g.governance) ? g.governance : "majority";
                    groups.push({
                        id: crypto.randomUUID(), name: g.name, governance: validGov,
                        members: memberIds, threshold: g.threshold || 2,
                        did: generateGroupDID(), color: GROUP_COLORS[groups.length % GROUP_COLORS.length],
                        createdAt: new Date().toISOString(),
                        networkId,
                    });
                }

                context.workspace.addLog(`Architect generated ${agents.length} agents, ${channels.length} channels, ${groups.length} groups.`);
                // Also add architect-generated entities to workspace so they're live
                if (agents.length > 0) context.workspace.setAgents((prev: any[]) => [...prev, ...agents]);
                if (channels.length > 0) context.workspace.setChannels((prev: any[]) => [...prev, ...channels]);
                if (groups.length > 0) context.workspace.setGroups((prev: any[]) => [...prev, ...groups]);
            } catch (e: any) {
                context.workspace.addLog(`Architect failed: ${e.message}. Creating empty network.`);
            }
        }

        const net = {
            id: networkId,
            name: args.name,
            description: args.description || "",
            did: generateNetworkDID(),
            color,
            agents,
            channels,
            groups,
            messages,
            createdAt: new Date().toISOString(),
        };

        context.ecosystem.setEcosystems((prev: any[]) => [...prev, net]);
        context.workspace.addLog(`Network "${args.name}" created in ecosystem.`);

        // Write to shared storage for downstream steps
        context.storage.lastNetworkId = networkId;
        context.storage[`network_${args.name}`] = networkId;

        // Accumulate entities so downstream steps can look them up
        // (React state may be stale within the same job execution cycle)
        context.storage._networks = [...(context.storage._networks || []), net];
        if (agents.length > 0) {
            context.storage._agents = [...(context.storage._agents || []), ...agents];
            // Also set per-agent storage keys for name→id resolution
            for (const a of agents) context.storage[`agent_${a.name}`] = a.id;
        }
        if (channels.length > 0) {
            context.storage._channels = [...(context.storage._channels || []), ...channels];
        }

        return { success: true, network: net };
    }
};

export const saveEcosystemCommand: CommandDefinition = {
    id: "save_ecosystem",
    description: "(Deprecated) Save the current workspace entities as a named network. Use create_network instead.",
    tags: ["ecosystem", "save"],
    rbac: ["orchestrator", "curator"],
    hidden: true,
    args: {
        name: {
            name: "name",
            type: "string",
            description: "Name for the saved network",
        }
    },
    output: "JSON object of the saved network configuration.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" }, network: { type: "object" } } },
    execute: async (args, context: CommandContext) => {
        const networkId = crypto.randomUUID();

        // Tag entities with the networkId so they know which network they belong to
        const taggedAgents = context.workspace.agents.map((a: any) => ({ ...a, networkId }));
        const taggedChannels = context.workspace.channels.map((c: any) => ({ ...c, networkId }));
        const taggedGroups = context.workspace.groups.map((g: any) => ({ ...g, networkId }));

        const net = {
            id: networkId,
            name: args.name,
            did: `did:decops:net:${crypto.randomUUID()}`,
            color: "#00e5a0",
            agents: taggedAgents,
            channels: taggedChannels,
            groups: taggedGroups,
            messages: [...context.workspace.messages],
            createdAt: new Date().toISOString()
        };

        context.ecosystem.setEcosystems((prev: any[]) => [...prev, net]);

        // Also update the workspace-level entities with their new networkId
        context.workspace.setAgents(taggedAgents);
        context.workspace.setChannels(taggedChannels);
        context.workspace.setGroups(taggedGroups);

        context.workspace.addLog(`Network "${args.name}" saved to ecosystem.`);
        return { success: true, network: net };
    }
};

export const loadEcosystemCommand: CommandDefinition = {
    id: "load_ecosystem",
    description: "(Deprecated) Load a network into the workspace. Networks are now part of the workspace ecosystem.",
    tags: ["ecosystem", "load"],
    rbac: ["orchestrator", "curator"],
    hidden: true,
    args: {
        id: {
            name: "id",
            type: "network",
            description: "ID of the network to load",
            required: true
        }
    },
    output: "Confirmation of load operation.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" } } },
    execute: async (args, context: CommandContext) => {
        const net = context.ecosystem.ecosystems.find((n: any) => n.id === args.id);
        if (!net) throw new Error("Network not found in ecosystem");

        const { setAgents, setChannels, setGroups, setMessages, addLog } = context.workspace;

        // Ensure agents/channels/groups carry their networkId
        setAgents(net.agents.map((a: any) => ({ ...a, networkId: a.networkId || net.id })));
        setChannels(net.channels.map((c: any) => ({ ...c, networkId: c.networkId || net.id })));
        setGroups(net.groups.map((g: any) => ({ ...g, networkId: g.networkId || net.id })));
        setMessages([...net.messages]);

        addLog(`Loaded network "${net.name}" into workspace`);
        return { success: true };
    }
};

export const listEcosystemsCommand: CommandDefinition = {
    id: "list_ecosystems",
    description: "(Deprecated) Use list_networks instead.",
    tags: ["ecosystem", "query"],
    rbac: ["researcher", "builder", "curator", "orchestrator"],
    hidden: true,
    args: {},
    output: "List of all networks.",
    outputSchema: { type: "object", properties: { networks: { type: "array", items: { type: "object" } } } },
    execute: async (args, context: CommandContext) => {
        const list = context.ecosystem.ecosystems.map((e: any) => ({
            id: e.id,
            name: e.name,
            agentCount: e.agents?.length || 0,
            channelCount: e.channels?.length || 0,
            groupCount: e.groups?.length || 0,
        }));
        return { networks: list };
    }
};

export const listNetworksCommand: CommandDefinition = {
    id: "list_networks",
    description: "List all networks in the workspace ecosystem.",
    tags: ["ecosystem", "network", "query"],
    rbac: ["researcher", "builder", "curator", "orchestrator"],
    args: {},
    output: "List of all networks in the ecosystem.",
    outputSchema: { type: "object", properties: { networks: { type: "array", items: { type: "object" } } } },
    execute: async (args, context: CommandContext) => {
        const list = context.ecosystem.ecosystems.map((n: any) => ({
            id: n.id,
            name: n.name,
            description: n.description || "",
            color: n.color,
            agentCount: n.agents?.length || 0,
            channelCount: n.channels?.length || 0,
            groupCount: n.groups?.length || 0,
            createdAt: n.createdAt,
        }));

        context.storage.networks = list;
        return { networks: list };
    }
};

export const updateNetworkCommand: CommandDefinition = {
    id: "update_network",
    description: "Update properties of an existing network in the workspace (name, description, color).",
    tags: ["ecosystem", "network", "update"],
    rbac: ["orchestrator", "builder"],
    args: {
        id: {
            name: "id",
            type: "network",
            description: "ID of the network to update",
            required: true
        },
        name: {
            name: "name",
            type: "string",
            description: "New name for the network",
            required: false
        },
        description: {
            name: "description",
            type: "string",
            description: "New description for the network",
            required: false
        },
        color: {
            name: "color",
            type: "string",
            description: "New color hex value for the network (e.g. #ff6600)",
            required: false
        },
        items: {
            name: "items",
            type: "array",
            description: "Batch mode: array of {id, name?, description?, color?} specs. Overrides individual args.",
            required: false,
        }
    },
    output: "The updated network object.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" }, network: { type: "object" } } },
    execute: async (args, context: CommandContext) => {
        // Batch mode
        if (args.items) {
            const specs = Array.isArray(args.items) ? args.items : [args.items];
            const results: any[] = [];

            context.ecosystem.setEcosystems((prev: any[]) => {
                const updated = [...prev];
                for (const spec of specs) {
                    const idx = updated.findIndex((n: any) => n.id === spec.id);
                    if (idx === -1) throw new Error(`Network ${spec.id} not found`);
                    const changes: Record<string, any> = {};
                    if (spec.name !== undefined && spec.name !== "") changes.name = spec.name;
                    if (spec.description !== undefined) changes.description = spec.description;
                    if (spec.color !== undefined && spec.color !== "") changes.color = spec.color;
                    updated[idx] = { ...updated[idx], ...changes };
                    results.push(updated[idx]);
                }
                return updated;
            });

            context.workspace.addLog(`Updated ${results.length} network(s)`);
            return { success: true, results: results.map((n: any) => ({ networkId: n.id, name: n.name })) };
        }

        // Single mode
        const id = args.id;
        const existing = context.ecosystem.ecosystems.find((n: any) => n.id === id);
        if (!existing) throw new Error("Network not found in ecosystem");

        const updates: Record<string, any> = {};
        if (args.name !== undefined && args.name !== "") updates.name = args.name;
        if (args.description !== undefined) updates.description = args.description;
        if (args.color !== undefined && args.color !== "") updates.color = args.color;

        if (Object.keys(updates).length === 0) {
            throw new Error("No update fields provided. Specify at least one of: name, description, color.");
        }

        let updatedNet: any = null;
        context.ecosystem.setEcosystems((prev: any[]) =>
            prev.map((n: any) => {
                if (n.id === id) {
                    updatedNet = { ...n, ...updates };
                    return updatedNet;
                }
                return n;
            })
        );

        context.workspace.addLog(`Network "${updatedNet?.name || id}" updated: ${Object.keys(updates).join(", ")}`);
        context.storage.lastNetworkId = id;
        return { success: true, network: updatedNet || { ...existing, ...updates } };
    }
};

export const destroyNetworkCommand: CommandDefinition = {
    id: "destroy_network",
    description: "Destroy a network, removing it from the workspace along with its bridges. Use cascade to also remove agents, channels, and groups belonging to the network.",
    tags: ["ecosystem", "network", "destroy", "delete"],
    rbac: ["orchestrator"],
    args: {
        id: {
            name: "id",
            type: "network",
            description: "ID of the network to destroy",
            required: true
        },
        cascade: {
            name: "cascade",
            type: "boolean",
            description: "Also remove workspace agents, channels, and groups belonging to this network (default: false)",
            required: false,
            defaultValue: false
        },
        ids: {
            name: "ids",
            type: "array",
            description: "Batch mode: array of network IDs to destroy. Overrides single id.",
            required: false,
        }
    },
    output: "Summary of what was destroyed.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" }, removed: { type: "object" } } },
    execute: async (args, context: CommandContext) => {
        const targetIds = args.ids
            ? (Array.isArray(args.ids) ? args.ids : [args.ids])
            : [args.id];

        const { setEcosystems, setBridges, ecosystems } = context.ecosystem;
        const totalRemoved: Record<string, number> = { networks: 0, bridges: 0 };

        for (const id of targetIds) {
            const net = ecosystems.find((n: any) => n.id === id);
            if (!net) throw new Error(`Network ${id} not found in ecosystem`);
            totalRemoved.networks++;
        }

        // Remove all targeted networks
        setEcosystems((prev: any[]) => prev.filter((n: any) => !targetIds.includes(n.id)));

        // Remove bridges referencing any targeted network
        setBridges((prev: any[]) => {
            const before = prev.length;
            const after = prev.filter((b: any) => !targetIds.includes(b.fromNetworkId) && !targetIds.includes(b.toNetworkId));
            totalRemoved.bridges = before - after.length;
            return after;
        });

        // Cascade: remove workspace-level entities tied to these networks
        if (args.cascade) {
            const { setAgents, setChannels, setGroups, agents, channels, groups } = context.workspace;

            const agentsBefore = agents.length;
            setAgents((prev: any[]) => prev.filter((a: any) => !targetIds.includes(a.networkId)));
            totalRemoved.agents = agentsBefore - agents.filter((a: any) => !targetIds.includes(a.networkId)).length;

            const channelsBefore = channels.length;
            setChannels((prev: any[]) => prev.filter((c: any) => !targetIds.includes(c.networkId)));
            totalRemoved.channels = channelsBefore - channels.filter((c: any) => !targetIds.includes(c.networkId)).length;

            const groupsBefore = groups.length;
            setGroups((prev: any[]) => prev.filter((g: any) => !targetIds.includes(g.networkId)));
            totalRemoved.groups = groupsBefore - groups.filter((g: any) => !targetIds.includes(g.networkId)).length;
        }

        const summary = Object.entries(totalRemoved)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => `${v} ${k}`)
            .join(", ");

        context.workspace.addLog(`Networks destroyed: ${summary}`);
        return { success: true, removed: totalRemoved };
    }
};

export const deleteEcosystemCommand: CommandDefinition = {
    id: "delete_ecosystem",
    description: "Remove a network from the ecosystem (alias for destroy_network without cascade).",
    tags: ["ecosystem", "delete"],
    rbac: ["orchestrator"],
    hidden: true,
    args: {
        id: {
            name: "id",
            type: "network",
            description: "ID of the network to remove",
            required: true
        }
    },
    output: "Confirmation of deletion.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" } } },
    execute: async (args, context: CommandContext) => {
        const { setEcosystems, setBridges } = context.ecosystem;
        const id = args.id;

        setEcosystems((prev: any[]) => prev.filter((n: any) => n.id !== id));
        // Also remove bridges that reference this network
        setBridges((prev: any[]) => prev.filter((b: any) => b.fromNetworkId !== id && b.toNetworkId !== id));

        context.workspace.addLog("Network removed from ecosystem");
        return { success: true };
    }
};
