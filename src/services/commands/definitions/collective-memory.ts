import { CommandDefinition } from "@/services/commands/types";
import type { Agent, ToolkitId } from "@/types";
import {
  rememberCollectiveMemory,
  recallCollectiveMemory,
  listCollectiveMemory,
  forgetCollectiveMemory,
} from "@/services/collectiveMemory";

export const COLLECTIVE_MEMORY_COMMAND_IDS = [
  "remember_collective_memory",
  "recall_collective_memory",
  "list_collective_memory",
  "forget_collective_memory",
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
      throw new Error(`Agent \"${sourceAgent.name}\" is in dark mode and cannot write to collective memory.`);
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

    context.workspace.addLog(`Agent \"${target.name}\" memory mode set to ${mode}`);
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
  setAgentMemoryModeCommand,
];
