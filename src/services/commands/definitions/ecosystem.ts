
import type { CommandDefinition, CommandContext } from "@/services/commands/types";
import type { RoleId, Agent, Channel, Group, Message, Network, Bridge } from "@/types";
import { generateNetworkDID } from "@/utils/identity";
import { generateMeshConfig } from "@/services/ai";
import { ROLES, CHANNEL_TYPES, GOVERNANCE_MODELS, GROUP_COLORS, NETWORK_COLORS } from "@/constants";
import { generateDID, generateKeyPair, generateGroupDID } from "@/utils/identity";
import { createAieosEntity } from "@/utils/aieos";
import { slugifyStorageKey } from "@/utils/storageKey";

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
            const existingNetworks = context.ecosystem.networks || [];
            const created: Network[] = [];

            for (let i = 0; i < specs.length; i++) {
                const spec = specs[i] as { name: string; description?: string };
                const netId = crypto.randomUUID();
                const cIdx = (existingNetworks.length + i) % (NETWORK_COLORS?.length || 6);
                const clr = NETWORK_COLORS?.[cIdx] || "#00e5a0";

                const net: Network = {
                    id: netId,
                    name: spec.name,
                    description: spec.description || "",
                    did: generateNetworkDID(),
                    color: clr,
                    agents: [], channels: [], groups: [], messages: [],
                    createdAt: new Date().toISOString(),
                };

                created.push(net);
                context.storage.lastNetworkId = netId;
                context.storage[`network_${spec.name}`] = netId;
                context.storage[`network_${slugifyStorageKey(spec.name)}`] = netId;
            }

            context.ecosystem.setNetworks((prev: Network[]) => [...prev, ...created]);
            context.storage._networks = [...(context.storage._networks || []), ...created];
            context.workspace.addLog(`Created ${created.length} network(s): ${created.map((n) => n.name).join(", ")}`);

            // Auto-activate the last created network
            if (created.length > 0 && context.ecosystem.setActiveNetworkId) {
                context.ecosystem.setActiveNetworkId(created[created.length - 1].id);
            }

            return { success: true, results: created.map((n) => ({ networkId: n.id, name: n.name })) };
        }

        // Single mode
        const networkId = crypto.randomUUID();
        const existingNetworks = context.ecosystem.networks || [];
        const colorIdx = existingNetworks.length % (NETWORK_COLORS?.length || 6);
        const color = NETWORK_COLORS?.[colorIdx] || "#00e5a0";

        let agents: Agent[] = [];
        let channels: Channel[] = [];
        let groups: Group[] = [];
        let messages: Message[] = [];

        // If architectPrompt is provided, generate the network contents via AI
        if (args.architectPrompt) {
            context.workspace.addLog(`Architect generating network "${args.name}"...`);
            try {
                const config = await generateMeshConfig(args.architectPrompt);

                // Create agents
                for (const a of (config.agents || [])) {
                    if (!a || !a.name) continue;
                    const validRole = (ROLES.find((r) => r.id === a.role) ? a.role : "researcher") as RoleId;
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
                    const validType = (CHANNEL_TYPES.find((t) => t.id === c.type) ? c.type : "data") as Channel["type"];
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
                    const validGov = (GOVERNANCE_MODELS.find((m) => m.id === g.governance) ? g.governance : "majority") as Group["governance"];
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
                if (agents.length > 0) context.workspace.setAgents((prev: Agent[]) => [...prev, ...agents]);
                if (channels.length > 0) context.workspace.setChannels((prev: Channel[]) => [...prev, ...channels]);
                if (groups.length > 0) context.workspace.setGroups((prev: Group[]) => [...prev, ...groups]);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                context.workspace.addLog(`Architect failed: ${msg}. Creating empty network.`);
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

        context.ecosystem.setNetworks((prev: Network[]) => [...prev, net]);
        context.workspace.addLog(`Network "${args.name}" created in ecosystem.`);

        // Auto-activate the newly created network so subsequent entity creation inherits it
        if (context.ecosystem.setActiveNetworkId) {
            context.ecosystem.setActiveNetworkId(networkId);
        }

        // Write to shared storage for downstream steps
        context.storage.lastNetworkId = networkId;
        context.storage[`network_${args.name}`] = networkId;
        context.storage[`network_${slugifyStorageKey(args.name)}`] = networkId;

        // Accumulate entities so downstream steps can look them up
        // (React state may be stale within the same job execution cycle)
        context.storage._networks = [...(context.storage._networks || []), net];
        if (agents.length > 0) {
            context.storage._agents = [...(context.storage._agents || []), ...agents];
            // Also set per-agent storage keys for name→id resolution
            for (const a of agents) {
                context.storage[`agent_${a.name}`] = a.id;
                context.storage[`agent_${slugifyStorageKey(a.name)}`] = a.id;
            }
        }
        if (channels.length > 0) {
            context.storage._channels = [...(context.storage._channels || []), ...channels];
        }

        return { success: true, network: net };
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
        const list = context.ecosystem.networks.map((n: Network) => ({
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
            const results: Network[] = [];

            context.ecosystem.setNetworks((prev: Network[]) => {
                const updated = [...prev];
                for (const spec of specs) {
                    const idx = updated.findIndex((n) => n.id === spec.id);
                    if (idx === -1) throw new Error(`Network ${spec.id} not found`);
                    const changes: Partial<Network> = {};
                    if (spec.name !== undefined && spec.name !== "") changes.name = spec.name;
                    if (spec.description !== undefined) changes.description = spec.description;
                    if (spec.color !== undefined && spec.color !== "") changes.color = spec.color;
                    updated[idx] = { ...updated[idx], ...changes };
                    results.push(updated[idx]);
                }
                return updated;
            });

            context.workspace.addLog(`Updated ${results.length} network(s)`);
            return { success: true, results: results.map((n) => ({ networkId: n.id, name: n.name })) };
        }

        // Single mode
        const id = args.id;
        const existing = context.ecosystem.networks.find((n: Network) => n.id === id);
        if (!existing) throw new Error("Network not found in ecosystem");

        const updates: Partial<Network> = {};
        if (args.name !== undefined && args.name !== "") updates.name = args.name;
        if (args.description !== undefined) updates.description = args.description;
        if (args.color !== undefined && args.color !== "") updates.color = args.color;

        if (Object.keys(updates).length === 0) {
            throw new Error("No update fields provided. Specify at least one of: name, description, color.");
        }

        let updatedNet: Network | null = null;
        context.ecosystem.setNetworks((prev: Network[]) =>
            prev.map((n) => {
                if (n.id === id) {
                    updatedNet = { ...n, ...updates };
                    return updatedNet;
                }
                return n;
            })
        );

        context.workspace.addLog(`Network "${(updatedNet as Network | null)?.name || id}" updated: ${Object.keys(updates).join(", ")}`);
        context.storage.lastNetworkId = id;
        return { success: true, network: updatedNet || { ...existing, ...updates } };
    }
};

export const destroyNetworkCommand: CommandDefinition = {
    id: "destroy_network",
    description: "Destroy one or more networks, removing them from the workspace along with their bridges. To delete a single network pass `id`. To delete several (or all) networks in one call pass `ids` with the array of network IDs — first call list_networks to enumerate them, then pass every ID in `ids`. Use `cascade: true` to also remove agents, channels, and groups belonging to the network(s).",
    tags: ["ecosystem", "network", "destroy", "delete"],
    rbac: ["orchestrator"],
    args: {
        id: {
            name: "id",
            type: "network",
            description: "ID of the network to destroy. Either `id` (single) or `ids` (batch) must be provided.",
            required: false
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
            description: "Batch mode: array of network IDs to destroy. Use this to remove multiple (or all) networks in one call. Either `id` (single) or `ids` (batch) must be provided.",
            required: false,
        }
    },
    output: "Summary of what was destroyed.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" }, removed: { type: "object" } } },
    execute: async (args, context: CommandContext) => {
        const targetIds = args.ids
            ? (Array.isArray(args.ids) ? args.ids : [args.ids])
            : (args.id ? [args.id] : []);
        if (targetIds.length === 0) {
            throw new Error("destroy_network requires either `id` (single network ID) or `ids` (array of network IDs).");
        }

        const { setNetworks, setBridges, networks } = context.ecosystem;
        const totalRemoved: Record<string, number> = { networks: 0, bridges: 0 };

        for (const id of targetIds) {
            const net = networks.find((n: Network) => n.id === id);
            if (!net) throw new Error(`Network ${id} not found in ecosystem`);
            totalRemoved.networks++;
        }

        // Remove all targeted networks
        setNetworks((prev: Network[]) => prev.filter((n) => !targetIds.includes(n.id)));

        // Remove bridges referencing any targeted network
        setBridges((prev: Bridge[]) => {
            const before = prev.length;
            const after = prev.filter((b) => !targetIds.includes(b.fromNetworkId) && !targetIds.includes(b.toNetworkId));
            totalRemoved.bridges = before - after.length;
            return after;
        });

        // Cascade: remove workspace-level entities tied to these networks
        if (args.cascade) {
            const { setAgents, setChannels, setGroups, setMessages, agents, channels, groups } = context.workspace;

            // Compute the set of agent IDs that belong to the destroyed networks
            // so we can also cascade channels/messages that reference these
            // agents directly (covers older entities that lack networkId).
            const cascadedAgentIds = new Set(
                agents.filter((a) => a.networkId !== undefined && targetIds.includes(a.networkId)).map((a) => a.id)
            );

            const agentsBefore = agents.length;
            setAgents((prev: Agent[]) => prev.filter((a) => a.networkId === undefined || !targetIds.includes(a.networkId)));
            totalRemoved.agents = agentsBefore - agents.filter((a) => a.networkId === undefined || !targetIds.includes(a.networkId)).length;

            const channelsBefore = channels.length;
            const channelSurvivor = (c: Channel) =>
                (c.networkId === undefined || !targetIds.includes(c.networkId))
                && !cascadedAgentIds.has(c.from)
                && !cascadedAgentIds.has(c.to);
            setChannels((prev: Channel[]) => prev.filter(channelSurvivor));
            totalRemoved.channels = channelsBefore - channels.filter(channelSurvivor).length;

            const groupsBefore = groups.length;
            setGroups((prev: Group[]) => prev.filter((g) => g.networkId === undefined || !targetIds.includes(g.networkId)));
            totalRemoved.groups = groupsBefore - groups.filter((g) => g.networkId === undefined || !targetIds.includes(g.networkId)).length;

            // Remove messages whose sender/recipient was cascaded
            if (setMessages && cascadedAgentIds.size > 0) {
                setMessages((prev: Message[]) => prev.filter((m) =>
                    !cascadedAgentIds.has(m.fromId) && !cascadedAgentIds.has(m.toId)
                ));
            }
        }

        const summary = Object.entries(totalRemoved)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => `${v} ${k}`)
            .join(", ");

        context.workspace.addLog(`Networks destroyed: ${summary}`);
        return { success: true, removed: totalRemoved };
    }
};


