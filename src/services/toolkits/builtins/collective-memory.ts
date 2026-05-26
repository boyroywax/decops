import type { ToolkitModule } from "../types";
import { collectiveMemoryCommands } from "@/services/commands/definitions/collective-memory";

export const collectiveMemoryModule: ToolkitModule = {
  manifest: {
    id: "collective-memory",
    name: "Collective Memory",
    description:
      "Cross-conversation memory for all AI agents — shared recall, long-term workspace intelligence, and optional dark-agent isolation.",
    icon: "BrainCircuit",
    color: "#22c55e",
    gradient: ["#22c55e", "#14b8a6"],
    category: "data",
    status: "available",
    builtIn: true,
    tags: ["memory", "knowledge", "collective", "agents", "continuity"],
    labels: { tier: "core", domain: "memory" },
    version: "1.0.0",
    author: { name: "decops", url: "https://decops.io" },
    license: "MIT",
    createdAt: "2026-05-26T00:00:00Z",
    updatedAt: "2026-05-26T00:00:00Z",
  },

  commands: collectiveMemoryCommands,

  tools: [
    {
      id: "memory.remember",
      name: "Remember Collective Memory",
      description: "Store a shared memory entry so non-dark agents can recall it later.",
      commandId: "remember_collective_memory",
    },
    {
      id: "memory.recall",
      name: "Recall Collective Memory",
      description: "Search collective memory by query/tags for relevant prior knowledge.",
      commandId: "recall_collective_memory",
    },
    {
      id: "memory.list",
      name: "List Collective Memory",
      description: "List recent memory entries.",
      commandId: "list_collective_memory",
    },
    {
      id: "memory.mode",
      name: "Set Agent Memory Mode",
      description: "Toggle an agent between collective memory and dark (isolated) mode.",
      commandId: "set_agent_memory_mode",
    },
  ],

  collections: [
    {
      id: "collective_memory_entries",
      name: "Collective Memory Entries",
      description: "Shared memory records persisted across conversations.",
      schema: [
        { name: "id", type: "string", required: true, unique: true, indexed: true },
        { name: "content", type: "string", required: true },
        { name: "tags", type: "array" },
        { name: "scope", type: "enum", enumValues: ["workspace", "global"], required: true },
        { name: "importance", type: "number" },
        { name: "sourceAgentId", type: "string", indexed: true },
        { name: "workspaceId", type: "string", indexed: true },
        { name: "createdAt", type: "date", indexed: true },
      ],
      primaryKey: "id",
    },
  ],

  configuration: {
    fields: [
      {
        key: "defaultScope",
        label: "Default Memory Scope",
        description: "Default scope for new memory writes.",
        type: "select",
        defaultValue: "workspace",
        options: [
          { label: "Workspace", value: "workspace" },
          { label: "Global", value: "global" },
        ],
      },
      {
        key: "maxMemoryEntries",
        label: "Max Entries",
        description: "Maximum number of memory entries retained locally.",
        type: "number",
        defaultValue: 5000,
      },
    ],
  },

  logging: {
    config: { minLevel: "info", maxEntries: 500 },
    channels: [
      { id: "memory.write", name: "Memory Writes", description: "New shared memory entries" },
      { id: "memory.recall", name: "Memory Recalls", description: "Memory query and read activity" },
      { id: "memory.mode", name: "Memory Modes", description: "Dark/collective mode changes" },
    ],
  },

  notifications: {
    templates: [
      {
        id: "memory_dark_agent",
        name: "Dark Agent Enabled",
        description: "Notify when an agent switches to dark memory mode.",
        channel: "in-app",
        priority: "normal",
        event: "memory.mode.dark",
        template: "Agent '{{agentName}}' switched to dark memory mode.",
      },
      {
        id: "memory_collective_agent",
        name: "Collective Agent Enabled",
        description: "Notify when an agent rejoins collective memory.",
        channel: "in-app",
        priority: "normal",
        event: "memory.mode.collective",
        template: "Agent '{{agentName}}' joined collective memory.",
      },
    ],
    channels: ["in-app"],
  },

  metrics: {
    definitions: [
      { name: "toolkit.memory.entries", description: "Total collective memory entries", type: "gauge" },
      { name: "toolkit.memory.writes", description: "Memory writes count", type: "counter" },
      { name: "toolkit.memory.recalls", description: "Memory recalls count", type: "counter" },
    ],
    collect: () => ({
      "toolkit.memory.entries": 0,
      "toolkit.memory.writes": 0,
      "toolkit.memory.recalls": 0,
    }),
  },

  rbac: {
    permissions: [
      {
        id: "memory.read",
        name: "Read Collective Memory",
        description: "Query and list collective memory entries",
        resource: "memory",
        actions: ["read"],
      },
      {
        id: "memory.write",
        name: "Write Collective Memory",
        description: "Create collective memory entries",
        resource: "memory",
        actions: ["create", "update"],
      },
      {
        id: "memory.manage",
        name: "Manage Collective Memory",
        description: "Delete memory entries and change memory modes",
        resource: "memory",
        actions: ["delete", "update"],
      },
    ],
    roles: [
      {
        id: "memory-operator",
        name: "Memory Operator",
        description: "Read/write collective memory",
        permissions: ["memory.read", "memory.write"],
      },
      {
        id: "memory-admin",
        name: "Memory Admin",
        description: "Full collective memory control",
        permissions: ["memory.read", "memory.write", "memory.manage"],
      },
    ],
    defaultRole: "memory-operator",
  },

  tasks: [
    {
      id: "memory_hygiene",
      name: "Memory Hygiene",
      description: "Review and prune stale or noisy memory entries.",
      priority: "medium",
      assignableToAgents: true,
      assignableToUsers: true,
    },
  ],

  tests: {
    tests: [
      {
        id: "test_memory_write",
        name: "Remember Memory",
        description: "Verify memory write command",
        type: "unit",
        commandId: "remember_collective_memory",
      },
      {
        id: "test_memory_recall",
        name: "Recall Memory",
        description: "Verify memory recall command",
        type: "unit",
        commandId: "recall_collective_memory",
      },
    ],
  },

  docs: {
    documents: [
      {
        id: "collective-memory-readme",
        title: "Collective Memory Overview",
        type: "readme",
        content:
          "# Collective Memory\n\nShared long-term memory across agent conversations. Toggle any agent to dark mode for isolated operation.",
        order: 1,
      },
    ],
    readme:
      "# Collective Memory Toolkit\n\nProvides shared cross-conversation memory for all AI agents with optional per-agent dark mode.",
  },

  activity: { enabled: true },
};
