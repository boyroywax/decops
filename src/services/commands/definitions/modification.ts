
import type { CommandDefinition, CommandContext } from "../types";

export const deleteAgentCommand: CommandDefinition = {
    id: "delete_agent",
    description: "Remove an agent from the workspace.",
    tags: ["modification", "agent", "delete"],
    rbac: ["orchestrator", "curator"],
    args: {
        id: { name: "id", type: "string", description: "Agent ID", required: true }
    },
    output: "Confirmation of deletion.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" } } },
    execute: async (args, context: CommandContext) => {
        // We don't have a direct 'removeAgent' exposed via command context 'workspace' property easily typed yet?
        // Actually we do: workspace.setAgents, workspace.setChannels etc. 
        // But referencing the hook logic (removeAgent) would be cleaner. 
        // We'll reimplement the logic carefully or assume the context passed has helpers?
        // The App.tsx passes `...workspace` which includes `removeAgent`! 
        // We just need to ensure the type definition includes it. 
        // We'll cast context.workspace to any for simplicity if types aren't perfect yet.

        (context.workspace as any).removeAgent(args.id);
        return { success: true };
    }
};

export const deleteChannelCommand: CommandDefinition = {
    id: "delete_channel",
    description: "Remove a communication channel.",
    tags: ["modification", "channel", "delete"],
    rbac: ["orchestrator", "curator"],
    args: {
        id: { name: "id", type: "string", description: "Channel ID", required: true }
    },
    output: "Confirmation of deletion.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" } } },
    execute: async (args, context: CommandContext) => {
        (context.workspace as any).removeChannel(args.id);
        return { success: true };
    }
};

export const deleteGroupCommand: CommandDefinition = {
    id: "delete_group",
    description: "Dissolve an agent group.",
    tags: ["modification", "group", "delete"],
    rbac: ["orchestrator", "curator"],
    args: {
        id: { name: "id", type: "string", description: "Group ID", required: true }
    },
    output: "Confirmation of deletion.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" } } },
    execute: async (args, context: CommandContext) => {
        (context.workspace as any).removeGroup(args.id);
        return { success: true };
    }
};

export const editChannelCommand: CommandDefinition = {
    id: "edit_channels", // Matches user request plural, though singular is more standard
    description: "Edit channel properties (e.g. type).",
    tags: ["modification", "channel", "edit"],
    rbac: ["orchestrator", "builder"],
    args: {
        id: { name: "id", type: "string", description: "Channel ID", required: true },
        type: { name: "type", type: "string", description: "New Type: data, task, consensus", required: true }
    },
    output: "Confirmation of update.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" } } },
    execute: async (args, context: CommandContext) => {
        context.workspace.setChannels((prev: any[]) => prev.map((c: any) =>
            c.id === args.id ? { ...c, type: args.type } : c
        ));
        context.workspace.addLog(`Channel updated`);
        return { success: true };
    }
};
