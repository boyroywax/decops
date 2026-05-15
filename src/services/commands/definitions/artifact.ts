
import type { CommandDefinition, CommandContext } from "@/services/commands/types";

export const createArtifactCommand: CommandDefinition = {
    id: "create_artifact",
    description: "Create a new text-based artifact (Markdown, Code, JSON, Plain Text).",
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
            description: "Type: markdown, json, yaml, code, csv, image, txt",
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
        },
        deliverableKey: {
            name: "deliverableKey",
            type: "string",
            description: "If this artifact fulfills a declared job deliverable, the deliverable key",
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
        if (args.deliverableKey) {
            tags.push(`deliverable:${args.deliverableKey}`);
        }

        const artifact = {
            id: crypto.randomUUID(),
            name: args.name,
            type: args.type,
            content: args.content,
            tags,
            createdAt: Date.now(),
            description: args.description || "",
            source: "command" as const,
        };
        context.jobs.importArtifact(artifact);
        context.workspace.addLog(`Artifact created: ${args.name}`);

        // Write to shared storage for downstream steps
        context.storage.lastArtifactId = artifact.id;
        context.storage[`artifact_${args.name}`] = artifact.id;

        return {
            success: true,
            artifact,
            // Structured reference that agents can embed in messages/results
            ref: `[[artifact:${artifact.id}|${artifact.name}]]`,
        };
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
        const existing = context.jobs.allArtifacts.find((a) => a.id === args.id);
        if (!existing) {
            throw new Error(`Artifact ${args.id} not found.`);
        }

        context.jobs.updateArtifact(args.id, { content: args.content });

        const updated = { ...existing, content: args.content };
        context.workspace.addLog(`Artifact updated: ${existing.name}`);
        return { success: true, artifact: updated };
    }
};

export const tagArtifactCommand: CommandDefinition = {
    id: "tag_artifact",
    description: "Add, remove, or replace tags on an existing artifact.",
    tags: ["artifact", "edit", "tags"],
    rbac: ["researcher", "builder", "orchestrator"],
    args: {
        id: {
            name: "id",
            type: "string",
            description: "ID of the artifact to update",
            required: true
        },
        add: {
            name: "add",
            type: "string",
            description: "Comma-separated tags to add (e.g. 'status:reviewed,priority:high')",
            required: false
        },
        remove: {
            name: "remove",
            type: "string",
            description: "Comma-separated tags to remove",
            required: false
        },
        set: {
            name: "set",
            type: "string",
            description: "Replace all tags with this comma-separated list. Overrides add/remove.",
            required: false
        }
    },
    output: "Updated artifact with new tags.",
    outputSchema: { type: "object", properties: { success: { type: "boolean" }, artifact: { type: "object" } } },
    execute: async (args, context: CommandContext) => {
        const existing = context.jobs.allArtifacts.find((a) => a.id === args.id);
        if (!existing) {
            throw new Error(`Artifact ${args.id} not found.`);
        }

        if (!args.add && !args.remove && !args.set) {
            throw new Error("Provide at least one of: add, remove, or set.");
        }

        let newTags: string[];

        if (args.set) {
            // Full replacement
            newTags = args.set.split(",").map((t: string) => t.trim()).filter(Boolean);
        } else {
            newTags = [...(existing.tags || [])];

            if (args.add) {
                const toAdd = args.add.split(",").map((t: string) => t.trim()).filter(Boolean);
                for (const tag of toAdd) {
                    if (!newTags.includes(tag)) newTags.push(tag);
                }
            }

            if (args.remove) {
                const toRemove = new Set(args.remove.split(",").map((t: string) => t.trim()).filter(Boolean));
                newTags = newTags.filter(t => !toRemove.has(t));
            }
        }

        context.jobs.updateArtifact(args.id, { tags: newTags });

        const updated = { ...existing, tags: newTags };
        context.workspace.addLog(`Artifact tags updated: ${existing.name} → [${newTags.join(", ")}]`);
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

export const listArtifactsCommand: CommandDefinition = {
    id: "list_artifacts",
    description: "List artifacts, optionally filtered by type, source, or tags.",
    tags: ["artifact", "query", "list"],
    rbac: ["researcher", "builder", "orchestrator"],
    args: {
        type: {
            name: "type",
            type: "string",
            description: "Filter by artifact type: markdown, json, yaml, code, csv, image. Omit for all.",
            required: false
        },
        source: {
            name: "source",
            type: "string",
            description: "Filter by source: job, import, command, user. Omit for all.",
            required: false
        },
        tag: {
            name: "tag",
            type: "string",
            description: "Filter by a tag (e.g. 'type:json' or 'agent:alice'). Omit for all.",
            required: false
        },
        limit: {
            name: "limit",
            type: "number",
            description: "Max number of artifacts to return. Defaults to all.",
            required: false
        }
    },
    output: "List of matching artifacts with summary info.",
    outputSchema: {
        type: "object",
        properties: {
            total: { type: "number" },
            returned: { type: "number" },
            artifacts: { type: "array" }
        }
    },
    execute: async (args, context: CommandContext) => {
        let results = [...context.jobs.allArtifacts];

        if (args.type) {
            results = results.filter((a) => a.type === args.type);
        }
        if (args.source) {
            results = results.filter((a) => a.source === args.source);
        }
        if (args.tag) {
            results = results.filter((a) =>
                Array.isArray(a.tags) && a.tags.some((t: string) => t === args.tag)
            );
        }

        // Sort newest first
        results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        const total = results.length;
        if (args.limit && args.limit > 0) {
            results = results.slice(0, args.limit);
        }

        const artifacts = results.map((a) => ({
            id: a.id,
            name: a.name,
            type: a.type,
            source: a.source || "unknown",
            tags: a.tags || [],
            description: a.description || "",
            createdAt: a.createdAt || null,
            contentPreview: typeof a.content === "string" ? a.content.slice(0, 120) : null,
        }));

        context.workspace.addLog(`Listed ${artifacts.length} of ${total} artifacts`);
        return { total, returned: artifacts.length, artifacts };
    }
};

export const searchArtifactsCommand: CommandDefinition = {
    id: "search_artifacts",
    description: "Search artifacts by keyword across name, content, tags, and description.",
    tags: ["artifact", "query", "search"],
    rbac: ["researcher", "builder", "orchestrator"],
    args: {
        query: {
            name: "query",
            type: "string",
            description: "Search keyword or phrase (case-insensitive)",
            required: true
        },
        type: {
            name: "type",
            type: "string",
            description: "Optionally restrict search to a specific artifact type",
            required: false
        },
        limit: {
            name: "limit",
            type: "number",
            description: "Max number of results to return. Defaults to 20.",
            required: false,
            defaultValue: 20
        }
    },
    output: "List of artifacts matching the search query with highlighted context.",
    outputSchema: {
        type: "object",
        properties: {
            query: { type: "string" },
            total: { type: "number" },
            results: { type: "array" }
        }
    },
    execute: async (args, context: CommandContext) => {
        const query = (args.query as string).toLowerCase();
        if (!query.trim()) {
            throw new Error("Search query cannot be empty");
        }

        let candidates = [...context.jobs.allArtifacts];

        if (args.type) {
            candidates = candidates.filter((a) => a.type === args.type);
        }

        const results: Array<{ id: string; name: string; type: string; source: string; tags: string[]; matchFields: string[]; snippet: string | null; createdAt: number | null }> = [];

        for (const artifact of candidates) {
            const matchFields: string[] = [];
            let snippet = "";

            // Check name
            if (artifact.name && artifact.name.toLowerCase().includes(query)) {
                matchFields.push("name");
            }

            // Check description
            if (artifact.description && artifact.description.toLowerCase().includes(query)) {
                matchFields.push("description");
            }

            // Check tags
            if (Array.isArray(artifact.tags) && artifact.tags.some((t: string) => t.toLowerCase().includes(query))) {
                matchFields.push("tags");
            }

            // Check content
            if (typeof artifact.content === "string") {
                const lowerContent = artifact.content.toLowerCase();
                const idx = lowerContent.indexOf(query);
                if (idx !== -1) {
                    matchFields.push("content");
                    // Extract a snippet around the match
                    const start = Math.max(0, idx - 40);
                    const end = Math.min(artifact.content.length, idx + query.length + 80);
                    snippet = (start > 0 ? "..." : "") + artifact.content.slice(start, end) + (end < artifact.content.length ? "..." : "");
                }
            }

            if (matchFields.length > 0) {
                results.push({
                    id: artifact.id,
                    name: artifact.name,
                    type: artifact.type,
                    source: artifact.source || "unknown",
                    tags: artifact.tags || [],
                    matchFields,
                    snippet: snippet || null,
                    createdAt: artifact.createdAt || null,
                });
            }
        }

        // Sort by number of matching fields (most relevant first)
        results.sort((a, b) => b.matchFields.length - a.matchFields.length);

        const limit = args.limit || 20;
        const trimmed = results.slice(0, limit);

        context.workspace.addLog(`Artifact search for "${args.query}" found ${results.length} results`);
        return { query: args.query, total: results.length, results: trimmed };
    }
};

export const exportArtifactCommand: CommandDefinition = {
    id: "export_artifact",
    description: "Export an artifact's content as a downloadable JSON package including metadata.",
    tags: ["artifact", "export", "data"],
    rbac: ["researcher", "builder", "orchestrator"],
    args: {
        id: {
            name: "id",
            type: "string",
            description: "ID of the artifact to export",
            required: true
        }
    },
    output: "JSON export of the artifact with full metadata.",
    outputSchema: {
        type: "object",
        properties: {
            success: { type: "boolean" },
            artifact: { type: "object" }
        }
    },
    execute: async (args, context: CommandContext) => {
        const artifact = context.jobs.allArtifacts.find((a) => a.id === args.id);
        if (!artifact) {
            throw new Error(`Artifact ${args.id} not found.`);
        }

        const exportData = {
            version: "1.0",
            type: "artifact-export",
            exportedAt: new Date().toISOString(),
            artifact: {
                id: artifact.id,
                name: artifact.name,
                type: artifact.type,
                content: artifact.content,
                tags: artifact.tags || [],
                description: artifact.description || "",
                source: artifact.source || "unknown",
                createdAt: artifact.createdAt || null,
            },
        };

        // Produce deliverable
        context.addDeliverable({
            key: `artifact-export-${artifact.id}`,
            name: `${artifact.name} Export`,
            type: 'json',
            content: JSON.stringify(exportData, null, 2),
        });

        context.workspace.addLog(`Exported artifact: ${artifact.name}`);
        return { success: true, artifact: exportData.artifact };
    }
};
