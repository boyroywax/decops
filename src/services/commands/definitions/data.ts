
import type { CommandDefinition, CommandContext } from "@/services/commands/types";

export const exportFullBackupCommand: CommandDefinition = {
    id: "export_full_backup",
    description: "Export the entire workspace ecosystem (agents, channels, groups, messages, networks, bridges) as a JSON backup.",
    tags: ["data", "export", "backup"],
    rbac: ["orchestrator"],
    args: {},
    output: "A complete JSON backup of the workspace ecosystem.",
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
                agents,
                channels,
                groups,
                messages,
                networks: ecosystems,
                bridges,
            },
        };

        // Produce deliverable
        context.addDeliverable({
            key: 'full-backup',
            name: `Full Backup ${new Date().toISOString().slice(0, 10)}`,
            type: 'json',
            content: JSON.stringify(data, null, 2),
        });
        context.storage.lastBackup = data;

        return data;
    }
};

export const exportWorkspaceCommand: CommandDefinition = {
    id: "export_workspace",
    description: "Export the workspace ecosystem (agents, channels, groups, messages, networks, bridges).",
    tags: ["data", "export", "workspace"],
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
        const { ecosystems, bridges } = context.ecosystem;

        const data = {
            version: "1.0",
            type: "workspace",
            exportedAt: new Date().toISOString(),
            data: { agents, channels, groups, messages, networks: ecosystems, bridges },
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

export const exportEcosystemCommand: CommandDefinition = {
    id: "export_ecosystem",
    description: "(Deprecated) Use export_workspace instead. Ecosystem and workspace are now unified.",
    tags: ["data", "export", "ecosystem"],
    rbac: ["orchestrator", "curator"],
    hidden: true,
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

        // Produce deliverable
        context.addDeliverable({
            key: 'ecosystem-export',
            name: `Ecosystem Export ${new Date().toISOString().slice(0, 10)}`,
            type: 'json',
            content: JSON.stringify(data, null, 2),
        });
        context.storage.lastExport = data;

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
            description: "Type of entity: agent, channel, group, message, network, bridge",
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
            case "network":
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
