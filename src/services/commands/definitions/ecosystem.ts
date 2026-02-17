
import type { CommandDefinition, CommandContext } from "../types";
import { generateNetworkDID } from "../../../utils/identity";
import { generateMeshConfig } from "../../ai";
import { ROLES, CHANNEL_TYPES, GOVERNANCE_MODELS, GROUP_COLORS, NETWORK_COLORS } from "../../../constants";
import { generateDID, generateKeyPair, generateGroupDID } from "../../../utils/identity";

export const createNetworkCommand: CommandDefinition = {
    id: "create_network",
    description: "Create a new network in the ecosystem, optionally populated via the AI Architect.",
    tags: ["ecosystem", "network", "create"],
    rbac: ["orchestrator", "builder"],
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
        }
    },
    output: "The created network object.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" }, network: { type: "object" } } },
    execute: async (args, context: CommandContext) => {
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
                    const validRole = ROLES.find((r: any) => r.id === a.role) ? a.role : "researcher";
                    agents.push({
                        id: crypto.randomUUID(), name: a.name, role: validRole,
                        prompt: a.prompt || "", did: generateDID(), keys: generateKeyPair(),
                        createdAt: new Date().toISOString(), status: "active",
                        networkId,
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
        return { success: true, network: net };
    }
};

export const saveEcosystemCommand: CommandDefinition = {
    id: "save_ecosystem",
    description: "Save the current agent, channel, and group configuration as a named network within the ecosystem.",
    tags: ["ecosystem", "save"],
    rbac: ["orchestrator", "curator"],
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
    description: "Load a network configuration from the ecosystem into the active workspace.",
    tags: ["ecosystem", "load"],
    rbac: ["orchestrator", "curator"],
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
    description: "List all networks in the ecosystem.",
    tags: ["ecosystem", "query"],
    rbac: ["researcher", "builder", "curator", "orchestrator"],
    args: {},
    output: "List of all networks in the ecosystem.",
    outputSchema: { type: "object", properties: { ecosystems: { type: "array", items: { type: "object" } } } },
    execute: async (args, context: CommandContext) => {
        const list = context.ecosystem.ecosystems.map((e: any) => ({
            id: e.id,
            name: e.name,
            agentCount: e.agents?.length || 0,
            channelCount: e.channels?.length || 0,
            groupCount: e.groups?.length || 0,
        }));
        return { ecosystems: list };
    }
};

export const deleteEcosystemCommand: CommandDefinition = {
    id: "delete_ecosystem",
    description: "Remove a network from the ecosystem.",
    tags: ["ecosystem", "delete"],
    rbac: ["orchestrator"],
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
