import type { CollectiveMemoryEntry } from "@/services/collectiveMemory";
import { recallCollectiveMemory } from "@/services/collectiveMemory";
import type { WorkspaceContext } from "@/services/ai/prompts";
import { ensureWorkspaceIndexed, getWorkspaceIndexStatus } from "./workspaceIndexer";
import { embedText } from "./embeddings";
import { ragVectorStore } from "./vectorStore";
import { getWorkspaceRagPolicy } from "./policy";
import { perfLog, perfNow } from "@/services/perf";

export interface WorkspaceRetrieval {
  recalledMemory: CollectiveMemoryEntry[];
  ragContext: string;
}

function formatRagContext(rows: Array<{ entityType: string; entityId: string; score: number; text: string }>): string {
  if (rows.length === 0) return "";
  return [
    "",
    "SEMANTIC WORKSPACE CONTEXT (retrieved by vector similarity):",
    ...rows.map((row) => {
      const scorePct = Math.round(row.score * 100);
      const snippet = row.text.slice(0, 260).replace(/\s+/g, " ").trim();
      return `  - [${row.entityType}:${row.entityId}] score=${scorePct}% — ${snippet}${row.text.length > 260 ? "..." : ""}`;
    }),
  ].join("\n");
}

export async function retrieveWorkspaceContext(
  userMessage: string,
  ctx: WorkspaceContext,
  opts: { isDarkAgent?: boolean } = {},
): Promise<WorkspaceRetrieval> {
  const startedAt = perfNow();
  const isDarkAgent = opts.isDarkAgent === true;
  const policy = getWorkspaceRagPolicy();

  const status = getWorkspaceIndexStatus(ctx);
  const needsRefresh =
    !status.indexed ||
    !status.upToDate ||
    status.dirty ||
    (typeof status.stalenessMs === "number" && status.stalenessMs > policy.queryFreshnessMaxAgeMs);

  let indexMode: "none" | "blocking-initial" | "background-refresh" = "none";
  // Latency policy: block only when no index exists yet. If a stale index
  // is available, serve from it and refresh asynchronously in the background.
  if (!status.indexed) {
    indexMode = "blocking-initial";
    await ensureWorkspaceIndexed(ctx);
  } else if (needsRefresh) {
    indexMode = "background-refresh";
    void ensureWorkspaceIndexed(ctx).catch(() => {
      // Refresh failures should never fail a chat turn.
    });
  }

  const vectorStart = perfNow();
  const queryEmbedding = await embedText(userMessage);

  const workspaceId = ctx.workspaceId || "default-workspace";
  const vectorHits = await ragVectorStore.search({
    workspaceId,
    embedding: queryEmbedding,
    topK: 6,
    minScore: 0.18,
  });
  const vectorDurationMs = Math.round(perfNow() - vectorStart);

  const memoryStart = perfNow();
  let recalledMemory: CollectiveMemoryEntry[] = [];
  if (!isDarkAgent) {
    try {
      recalledMemory = recallCollectiveMemory({ query: userMessage, limit: 5, includeGlobal: true });
    } catch {
      recalledMemory = [];
    }
  }
  const memoryDurationMs = Math.round(perfNow() - memoryStart);

  perfLog("rag.retrieve_workspace_context", {
    workspaceId,
    indexMode,
    needsRefresh,
    vectorDurationMs,
    memoryDurationMs,
    vectorHitCount: vectorHits.length,
    recalledMemoryCount: recalledMemory.length,
    totalDurationMs: Math.round(perfNow() - startedAt),
  });

  return {
    recalledMemory,
    ragContext: formatRagContext(vectorHits),
  };
}
