import type { CommandDefinition, CommandContext } from "@/services/commands/types";

export const createWorkspaceCommand: CommandDefinition = {
    id: "create_workspace",
    description: "Create a new workspace",
    tags: ["workspace", "system"],
    rbac: ["orchestrator"],
    args: {
        name: {
            name: "name",
            type: "string",
            description: "Name of the new workspace",
            required: true
        },
        description: {
            name: "description",
            type: "string",
            description: "Description of the workspace",
            required: false
        }
    },
    output: "The ID of the created workspace",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        if (!context.workspaceManager) throw new Error("Workspace Manager not available");
        const id = await context.workspaceManager.create(args.name, args.description);
        context.workspace.addLog(`Created workspace: ${args.name}`);
        return id;
    }
};

export const switchWorkspaceCommand: CommandDefinition = {
    id: "switch_workspace",
    description: "Switch to a different workspace",
    tags: ["workspace", "system"],
    rbac: ["orchestrator"],
    args: {
        id: {
            name: "id",
            type: "workspace",
            description: "ID of the workspace to switch to",
            required: true
        }
    },
    output: "Confirmation message",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        if (!context.workspaceManager) throw new Error("Workspace Manager not available");
        await context.workspaceManager.switch(args.id);
        return `Switched to workspace ${args.id}`;
    }
};

export const deleteWorkspaceCommand: CommandDefinition = {
    id: "delete_workspace",
    description: "Delete a workspace",
    tags: ["workspace", "system"],
    rbac: ["orchestrator"],
    args: {
        id: {
            name: "id",
            type: "workspace",
            description: "ID of the workspace to delete",
            required: true
        }
    },
    output: "Confirmation message",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        if (!context.workspaceManager) throw new Error("Workspace Manager not available");
        await context.workspaceManager.delete(args.id);
        context.workspace.addLog(`Deleted workspace: ${args.id}`);
        return `Deleted workspace ${args.id}`;
    }
};

export const duplicateWorkspaceCommand: CommandDefinition = {
    id: "duplicate_workspace",
    description: "Duplicate an existing workspace",
    tags: ["workspace", "system"],
    rbac: ["orchestrator"],
    args: {
        sourceId: {
            name: "sourceId",
            type: "workspace",
            description: "ID of the workspace to duplicate",
            required: true
        },
        name: {
            name: "name",
            type: "string",
            description: "Name for the new workspace (optional)",
            required: false
        }
    },
    output: "The ID of the new workspace",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        if (!context.workspaceManager) throw new Error("Workspace Manager not available");
        // We need to cast or extend the type definition in next steps, for now assume duplicate exists
        const id = await context.workspaceManager.duplicate(args.sourceId as string, args.name as string | undefined);
        context.workspace.addLog(`Duplicated workspace ${args.sourceId} to new workspace ${id}`);
        return id;
    }
};

export const editWorkspaceCommand: CommandDefinition = {
    id: "edit_workspace",
    description: "Update the title or description of the current workspace",
    tags: ["workspace", "system"],
    rbac: ["orchestrator"],
    args: {
        title: {
            name: "title",
            type: "string",
            description: "New title for the workspace",
            required: false
        },
        description: {
            name: "description",
            type: "string",
            description: "New description for the workspace",
            required: false
        }
    },
    output: "Confirmation message",
    outputSchema: { type: "object", additionalProperties: true },
    execute: async (args, context) => {
        if (!args.title && !args.description) throw new Error("Provide at least one of title or description to update");
        if (!context.workspaceManager) throw new Error("Workspace Manager not available");
        const updates: string[] = [];
        if (args.title) updates.push(`title → "${args.title}"`);
        if (args.description) updates.push(`description → "${args.description}"`);
        if (!context.workspaceManager.edit) throw new Error("Workspace Manager does not support edit");
        await context.workspaceManager.edit(args.title as string | undefined, args.description as string | undefined);
        context.workspace.addLog(`Edited workspace: ${updates.join(", ")}`);
        return `Workspace updated: ${updates.join(", ")}`;
    }
};

export const exportWorkspaceCommand: CommandDefinition = {
    id: "export_workspace",
    description: "Export the workspace ecosystem (agents, channels, groups, messages, networks, bridges) as JSON.",
    tags: ["workspace", "export", "data"],
    rbac: ["orchestrator", "curator"],
    args: {},
    output: "JSON export of the workspace ecosystem.",
    outputSchema: {
        type: "object",
        properties: {
            version: { type: "string" },
            type: { type: "string", const: "workspace" },
            data: { type: "object" }
        }
    },
    execute: async (args, context: CommandContext) => {
        const { agents, channels, groups, messages } = context.workspace;
        const { networks, bridges } = context.ecosystem;

        const data = {
            version: "1.0",
            type: "workspace",
            exportedAt: new Date().toISOString(),
            data: { agents, channels, groups, messages, networks, bridges },
        };

        // Produce deliverable
        context.addDeliverable({
            key: 'workspace-export',
            name: `Workspace Export ${new Date().toISOString().slice(0, 10)}`,
            type: 'json',
            content: JSON.stringify(data, null, 2),
        });
        context.storage.lastExport = data;

        return data;
    }
};
