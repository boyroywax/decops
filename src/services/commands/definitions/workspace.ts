import { CommandDefinition } from "../types";

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
            type: "string", // We don't have a "workspace" type yet, string ID is fine
            description: "ID of the workspace to switch to",
            required: true
        }
    },
    output: "Confirmation message",
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
            type: "string",
            description: "ID of the workspace to delete",
            required: true
        }
    },
    output: "Confirmation message",
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
            type: "string",
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
    execute: async (args, context) => {
        if (!context.workspaceManager) throw new Error("Workspace Manager not available");
        // We need to cast or extend the type definition in next steps, for now assume duplicate exists
        const id = await (context.workspaceManager as any).duplicate(args.sourceId, args.name);
        context.workspace.addLog(`Duplicated workspace ${args.sourceId} to new workspace ${id}`);
        return id;
    }
};
