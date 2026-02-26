
import type { CommandDefinition, CommandContext } from "../types";

export const createArtifactCommand: CommandDefinition = {
    id: "create_artifact",
    description: "Create a new text-based artifact (Markdown, Code, JSON).",
    tags: ["artifact", "content", "create"],
    rbac: ["researcher", "builder", "orchestrator"],
    args: {
        name: {
            name: "name",
            type: "string",
            description: "Name of the artifact (e.g. docs.md)",
            required: true
        },
        type: {
            name: "type",
            type: "string",
            description: "Type: markdown, json, yaml, code, csv, image",
            required: true,
            defaultValue: "markdown"
        },
        content: {
            name: "content",
            type: "string",
            description: "The text content of the artifact",
            required: true
        },
        tags: {
            name: "tags",
            type: "string",
            description: "Comma-separated tags (e.g. source:job,type:report)",
            required: false
        },
        description: {
            name: "description",
            type: "string",
            description: "Short description of the artifact",
            required: false
        }
    },
    output: "Details of the created artifact.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" }, artifact: { type: "object" } } },
    execute: async (args, context: CommandContext) => {
        const tags = args.tags
            ? args.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
            : [];
        tags.push(`type:${args.type}`);

        const artifact = {
            id: `art-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            name: args.name,
            type: args.type,
            content: args.content,
            tags,
            description: args.description || "",
            source: "command" as const,
        };
        context.jobs.importArtifact(artifact);
        context.workspace.addLog(`Artifact created: ${args.name}`);

        // Also register as a deliverable for job tracking
        context.addDeliverable({
            key: args.name.replace(/\s+/g, '-').toLowerCase(),
            name: args.name,
            type: args.type,
            content: args.content,
            tags,
        });

        // Write to shared storage for downstream steps
        context.storage.lastArtifactId = artifact.id;
        context.storage[`artifact_${args.name}`] = artifact.id;

        return { success: true, artifact };
    }
};

export const editArtifactCommand: CommandDefinition = {
    id: "edit_artifact",
    description: "Edit an existing artifact's content.",
    tags: ["artifact", "content", "edit"],
    rbac: ["builder", "orchestrator"],
    args: {
        id: {
            name: "id",
            type: "string",
            description: "ID of the artifact to edit",
            required: true
        },
        content: {
            name: "content",
            type: "string",
            description: "New content",
            required: true
        }
    },
    output: "Details of the updated artifact.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" }, artifact: { type: "object" } } },
    execute: async (args, context: CommandContext) => {
        const existing = context.jobs.allArtifacts.find((a: any) => a.id === args.id);
        if (!existing) {
            throw new Error(`Artifact ${args.id} not found.`);
        }

        context.jobs.updateArtifact(args.id, { content: args.content });

        const updated = { ...existing, content: args.content };
        context.workspace.addLog(`Artifact updated: ${existing.name}`);
        return { success: true, artifact: updated };
    }
};

export const deleteArtifactCommand: CommandDefinition = {
    id: "delete_artifact",
    description: "Permanently remove an artifact.",
    tags: ["artifact", "delete"],
    rbac: ["orchestrator", "curator"],
    args: {
        id: {
            name: "id",
            type: "string",
            description: "ID of the artifact to delete",
            required: true
        }
    },
    output: "Confirmation of deletion.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" } } },
    execute: async (args, context: CommandContext) => {
        context.jobs.removeArtifact(args.id);
        context.workspace.addLog(`Artifact deleted: ${args.id}`);
        return { success: true };
    }
};
