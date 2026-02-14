
import type { CommandDefinition, CommandContext } from "../types";

export const exportFullBackupCommand: CommandDefinition = {
    id: "export_full_backup",
    description: "Export the entire application state (workspace and ecosystem) as a JSON backup.",
    tags: ["data", "export", "backup"],
    rbac: ["orchestrator"],
    args: {},
    output: "A complete JSON backup of the system.",
    outputSchema: {
        type: "object",
        properties: {
            version: { type: "string" },
            type: { type: "string", const: "full-backup" },
            data: { type: "object" }
        }
    },
    execute: async (args, context: CommandContext) => {
        const { agents, channels, groups, messages } = context.workspace;
        const { ecosystems, bridges } = context.ecosystem;

        const data = {
            version: "1.0",
            type: "full-backup",
            exportedAt: new Date().toISOString(),
            data: {
                workspace: { agents, channels, groups, messages },
                ecosystem: { ecosystems, bridges },
            },
        };
        return data;
    }
};

export const exportWorkspaceCommand: CommandDefinition = {
    id: "export_workspace",
    description: "Export the active workspace configuration (agents, channels, groups, messages).",
    tags: ["data", "export", "workspace"],
    rbac: ["orchestrator", "curator"],
    args: {},
    output: "JSON export of the current workspace.",
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

        const data = {
            version: "1.0",
            type: "workspace",
            exportedAt: new Date().toISOString(),
            data: { agents, channels, groups, messages },
        };
        return data;
    }
};

export const exportEcosystemCommand: CommandDefinition = {
    id: "export_ecosystem",
    description: "Export all saved ecosystems and bridges.",
    tags: ["data", "export", "ecosystem"],
    rbac: ["orchestrator", "curator"],
    args: {},
    output: "JSON export of saved ecosystems.",
    outputSchema: {
        type: "object",
        properties: {
            version: { type: "string" },
            type: { type: "string", const: "ecosystem" },
            data: { type: "object" }
        }
    },
    execute: async (args, context: CommandContext) => {
        const { ecosystems, bridges } = context.ecosystem;

        const data = {
            version: "1.0",
            type: "ecosystem",
            exportedAt: new Date().toISOString(),
            data: { ecosystems, bridges },
        };
        return data;
    }
};

export const exportDataCommand: CommandDefinition = {
    id: "export_data",
    description: "Export a specific entity by ID and Type.",
    tags: ["data", "export", "query"],
    rbac: ["researcher", "builder", "curator", "orchestrator"],
    args: {
        type: {
            name: "type",
            type: "string",
            description: "Type of entity: agent, channel, group, message, ecosystem, bridge",
            required: true
        },
        id: {
            name: "id",
            type: "string",
            description: "ID of the entity to export",
            required: true
        }
    },
    output: "JSON representation of the requested entity.",
    outputSchema: { type: "object" },
    execute: async (args, context: CommandContext) => {
        const { agents, channels, groups, messages } = context.workspace;
        const { ecosystems, bridges } = context.ecosystem;
        const { type, id } = args;

        let result = null;

        switch (type) {
            case "agent":
                result = agents.find((a: any) => a.id === id);
                break;
            case "channel":
                result = channels.find((c: any) => c.id === id);
                break;
            case "group":
                result = groups.find((g: any) => g.id === id);
                break;
            case "message":
                result = messages.find((m: any) => m.id === id);
                break;
            case "ecosystem":
                result = ecosystems.find((e: any) => e.id === id);
                break;
            case "bridge":
                result = bridges.find((b: any) => b.id === id);
                break;
            default:
                throw new Error(`Unknown entity type: ${type}`);
        }

        if (!result) {
            throw new Error(`${type} with ID ${id} not found.`);
        }

        return result;
    }
};
