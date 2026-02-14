
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
            description: "Type: markdown, json, yaml, code",
            required: true,
            defaultValue: "markdown"
        },
        content: {
            name: "content",
            type: "string",
            description: "The text content of the artifact",
            required: true
        }
    },
    output: "Details of the created artifact.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" }, artifact: { type: "object" } } },
    execute: async (args, context: CommandContext) => {
        const artifact = {
            id: `art-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            name: args.name,
            type: args.type,
            content: args.content
        };
        context.jobs.importArtifact(artifact);
        context.workspace.addLog(`Artifact created: ${args.name}`);
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
        // This is a bit tricky because centralized 'edit' isn't explicitly in useJobs context yet,
        // but we can simulate it by removing and re-adding or implementing a rigorous update.
        // For now, we'll try to find it in "allArtifacts" and update it if possible.
        // Note: The current useJobs hook doesn't expose a direct 'updateArtifact' method for standalone artifacts easily
        // without some refactoring. We'll implement a simple "replace" logic here using remove+import (not atomic, but works).

        const existing = context.jobs.allArtifacts.find((a: any) => a.id === args.id);
        if (!existing) {
            throw new Error(`Artifact ${args.id} not found.`);
        }

        context.jobs.removeArtifact(args.id);

        const updated = { ...existing, content: args.content };
        context.jobs.importArtifact(updated);

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
