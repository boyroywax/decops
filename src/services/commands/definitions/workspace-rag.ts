import type { CommandDefinition, CommandContext } from "@/services/commands/types";
import type { WorkspaceContext } from "@/services/ai/prompts";
import { ensureWorkspaceIndexed, clearWorkspaceIndex, getWorkspaceIndexStatus } from "@/services/rag/workspaceIndexer";
import { embedText } from "@/services/rag/embeddings";
import { ragVectorStore } from "@/services/rag/vectorStore";
import { getWorkspaceRagPolicy } from "@/services/rag/policy";

function toWorkspaceContext(context: CommandContext): WorkspaceContext {
  return {
    workspaceId: context.workspaceManager?.currentId || undefined,
    agents: context.workspace.getAgents?.() ?? context.workspace.agents,
    channels: context.workspace.getChannels?.() ?? context.workspace.channels,
    groups: context.workspace.getGroups?.() ?? context.workspace.groups,
    messages: context.workspace.getMessages?.() ?? context.workspace.messages,
    networks: context.ecosystem.networks,
    bridges: context.ecosystem.bridges,
    artifacts: context.jobs.allArtifacts,
    jobs: context.jobs.getQueue(),
  };
}

const indexWorkspaceRagCommand: CommandDefinition = {
  id: "index_workspace_rag",
  description: "Index current workspace state into client-side semantic retrieval storage.",
  tags: ["rag", "workspace", "index", "vector"],
  rbac: ["orchestrator", "builder", "researcher", "curator", "validator"],
  args: {},
  output: "Workspace index refresh status",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async (_args, context) => {
    const snapshot = toWorkspaceContext(context);
    await ensureWorkspaceIndexed(snapshot);
    const status = getWorkspaceIndexStatus(snapshot);
    context.workspace.addLog(
      `WorkspaceRAG: indexed workspace ${status.workspaceId} (${status.estimatedDocuments} docs estimated)`,
    );
    return {
      status: "indexed",
      workspaceId: status.workspaceId,
      estimatedDocuments: status.estimatedDocuments,
      upToDate: status.upToDate,
    };
  },
};

const searchWorkspaceRagCommand: CommandDefinition = {
  id: "search_workspace_rag",
  description:
    "PRIMARY command-discovery tool. Run this FIRST whenever you need to find a command, recall workspace state, or ground a plan. The workspace RAG index includes every registered command (id, description, args) plus agents, channels, jobs, artifacts, and prior decisions, and returns ranked semantic matches. Use focused multi-word queries (e.g. 'create channel between agents', 'queue helia ipfs upload'). Prefer this over `list_available_commands`, which is fallback-only.",
  tags: ["rag", "workspace", "search", "vector"],
  rbac: ["orchestrator", "builder", "researcher", "curator", "validator"],
  args: {
    query: {
      name: "query",
      type: "string",
      description: "Semantic query text",
      required: true,
      validation: (v) => (typeof v === "string" && v.trim().length > 1) || "query must be at least 2 characters",
    },
    limit: {
      name: "limit",
      type: "number",
      description: "Maximum number of matches to return (1-20)",
      required: false,
      defaultValue: 6,
    },
    minScore: {
      name: "minScore",
      type: "number",
      description: "Minimum cosine similarity threshold (0-1)",
      required: false,
      defaultValue: 0.18,
    },
    ensureIndexed: {
      name: "ensureIndexed",
      type: "boolean",
      description: "Refresh index before searching",
      required: false,
      defaultValue: true,
    },
  },
  output: "Semantic matches from workspace vector index",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async (args, context) => {
    const snapshot = toWorkspaceContext(context);
    const workspaceId = snapshot.workspaceId || "default-workspace";

    if (args.ensureIndexed !== false) {
      await ensureWorkspaceIndexed(snapshot);
    }

    const query = String(args.query || "").trim();
    const embedding = await embedText(query);
    const hits = await ragVectorStore.search({
      workspaceId,
      embedding,
      topK: typeof args.limit === "number" ? args.limit : 6,
      minScore: typeof args.minScore === "number" ? args.minScore : 0.18,
    });

    context.storage.lastWorkspaceRagResults = hits;
    return {
      query,
      workspaceId,
      count: hits.length,
      hits,
    };
  },
};

const workspaceRagStatusCommand: CommandDefinition = {
  id: "workspace_rag_status",
  description: "Get current workspace semantic index status.",
  tags: ["rag", "workspace", "status"],
  rbac: ["orchestrator", "builder", "researcher", "curator", "validator"],
  args: {},
  output: "Workspace RAG status",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async (_args, context) => {
    const snapshot = toWorkspaceContext(context);
    const status = getWorkspaceIndexStatus(snapshot);
    const policy = getWorkspaceRagPolicy();
    return {
      workspaceId: status.workspaceId,
      indexed: status.indexed,
      upToDate: status.upToDate,
      dirty: status.dirty,
      lastIndexedAt: status.lastIndexedAt,
      stalenessMs: status.stalenessMs,
      estimatedDocuments: status.estimatedDocuments,
      policy,
    };
  },
};

const clearWorkspaceRagIndexCommand: CommandDefinition = {
  id: "clear_workspace_rag_index",
  description: "Clear semantic index entries for the active workspace.",
  tags: ["rag", "workspace", "index", "clear"],
  rbac: ["orchestrator", "builder", "curator"],
  args: {},
  output: "Index clear confirmation",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async (_args, context) => {
    const workspaceId = context.workspaceManager?.currentId || "default-workspace";
    await clearWorkspaceIndex(workspaceId);
    context.workspace.addLog(`WorkspaceRAG: cleared workspace index for ${workspaceId}`);
    return {
      status: "cleared",
      workspaceId,
    };
  },
};

export const workspaceRagCommands: CommandDefinition[] = [
  indexWorkspaceRagCommand,
  searchWorkspaceRagCommand,
  workspaceRagStatusCommand,
  clearWorkspaceRagIndexCommand,
];
