
import type { CommandDefinition, CommandContext } from "../types";

export const deleteAgentCommand: CommandDefinition = {
    id: "delete_agent",
    description: "Remove an agent from the workspace.",
    tags: ["modification", "agent", "delete"],
    rbac: ["orchestrator", "curator"],
    args: {
        id: { name: "id", type: "agent", description: "Agent ID", required: true },
        ids: { name: "ids", type: "array", description: "Batch mode: array of agent IDs to delete. Overrides single id.", required: false }
    },
    output: "Confirmation of deletion.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" } } },
    execute: async (args, context: CommandContext) => {
        const targetIds = args.ids
            ? (Array.isArray(args.ids) ? args.ids : [args.ids])
            : [args.id];

        const { agents, setAgents, setChannels, setGroups, addLog } = context.workspace;
        const idSet = new Set(targetIds);

        // Validate all targets exist
        for (const id of targetIds) {
            if (!agents.find((a: any) => a.id === id)) throw new Error(`Agent ${id} not found`);
        }

        setAgents((prev: any[]) => prev.filter((a: any) => !idSet.has(a.id)));
        setChannels((prev: any[]) => prev.filter((c: any) => !idSet.has(c.from) && !idSet.has(c.to)));
        setGroups((prev: any[]) => prev.map((g: any) => ({ ...g, members: g.members.filter((m: any) => !idSet.has(m)) })));

        addLog(`Deleted ${targetIds.length} agent(s) via command`);
        return { success: true, deleted: targetIds.length };
    }
};

export const deleteChannelCommand: CommandDefinition = {
    id: "delete_channel",
    description: "Remove a communication channel.",
    tags: ["modification", "channel", "delete"],
    rbac: ["orchestrator", "curator"],
    args: {
        id: { name: "id", type: "channel", description: "Channel ID", required: true },
        ids: { name: "ids", type: "array", description: "Batch mode: array of channel IDs to delete. Overrides single id.", required: false }
    },
    output: "Confirmation of deletion.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" } } },
    execute: async (args, context: CommandContext) => {
        const targetIds = args.ids
            ? (Array.isArray(args.ids) ? args.ids : [args.ids])
            : [args.id];
        const idSet = new Set(targetIds);

        context.workspace.setChannels((prev: any[]) => prev.filter((c: any) => !idSet.has(c.id)));
        context.workspace.addLog(`Dissolved ${targetIds.length} channel(s) via command`);
        return { success: true, deleted: targetIds.length };
    }
};

export const deleteGroupCommand: CommandDefinition = {
    id: "delete_group",
    description: "Dissolve an agent group.",
    tags: ["modification", "group", "delete"],
    rbac: ["orchestrator", "curator"],
    args: {
        id: { name: "id", type: "group", description: "Group ID", required: true },
        ids: { name: "ids", type: "array", description: "Batch mode: array of group IDs to dissolve. Overrides single id.", required: false }
    },
    output: "Confirmation of deletion.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" } } },
    execute: async (args, context: CommandContext) => {
        const targetIds = args.ids
            ? (Array.isArray(args.ids) ? args.ids : [args.ids])
            : [args.id];
        const idSet = new Set(targetIds);

        context.workspace.setGroups((prev: any[]) => prev.filter((g: any) => !idSet.has(g.id)));
        context.workspace.addLog(`Dissolved ${targetIds.length} group(s) via command`);
        return { success: true, deleted: targetIds.length };
    }
};

export const editChannelCommand: CommandDefinition = {
    id: "edit_channel",
    description: "Edit channel properties (e.g. type).",
    tags: ["modification", "channel", "edit"],
    rbac: ["orchestrator", "builder"],
    args: {
        id: { name: "id", type: "channel", description: "Channel ID", required: true },
        type: { name: "type", type: "string", description: "New Type: data, task, consensus", required: true },
        items: { name: "items", type: "array", description: "Batch mode: array of {id, type} specs. Overrides individual args.", required: false }
    },
    output: "Confirmation of update.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" } } },
    execute: async (args, context: CommandContext) => {
        const specs = args.items
            ? (Array.isArray(args.items) ? args.items : [args.items])
            : [{ id: args.id, type: args.type }];

        const idTypeMap = new Map(specs.map((s: any) => [s.id, s.type]));
        context.workspace.setChannels((prev: any[]) => prev.map((c: any) =>
            idTypeMap.has(c.id) ? { ...c, type: idTypeMap.get(c.id) } : c
        ));
        context.workspace.addLog(`Updated ${specs.length} channel(s)`);
        return { success: true, updated: specs.length };
    }
};

// New: Edit Agent Prompt
export const updateAgentPromptCommand: CommandDefinition = {
    id: "update_agent_prompt",
    description: "Update an agent's system prompt.",
    tags: ["modification", "agent", "edit"],
    rbac: ["orchestrator", "builder"],
    args: {
        id: { name: "id", type: "agent", description: "Agent ID", required: true },
        prompt: { name: "prompt", type: "string", description: "New Prompt", required: true },
        items: { name: "items", type: "array", description: "Batch mode: array of {id, prompt} specs. Overrides individual args.", required: false }
    },
    output: "Confirmation",
    execute: async (args, context: CommandContext) => {
        const specs = args.items
            ? (Array.isArray(args.items) ? args.items : [args.items])
            : [{ id: args.id, prompt: args.prompt }];

        const idPromptMap = new Map(specs.map((s: any) => [s.id, s.prompt]));
        const { setAgents, addLog } = context.workspace;
        setAgents((prev: any[]) => prev.map((a: any) =>
            idPromptMap.has(a.id) ? { ...a, prompt: idPromptMap.get(a.id) } : a
        ));
        addLog(`Prompt updated for ${specs.length} agent(s)`);
        return { success: true, updated: specs.length };
    }
};

// New: Toggle Group Member
export const toggleGroupMemberCommand: CommandDefinition = {
    id: "toggle_group_member",
    description: "Add or remove an agent from a group.",
    tags: ["modification", "group", "edit"],
    rbac: ["orchestrator"],
    args: {
        group_id: { name: "group_id", type: "group", description: "Group ID", required: true },
        agent_id: { name: "agent_id", type: "agent", description: "Agent ID", required: true },
        items: { name: "items", type: "array", description: "Batch mode: array of {group_id, agent_id} specs. Overrides individual args.", required: false }
    },
    output: "Confirmation",
    execute: async (args, context: CommandContext) => {
        const specs = args.items
            ? (Array.isArray(args.items) ? args.items : [args.items])
            : [{ group_id: args.group_id, agent_id: args.agent_id }];

        const { setGroups, addLog } = context.workspace;

        setGroups((prev: any[]) => {
            let updated = [...prev];
            for (const spec of specs) {
                updated = updated.map((g: any) => {
                    if (g.id !== spec.group_id) return g;
                    const hasMember = g.members.includes(spec.agent_id);
                    return {
                        ...g,
                        members: hasMember
                            ? g.members.filter((m: any) => m !== spec.agent_id)
                            : [...g.members, spec.agent_id]
                    };
                });
            }
            return updated;
        });
        addLog(`Group membership updated (${specs.length} operation(s))`);
        return { success: true, updated: specs.length };
    }
};
