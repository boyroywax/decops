import type { ToolkitModule } from "../types";
import { workspaceRagCommands } from "@/services/commands/definitions/workspace-rag";

export const workspaceRagModule: ToolkitModule = {
  manifest: {
    id: "workspace-rag",
    name: "Workspace RAG",
    description:
      "Client-side semantic indexing and retrieval for workspace state, enabling reliable and up-to-date context injection.",
    icon: "DatabaseZap",
    color: "#0ea5e9",
    gradient: ["#0ea5e9", "#22d3ee"],
    category: "data",
    status: "available",
    builtIn: true,
    tags: ["rag", "vector", "semantic-search", "workspace", "retrieval"],
    labels: { tier: "core", domain: "retrieval" },
    version: "1.0.0",
    author: { name: "decops", url: "https://decops.io" },
    license: "MIT",
    createdAt: "2026-05-30T00:00:00Z",
    updatedAt: "2026-05-30T00:00:00Z",
  },

  commands: workspaceRagCommands,

  tools: [
    {
      id: "workspace-rag.index",
      name: "Index Workspace RAG",
      description: "Refresh semantic workspace index from current state.",
      commandId: "index_workspace_rag",
    },
    {
      id: "workspace-rag.search",
      name: "Search Workspace RAG",
      description: "Run semantic retrieval over the workspace index.",
      commandId: "search_workspace_rag",
    },
    {
      id: "workspace-rag.status",
      name: "Workspace RAG Status",
      description: "Inspect indexing freshness and document estimate.",
      commandId: "workspace_rag_status",
    },
    {
      id: "workspace-rag.clear",
      name: "Clear Workspace RAG Index",
      description: "Clear indexed semantic documents for this workspace.",
      commandId: "clear_workspace_rag_index",
    },
  ],

  collections: [
    {
      id: "workspace_rag_documents",
      name: "Workspace RAG Documents",
      description: "Semantic chunks generated from workspace entities and recent activity.",
      schema: [
        { name: "id", type: "string", required: true, unique: true, indexed: true },
        { name: "workspaceId", type: "string", required: true, indexed: true },
        { name: "entityType", type: "string", required: true, indexed: true },
        { name: "entityId", type: "string", required: true, indexed: true },
        { name: "text", type: "string", required: true },
        { name: "tags", type: "array" },
        { name: "updatedAt", type: "date", indexed: true },
      ],
      primaryKey: "id",
    },
  ],

  logging: {
    config: { minLevel: "info", maxEntries: 400 },
    channels: [
      { id: "workspace-rag.index", name: "Indexing", description: "Workspace indexing operations" },
      { id: "workspace-rag.search", name: "Search", description: "Semantic retrieval operations" },
    ],
  },

  metrics: {
    definitions: [
      { name: "toolkit.workspace_rag.searches", description: "Semantic searches count", type: "counter" },
      { name: "toolkit.workspace_rag.indexes", description: "Index refresh count", type: "counter" },
    ],
    collect: () => ({
      "toolkit.workspace_rag.searches": 0,
      "toolkit.workspace_rag.indexes": 0,
    }),
  },

  configuration: {
    fields: [
      {
        key: "autoIndexEnabled",
        label: "Auto Indexing Enabled",
        description: "When enabled, workspace mutations schedule background reindexing.",
        type: "boolean",
        defaultValue: true,
      },
      {
        key: "debounceMs",
        label: "Index Debounce (ms)",
        description: "Delay before background indexing runs after non-burst updates.",
        type: "number",
        defaultValue: 600,
      },
      {
        key: "messageBatchSize",
        label: "Message Burst Batch Size",
        description: "Number of new messages that triggers immediate indexing instead of waiting for debounce.",
        type: "number",
        defaultValue: 12,
      },
      {
        key: "queryFreshnessMaxAgeMs",
        label: "Max Query Freshness Age (ms)",
        description: "If index staleness exceeds this value, query-time retrieval forces a synchronous refresh.",
        type: "number",
        defaultValue: 12000,
      },
    ],
  },

  rbac: {
    permissions: [
      {
        id: "workspace-rag.read",
        name: "Read Workspace RAG",
        description: "Search and inspect workspace semantic index",
        resource: "workspace-rag",
        actions: ["read"],
      },
      {
        id: "workspace-rag.write",
        name: "Write Workspace RAG",
        description: "Rebuild and clear workspace semantic index",
        resource: "workspace-rag",
        actions: ["create", "update", "delete"],
      },
    ],
    roles: [
      {
        id: "workspace-rag-operator",
        name: "Workspace RAG Operator",
        description: "Can inspect and refresh workspace semantic retrieval index",
        permissions: ["workspace-rag.read", "workspace-rag.write"],
      },
    ],
    defaultRole: "workspace-rag-operator",
  },

  docs: {
    documents: [
      {
        id: "workspace-rag-overview",
        title: "Workspace RAG Overview",
        type: "readme",
        content:
          "# Workspace RAG\n\nSemantic indexing and retrieval of workspace state. Use commands to index, inspect status, search semantically, and clear index data.",
        order: 1,
      },
    ],
    readme:
      "# Workspace RAG Toolkit\n\nAdds client-side semantic retrieval so workspace chat can use relevant indexed context for reliable responses.",
  },

  activity: { enabled: true },
};
