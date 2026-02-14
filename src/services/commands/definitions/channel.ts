import { CommandDefinition } from "../types";
import { Channel } from "../../../types";

export const createChannelCommand: CommandDefinition = {
    id: "create_channel",
    description: "Creates a communication channel between two agents",
    tags: ["infrastructure", "channel"],
    rbac: ["orchestrator", "builder"],
    args: {
        from_agent_name: {
            name: "from_agent_name",
            type: "string",
            description: "Name of the first agent",
            required: true,
        },
        to_agent_name: {
            name: "to_agent_name",
            type: "string",
            description: "Name of the second agent",
            required: true,
        },
        type: {
            name: "type",
            type: "string",
            description: "Type of channel (data, control, financial)",
            defaultValue: "data",
        }
    },
    execute: async (args, context) => {
        const { from_agent_name, to_agent_name, type } = args;
        const { agents, channels, setChannels, addLog } = context.workspace;

        const fromAgent = agents.find(a => a.name === from_agent_name);
        const toAgent = agents.find(a => a.name === to_agent_name);

        if (!fromAgent) throw new Error(`Agent '${from_agent_name}' not found`);
        if (!toAgent) throw new Error(`Agent '${to_agent_name}' not found`);
        if (fromAgent.id === toAgent.id) throw new Error("Cannot create channel to self");

        // Check existence
        const exists = channels.some((c) =>
            (c.from === fromAgent.id && c.to === toAgent.id) ||
            (c.from === toAgent.id && c.to === fromAgent.id)
        );

        if (exists) {
            addLog(`Channel between ${from_agent_name} and ${to_agent_name} already exists`);
            // Return existing channel info? Or throw? idempotent is better.
            return { status: "exists", message: "Channel already exists" };
        }

        const newChannel: Channel = {
            id: crypto.randomUUID(),
            from: fromAgent.id,
            to: toAgent.id,
            type: type || "data",
            offset: Math.random() * 100,
            createdAt: new Date().toISOString(),
        };

        setChannels(prev => [...prev, newChannel]);
        addLog(`Channel created: ${from_agent_name} ⟷ ${to_agent_name}`);

        return { status: "created", channelId: newChannel.id };
    },
};
