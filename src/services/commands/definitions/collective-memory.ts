import { CommandDefinition } from "@/services/commands/types";
import type { Agent, ToolkitId } from "@/types";
import {
  rememberCollectiveMemory,
  recallCollectiveMemory,
  listCollectiveMemory,
  listAllCollectiveMemory,
  forgetCollectiveMemory,
} from "@/services/collectiveMemory";
import {
  collectiveMemoryArchiveJsonSchema,
  parseCollectiveMemoryArchive,
} from "@/services/collectiveMemoryArchive";
import {
  buildCollectiveMemoryArchiveArtifactFromMemory,
  importCollectiveMemoryArchivePayload,
} from "@/services/collectiveMemoryArchiveWorkflow";

export const COLLECTIVE_MEMORY_COMMAND_IDS = [
  "remember_collective_memory",
  "recall_collective_memory",
  "list_collective_memory",
  "forget_collective_memory",
  "archive_collective_memory",
  "import_collective_memory_archive",
  "set_agent_memory_mode",
] as const;

const rememberCollectiveMemoryCommand: CommandDefinition = {
  id: "remember_collective_memory",
  description: "Write a shared memory entry that all non-dark agents can recall across conversations.",
  tags: ["memory", "collective", "knowledge", "write"],
  rbac: ["orchestrator", "builder", "researcher", "curator", "validator"],
  args: {
    content: {
      name: "content",
      type: "string",
      description: "Memory content to store",
      required: true,
      validation: (v) => (typeof v === "string" && v.trim().length > 2) || "content must be at least 3 characters",
    },
    tags: {
      name: "tags",
      type: "array",
      description: "Optional tags for search (array of strings)",
      required: false,
    },
    importance: {
      name: "importance",
      type: "number",
      description: "Importance score from 1 (low) to 5 (critical)",
      required: false,
      defaultValue: 3,
    },
    scope: {
      name: "scope",
      type: "string",
      description: "Memory scope",
      required: false,
      defaultValue: "workspace",
      enum: ["workspace", "global"],
    },
    sourceAgentId: {
      name: "sourceAgentId",
      type: "agent",
      description: "Optional source agent id",
      required: false,
    },
    conversationId: {
      name: "conversationId",
      type: "string",
      description: "Optional conversation id",
      required: false,
    },
  },
  output: "Created memory entry with id and metadata",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async (args, context) => {
    const workspaceId = context.workspaceManager?.currentId || undefined;
    const sourceAgent = args.sourceAgentId
      ? (context.workspace.getAgents?.() ?? context.workspace.agents).find((a: Agent) => a.id === args.sourceAgentId)
      : null;

    if (sourceAgent?.isDarkAgent) {
      throw new Error(`Agent "${sourceAgent.name}" is in dark mode and cannot write to collective memory.`);
    }

    const entry = rememberCollectiveMemory({
      content: String(args.content || ""),
      tags: Array.isArray(args.tags) ? args.tags.map(String) : undefined,
      importance: typeof args.importance === "number" ? args.importance : undefined,
      scope: args.scope === "global" ? "global" : "workspace",
      sourceAgentId: sourceAgent?.id,
      sourceAgentName: sourceAgent?.name,
      workspaceId,
      conversationId: args.conversationId ? String(args.conversationId) : undefined,
      metadata: { by: context.auth.user?.did || "unknown" },
    });

    context.workspace.addLog(
      `CollectiveMemory: remembered entry ${entry.id.slice(0, 8)} (${entry.scope}${entry.sourceAgentName ? ` by ${entry.sourceAgentName}` : ""})`,
    );

    context.storage.lastCollectiveMemoryId = entry.id;
    return {
      status: "remembered",
      entry,
    };
  },
};

const recallCollectiveMemoryCommand: CommandDefinition = {
  id: "recall_collective_memory",
  description: "Recall relevant shared memories for planning and continuity.",
  tags: ["memory", "collective", "knowledge", "query"],
  rbac: ["orchestrator", "builder", "researcher", "curator", "validator"],
  args: {
    query: {
      name: "query",
      type: "string",
      description: "Search query",
      required: false,
      defaultValue: "",
    },
    tags: {
      name: "tags",
      type: "array",
      description: "Optional tags filter (array of strings)",
      required: false,
    },
    limit: {
      name: "limit",
      type: "number",
      description: "Maximum entries to return (1-50)",
      required: false,
      defaultValue: 10,
    },
    includeGlobal: {
      name: "includeGlobal",
      type: "boolean",
      description: "Include global memories along with workspace memories",
      required: false,
      defaultValue: true,
    },
  },
  output: "Matching memory entries sorted by relevance",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async (args, context) => {
    const workspaceId = context.workspaceManager?.currentId || undefined;
    const entries = recallCollectiveMemory({
      query: String(args.query || ""),
      tags: Array.isArray(args.tags) ? args.tags.map(String) : undefined,
      limit: typeof args.limit === "number" ? args.limit : undefined,
      workspaceId,
      includeGlobal: args.includeGlobal !== false,
    });

    context.storage.lastCollectiveMemoryResults = entries;
    return {
      count: entries.length,
      entries,
    };
  },
};

const listCollectiveMemoryCommand: CommandDefinition = {
  id: "list_collective_memory",
  description: "List recent collective memory entries.",
  tags: ["memory", "collective", "query"],
  rbac: ["orchestrator", "builder", "researcher", "curator", "validator"],
  args: {
    limit: {
      name: "limit",
      type: "number",
      description: "Maximum entries to return (1-50)",
      required: false,
      defaultValue: 20,
    },
  },
  output: "Recent memory entries",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async (args, context) => {
    const workspaceId = context.workspaceManager?.currentId || undefined;
    const limit = typeof args.limit === "number" ? args.limit : 20;
    const entries = listCollectiveMemory(limit, workspaceId);
    return { count: entries.length, entries };
  },
};

const forgetCollectiveMemoryCommand: CommandDefinition = {
  id: "forget_collective_memory",
  description: "Delete a shared memory entry by ID.",
  tags: ["memory", "collective", "delete"],
  rbac: ["orchestrator", "builder", "curator"],
  args: {
    id: {
      name: "id",
      type: "string",
      description: "Memory entry id",
      required: true,
    },
  },
  output: "Deletion status",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async (args, context) => {
    const ok = forgetCollectiveMemory(String(args.id || ""));
    if (ok) {
      context.workspace.addLog(`CollectiveMemory: removed entry ${String(args.id).slice(0, 8)}`);
    }
    return {
      status: ok ? "deleted" : "not_found",
      id: args.id,
    };
  },
};

const archiveCollectiveMemoryCommand: CommandDefinition = {
  id: "archive_collective_memory",
  description: "Export a single collective memory entry to a JSON artifact using the v0 memory schema.",
  tags: ["memory", "collective", "archive", "artifact", "export"],
  rbac: ["orchestrator", "builder", "curator", "researcher"],
  args: {
    name: {
      name: "name",
      type: "string",
      description: "Optional artifact name (defaults to memory-<id>-archive-<date>.json)",
      required: false,
    },
    query: {
      name: "query",
      type: "string",
      description: "Optional keyword filter over content and tags",
      required: false,
      defaultValue: "",
    },
    tags: {
      name: "tags",
      type: "array",
      description: "Optional tag filter (all tags must match)",
      required: false,
    },
    scope: {
      name: "scope",
      type: "string",
      description: "Scope filter",
      required: false,
      defaultValue: "all",
      enum: ["workspace", "global", "all"],
    },
    includeDisabled: {
      name: "includeDisabled",
      type: "boolean",
      description: "Include disabled memories in the archive",
      required: false,
      defaultValue: true,
    },
    id: {
      name: "id",
      type: "string",
      description: "Optional specific memory id to export. If omitted, first match from filters is exported.",
      required: false,
    },
  },
  output: "Created JSON artifact containing a single-memory v0 archive manifest.",
  outputSchema: {
    type: "object",
    properties: {
      success: { type: "boolean" },
      artifact: { type: "object" },
      memory: { type: "object" },
      schema: { type: "object" },
    },
  },
  execute: async (args, context) => {
    const workspaceId = context.workspaceManager?.currentId || undefined;
    const scope = args.scope === "workspace" || args.scope === "global" ? args.scope : "all";
    const includeDisabled = args.includeDisabled !== false;
    const idFilter = args.id ? String(args.id) : "";
    const tagFilter = Array.isArray(args.tags)
      ? args.tags.map(String).map((t: string) => t.trim().toLowerCase()).filter(Boolean)
      : [];
    const queryTerms = String(args.query || "")
      .toLowerCase()
      .split(/\s+/)
      .map((s: string) => s.trim())
      .filter(Boolean);

    let entries = listAllCollectiveMemory(workspaceId);

    if (scope !== "all") {
      entries = entries.filter((entry) => entry.scope === scope);
    }
    if (!includeDisabled) {
      entries = entries.filter((entry) => !entry.disabled);
    }
    if (tagFilter.length > 0) {
      entries = entries.filter((entry) => {
        const tags = new Set((entry.tags || []).map((t: string) => t.toLowerCase()));
        return tagFilter.every((tag: string) => tags.has(tag));
      });
    }
    if (queryTerms.length > 0) {
      entries = entries.filter((entry) => {
        const haystack = `${entry.content} ${(entry.tags || []).join(" ")}`.toLowerCase();
        return queryTerms.some(term => haystack.includes(term));
      });
    }

    if (idFilter) {
      entries = entries.filter((entry) => entry.id === idFilter);
    }

    if (entries.length === 0) {
      throw new Error("No memory entry matched the requested filters.");
    }

    const memory = entries[0];

    const datePart = new Date().toISOString().slice(0, 10);
    const artifactName = String(args.name || `memory-${memory.id.slice(0, 8)}-archive-${datePart}.json`);
    const { manifest, artifact } = buildCollectiveMemoryArchiveArtifactFromMemory({
      memory,
      name: artifactName,
      workspaceId,
      annotations: {
        query: String(args.query || ""),
        filter_scope: scope,
      },
      labels: {
        source: "archive_collective_memory",
      },
      identity: {
        sourceAgentId: memory.sourceAgentId,
        sourceAgentName: memory.sourceAgentName,
      },
      source: "command",
    });

    context.jobs.importArtifact(artifact);
    context.storage.lastArtifactId = artifact.id;
    context.storage.lastCollectiveMemoryArchiveArtifactId = artifact.id;
    context.storage.lastCollectiveMemoryArchive = manifest;
    context.workspace.addLog(`CollectiveMemory: archived memory ${memory.id.slice(0, 8)} to artifact ${artifact.name}`);

    return {
      success: true,
      artifact: {
        id: artifact.id,
        name: artifact.name,
        type: artifact.type,
        createdAt: artifact.createdAt,
      },
      memory,
      schema: collectiveMemoryArchiveJsonSchema,
      ref: `[[artifact:${artifact.id}|${artifact.name}]]`,
    };
  },
};

const importCollectiveMemoryArchiveCommand: CommandDefinition = {
  id: "import_collective_memory_archive",
  description: "Import collective memory entries from JSON artifacts that match the archive manifest schema.",
  tags: ["memory", "collective", "import", "artifact"],
  rbac: ["orchestrator", "builder", "curator"],
  args: {
    artifactId: {
      name: "artifactId",
      type: "string",
      description: "Optional specific artifact id to import. If omitted, scans JSON artifacts by tag.",
      required: false,
    },
    tag: {
      name: "tag",
      type: "string",
      description: "When artifactId is omitted, only scan artifacts with this tag",
      required: false,
      defaultValue: "memory:archive",
    },
    mode: {
      name: "mode",
      type: "string",
      description: "Import mode: upsert updates by id; skip-existing leaves existing entries unchanged",
      required: false,
      defaultValue: "upsert",
      enum: ["upsert", "skip-existing"],
    },
    maxArtifacts: {
      name: "maxArtifacts",
      type: "number",
      description: "Max artifacts to scan when artifactId is omitted (1-100)",
      required: false,
      defaultValue: 20,
    },
    dryRun: {
      name: "dryRun",
      type: "boolean",
      description: "Validate and preview import without writing memory entries",
      required: false,
      defaultValue: false,
    },
  },
  output: "Import summary including validated artifacts and entry counts.",
  outputSchema: {
    type: "object",
    properties: {
      success: { type: "boolean" },
      artifactsScanned: { type: "number" },
      artifactsImported: { type: "number" },
      imported: { type: "number" },
      updated: { type: "number" },
      skipped: { type: "number" },
      wouldImport: { type: "number" },
      wouldUpdate: { type: "number" },
      wouldSkip: { type: "number" },
      dryRun: { type: "boolean" },
      invalidArtifacts: { type: "array" },
      warningArtifacts: { type: "array" },
    },
  },
  execute: async (args, context) => {
    const mode = args.mode === "skip-existing" ? "skip-existing" : "upsert";
    const dryRun = !!args.dryRun;
    const maxArtifacts = Math.max(1, Math.min(100, Number(args.maxArtifacts ?? 20)));
    const tag = String(args.tag || "memory:archive");

    const candidates = args.artifactId
      ? context.jobs.allArtifacts.filter(a => a.id === args.artifactId)
      : context.jobs.allArtifacts
        .filter(a => a.type === "json")
        .filter(a => !tag || (Array.isArray(a.tags) && a.tags.includes(tag)))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, maxArtifacts);

    if (candidates.length === 0) {
      throw new Error(args.artifactId
        ? `Artifact ${String(args.artifactId)} not found`
        : "No matching JSON artifacts found for archive import");
    }

    let artifactsImported = 0;
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let wouldImport = 0;
    let wouldUpdate = 0;
    let wouldSkip = 0;
    const invalidArtifacts: Array<{ id: string; name: string; reason: string }> = [];
    const warningArtifacts: Array<{ id: string; name: string; warnings: string[] }> = [];
    const existingIds = new Set(listAllCollectiveMemory().map((entry) => entry.id));

    for (const artifact of candidates) {
      if (typeof artifact.content !== "string") {
        invalidArtifacts.push({
          id: artifact.id,
          name: artifact.name,
          reason: "artifact content is not text/json",
        });
        continue;
      }

      const parsed = parseCollectiveMemoryArchive(artifact.content);
      if (!parsed.manifest) {
        invalidArtifacts.push({
          id: artifact.id,
          name: artifact.name,
          reason: parsed.errors.join("; "),
        });
        continue;
      }
      if (parsed.errors.length > 0) {
        warningArtifacts.push({
          id: artifact.id,
          name: artifact.name,
          warnings: parsed.errors,
        });
      }

      artifactsImported += 1;

      if (!dryRun) {
        const importedResult = importCollectiveMemoryArchivePayload({
          payload: parsed.manifest,
          mode,
        });
        if (!importedResult.success) {
          invalidArtifacts.push({
            id: artifact.id,
            name: artifact.name,
            reason: importedResult.errors.join("; "),
          });
          artifactsImported -= 1;
          continue;
        }
        const result = importedResult.result;
        imported += result.imported;
        updated += result.updated;
        skipped += result.skipped;
      } else {
        const memoryId = parsed.manifest.spec.memory.id;
        if (existingIds.has(memoryId)) {
          if (mode === "upsert") {
            updated += 1;
            wouldUpdate += 1;
          } else {
            skipped += 1;
            wouldSkip += 1;
          }
        } else {
          imported += 1;
          wouldImport += 1;
          existingIds.add(memoryId);
        }
      }
    }

    const summary = {
      success: true,
      dryRun,
      mode,
      artifactsScanned: candidates.length,
      artifactsImported,
      imported,
      updated,
      skipped,
      wouldImport,
      wouldUpdate,
      wouldSkip,
      invalidArtifacts,
      warningArtifacts,
    };

    context.storage.lastCollectiveMemoryImport = summary;
    context.workspace.addLog(
      `CollectiveMemory: import scan ${summary.artifactsScanned} artifact(s), accepted ${summary.artifactsImported}, imported ${summary.imported}, updated ${summary.updated}, skipped ${summary.skipped}${dryRun ? " (dry-run)" : ""}`,
    );

    return summary;
  },
};

const setAgentMemoryModeCommand: CommandDefinition = {
  id: "set_agent_memory_mode",
  description: "Set an agent memory mode: collective (shared mind) or dark (isolated, no shared memory).",
  tags: ["memory", "agent", "configuration"],
  rbac: ["orchestrator", "builder"],
  args: {
    agentId: {
      name: "agentId",
      type: "agent",
      description: "Agent to configure",
      required: true,
    },
    mode: {
      name: "mode",
      type: "string",
      description: "Memory mode",
      required: true,
      enum: ["collective", "dark"],
      validation: (v) => (v === "collective" || v === "dark") || "mode must be collective or dark",
    },
  },
  output: "Updated agent memory mode",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async (args, context) => {
    const mode = args.mode === "dark" ? "dark" : "collective";
    const liveAgents = context.workspace.getAgents?.() ?? context.workspace.agents;
    const target = liveAgents.find((a: Agent) => a.id === args.agentId);
    if (!target) throw new Error(`Agent ${args.agentId} not found`);

    const now = new Date().toISOString();
    context.workspace.setAgents((prev: Agent[]) =>
      prev.map((agent) => {
        if (agent.id !== args.agentId) return agent;

        const currentToolkits = agent.toolkits || [];
        const hasCollectiveToolkit = currentToolkits.some(t => t.toolkitId === "collective-memory");

        const toolkits = mode === "collective"
          ? (hasCollectiveToolkit
            ? currentToolkits
            : [...currentToolkits, { toolkitId: "collective-memory" as ToolkitId, enabledAt: now }])
          : currentToolkits.filter(t => t.toolkitId !== "collective-memory");

        return {
          ...agent,
          isDarkAgent: mode === "dark",
          toolkits,
        };
      }),
    );

    context.workspace.addLog(`Agent "${target.name}" memory mode set to ${mode}`);
    return {
      agentId: target.id,
      agentName: target.name,
      mode,
      isDarkAgent: mode === "dark",
    };
  },
};

export const collectiveMemoryCommands: CommandDefinition[] = [
  rememberCollectiveMemoryCommand,
  recallCollectiveMemoryCommand,
  listCollectiveMemoryCommand,
  forgetCollectiveMemoryCommand,
  archiveCollectiveMemoryCommand,
  importCollectiveMemoryArchiveCommand,
  setAgentMemoryModeCommand,
];
