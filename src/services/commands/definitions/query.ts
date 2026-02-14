
import type { CommandDefinition, CommandContext } from "../types";

export const listAgentsCommand: CommandDefinition = {
    id: "list_agents",
    description: "List all active agents in the workspace.",
    tags: ["query", "agent"],
    rbac: ["researcher", "builder", "curator", "orchestrator"],
    args: {},
    output: "List of active agents.",
    outputSchema: { type: "object", properties: { agents: { type: "array" } } },
    execute: async (args, context: CommandContext) => {
        return { agents: context.workspace.agents };
    }
};

export const listGroupsCommand: CommandDefinition = {
    id: "list_groups",
    description: "List all agent groups.",
    tags: ["query", "group"],
    rbac: ["researcher", "builder", "curator", "orchestrator"],
    args: {},
    output: "List of groups.",
    outputSchema: { type: "object", properties: { groups: { type: "array" } } },
    execute: async (args, context: CommandContext) => {
        return { groups: context.workspace.groups };
    }
};

export const listChannelsCommand: CommandDefinition = {
    id: "list_channels",
    description: "List all communication channels.",
    tags: ["query", "channel"],
    rbac: ["researcher", "builder", "curator", "orchestrator"],
    args: {},
    output: "List of channels.",
    outputSchema: { type: "object", properties: { channels: { type: "array" } } },
    execute: async (args, context: CommandContext) => {
        return { channels: context.workspace.channels };
    }
};

export const listMessagesCommand: CommandDefinition = {
    id: "list_messages",
    description: "List recent messages.",
    tags: ["query", "message"],
    rbac: ["researcher", "builder", "curator", "orchestrator"],
    args: {
        limit: { name: "limit", type: "number", description: "Max messages to return", required: false, defaultValue: 50 }
    },
    output: "List of recent messages.",
    outputSchema: { type: "object", properties: { messages: { type: "array" } } },
    execute: async (args, context: CommandContext) => {
        const limit = args.limit || 50;
        return { messages: context.workspace.messages.slice(-limit) };
    }
};
