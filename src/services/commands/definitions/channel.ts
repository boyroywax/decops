import { CommandDefinition } from "../types";
import { Channel } from "../../../types";

export const createChannelCommand: CommandDefinition = {
    id: "create_channel",
    description: "Creates a communication channel between two agents",
    tags: ["infrastructure", "channel"],
    rbac: ["orchestrator", "builder"],
    args: {
        from: {
            name: "from",
            type: "string",
            description: "ID or Name of first agent",
            required: true,
        },
        to: {
            name: "to",
            type: "string",
            description: "ID or Name of second agent",
            required: true,
        },
        type: {
            name: "type",
            type: "string",
            description: "Type of channel (data, control, financial)",
            required: false,
            defaultValue: "data",
        },
        networkId: {
            name: "networkId",
            type: "string",
            description: "ID of the network this channel belongs to",
            required: false,
        }
    },
    output: "JSON object containing the created channel details.",
    outputSchema: {
        type: "object",
        properties: {
            channel: {
                type: "object",
                properties: {
                    id: { type: "string" },
                    from: { type: "string" },
                    to: { type: "string" },
                    type: { type: "string" }
                }
            }
        }
    },
    execute: async (args, context) => {
        const { from, to, type } = args;
        const { agents, channels, setChannels, addLog } = context.workspace;

        const fromAgent = agents.find((a: any) => a.id === from || a.name === from);
        const toAgent = agents.find((a: any) => a.id === to || a.name === to);

        if (!fromAgent) throw new Error(`Agent '${from}' not found`);
        if (!toAgent) throw new Error(`Agent '${to}' not found`);
        if (fromAgent.id === toAgent.id) throw new Error("Cannot create channel to self");

        // Check existence
        const exists = channels.some((c: any) =>
            (c.from === fromAgent.id && c.to === toAgent.id) ||
            (c.from === toAgent.id && c.to === fromAgent.id)
        );

        if (exists) {
            addLog(`Channel between ${fromAgent.name} and ${toAgent.name} already exists`);
            return { status: "exists", message: "Channel already exists" };
        }

        const newChannel: Channel = {
            id: crypto.randomUUID(),
            from: fromAgent.id,
            to: toAgent.id,
            type: type || "data",
            offset: Math.random() * 100,
            createdAt: new Date().toISOString(),
            networkId: args.networkId || context.ecosystem?.activeNetworkId || fromAgent.networkId || undefined,
        };

        setChannels((prev: any[]) => [...prev, newChannel]);
        addLog(`Channel created: ${fromAgent.name} ⟷ ${toAgent.name}`);

        return { status: "created", channelId: newChannel.id };
    },
};
