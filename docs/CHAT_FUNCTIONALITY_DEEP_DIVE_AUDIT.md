# Chat Functionality Deep Dive Audit

## Scope and Goal

This document audits the current chat stack for:

- latency contributors
- redundant code paths
- hardwired timeouts and budgets
- correctness risks and error-prone behavior
- practical overhaul recommendations

Primary objective: identify why chat feels slow and define a concrete path to a faster, simpler architecture.

## End-to-End Chat Architecture

### 1) UI and Interaction Layer

- Main workspace chat UI is mounted from src/components/layout/ChatPanel.tsx.
- Send pipeline is centralized in src/hooks/chat/useChatSend.ts.
- Agent-specific chat uses src/components/chat/AgentChat.tsx with a parallel send path.
- Streaming state lifecycle lives in src/components/chat/useStreamingChatState.ts.
- Conversation persistence/hydration uses src/hooks/useConversations.ts and src/components/chat/utils.ts.

### 2) AI Service Layer

- Workspace streaming entry: src/services/ai/streaming.ts (streamChatWithWorkspace).
- Agent chat entries: src/services/ai/chat.ts (chatWithAgent, streamChatWithAgent, chatWithWorkspace).
- Unified turn loop: src/services/ai/runner.ts (runChatTurn).
- Provider adapters/parsing: src/services/ai/providers.ts and src/services/ai/sse.ts.

### 3) Tool Execution Layer

- Tool bridge and execution: src/services/commands/tools.ts.
- Pending tool job registry and timeouts: src/services/commands/toolJobRegistry.ts.
- Actual job execution completion signaling: src/hooks/useJobExecutor.tsx.

### 4) RAG and Context Layer

- Retrieval on each prompt: src/services/rag/retrieval.ts.
- Indexing and scheduling: src/services/rag/workspaceIndexer.ts.
- Runtime policy defaults: src/services/rag/policy.ts.

## Observed Slowdown Contributors

## A) Query-time RAG indexing blocks chat start

In src/services/rag/retrieval.ts, retrieveWorkspaceContext checks index freshness and can call ensureWorkspaceIndexed before the model request proceeds.

Why this is expensive:

- getWorkspaceIndexStatus builds estimatedDocuments by calling buildDocs each query.
- ensureWorkspaceIndexed rebuilds docs and re-embeds every doc when fingerprint differs.
- Fingerprint includes volatile fields (last message/job status), so it invalidates frequently.

Impact:

- User-perceived delay before first token can appear.
- Delay grows with workspace size and message/job churn.

## B) Over-aggressive freshness policy causes frequent reindexing

Defaults in src/services/rag/policy.ts:

- queryFreshnessMaxAgeMs: 12000
- debounceMs: 600
- messageBatchSize: 12

With a 12s freshness TTL, even unchanged workspaces can get reindexed often under active usage.

Impact:

- Frequent CPU work and local storage writes.
- Higher latency on many user messages.

## C) Tool calls wait for job completion, not acknowledgement

In src/services/commands/tools.ts, executeToolCall generally waits on job completion (via watchChildJob or pending job resolve) before returning tool result to the model.

Impact:

- Chat turn can block until long jobs complete.
- Model cannot quickly continue with "job queued" behavior unless command ends quickly.

## D) Hardwired timeout mismatch for queue_new_job

Default timeout behavior in src/services/commands/toolJobRegistry.ts:

- TOOL_JOB_TIMEOUT_MS = 12000
- JOB_RUNNER_TIMEOUT_MS = 180000 (used only for commands marked spawnsChildJobs or explicit timeoutMs)

queue_new_job in src/services/commands/definitions/jobs.ts is not marked spawnsChildJobs and has no timeoutMs override.

In src/services/commands/tools.ts, queue_new_job is executed directly and then watched with resolveToolTimeout("queue_new_job"). This resolves to 12s.

Impact:

- Multi-step queue_new_job operations can return timeout placeholders after 12s even when actual work continues.
- Adds user-visible lag and confusing responses.

## E) Extra roundtrips from fabrication guardrail retries

runChatTurn in src/services/ai/runner.ts applies a fabrication retry budget of 2 rounds when the model narrates tool usage without emitting structured tool_use.

Impact:

- Good for safety, but can add full extra provider roundtrips (seconds) on problematic prompts/providers.
- Feels like "slow thinking" in chat UX.

## F) Group mention fan-out does parallel LLM calls per target

In src/hooks/chat/useChatSend.ts, @mention group routing uses Promise.all(targetAgents.map(chatWithAgent)).

Impact:

- Large groups trigger many concurrent model requests.
- Can saturate browser/network and slow overall app responsiveness.

## Redundancies and Structural Complexity

## 1) Duplicate agent chat methods

In src/services/ai/chat.ts:

- chatWithAgent and streamChatWithAgent share near-identical setup logic.
- Both construct tools/systemPrompt/messages with minor differences.

Consequence:

- Higher maintenance surface.
- Drift risk when one path is updated and the other is not.

## 2) Duplicate workspace chat setup across non-stream and stream paths

- chatWithWorkspace (src/services/ai/chat.ts)
- streamChatWithWorkspace (src/services/ai/streaming.ts)

Both perform retrieval, delegation, and tool selection similarly.

Consequence:

- Policy drift risk.
- Harder latency tuning because logic is split.

## 3) Two chat UI send pipelines with overlapping concerns

- Workspace pipeline in src/hooks/chat/useChatSend.ts.
- Agent pipeline in src/components/chat/AgentChat.tsx.

Both manage streaming callbacks, abort handling, persistence, and finalization.

Consequence:

- Duplicate complexity.
- Divergent behavior and optimization difficulty.

## 4) Conversation persistence writes on every conversation mutation

In src/hooks/useConversations.ts, conversations are serialized to localStorage whenever conversation state changes.

Consequence:

- Potential main-thread stalls when conversations become large.
- Cost grows with message history size and tool call payload volume.

## Correctness and Error Risks

## 1) OpenAI/OpenRouter tool arg parsing can throw in non-stream path

In src/services/ai/providers.ts parseToolUseBlocks:

- JSON.parse(tc.function?.arguments || "{}") has no try/catch.

Risk:

- Malformed arguments can throw and fail the round unexpectedly.

## 2) No in-flight dedupe/lock for ensureWorkspaceIndexed

In src/services/rag/workspaceIndexer.ts:

- scheduleWorkspaceIndex and query-time retrieval can both call ensureWorkspaceIndexed.
- No shared in-progress promise map/lock exists.

Risk:

- Concurrent duplicate indexing work on the same workspace.

## 3) Fingerprint includes volatile runtime fields

buildFingerprint in src/services/rag/workspaceIndexer.ts includes:

- message count and last message id
- job count, last job id, and last job status

Risk:

- Frequent invalidation even when semantic context delta is small.
- Unnecessary full reindex cycles.

## Hardwired Limits and Timeouts (Current)

- runChatTurn defaults: maxRounds=8, maxTokens=4096 (src/services/ai/runner.ts)
- Agent chat: maxRounds=6, maxTokens=1500 (src/services/ai/chat.ts)
- Delegation maxRounds fallback: 12 (src/services/ai/chat.ts, src/services/ai/streaming.ts)
- Tool default timeout: 12000ms (src/services/commands/toolJobRegistry.ts)
- Child-job timeout: 180000ms (src/services/commands/toolJobRegistry.ts)
- RAG policy defaults: debounce=600ms, batchSize=12, freshnessTTL=12000ms (src/services/rag/policy.ts)
- P2P notice debounce: 600ms (src/hooks/chat/useP2PChatNotifications.ts)

## Priority Improvement Plan (Overhaul Path)

## Phase 0: Instrumentation first (1-2 days)

Add timing spans around:

- retrieveWorkspaceContext
- ensureWorkspaceIndexed
- provider request start to first token
- tool execution wait (queue/child job)
- conversation persistence duration

Output timing to notebook/activity logs with per-turn IDs.

## Phase 1: Remove the biggest latency blockers (2-4 days)

1. Make retrieval non-blocking for indexing

- In retrieval, do not await full reindex in the request path unless index is missing entirely.
- Serve from last available index and trigger background refresh.

2. Fix queue_new_job timeout behavior

- Mark queue_new_job as spawnsChildJobs=true or assign explicit timeoutMs suitable for multi-step jobs.
- Prefer returning immediate "queued" tool result for long jobs and let UI track progress.

3. Add per-workspace index in-flight dedupe

- Use a Map<workspaceId, Promise<void>> in workspaceIndexer.
- Coalesce concurrent ensureWorkspaceIndexed calls.

## Phase 2: Simplify chat architecture (4-7 days)

1. Consolidate chat entrypoints

- Keep one shared "prepareChatTurn" pipeline:
  - history windowing
  - prompt assembly
  - retrieval injection
  - tool surface selection
  - runChatTurn invocation
- Keep mode toggles (agent/workspace, stream/non-stream) as small option flags only.

2. Unify UI send pipelines

- Introduce a shared hook for send/abort/persist/stream handling used by both ChatPanel and AgentChat.

3. Harden provider tool parsing

- Wrap parseToolUseBlocks JSON parsing with try/catch and safe fallback.

## Phase 3: Throughput and UX improvements (optional but high value)

1. Persist conversations asynchronously

- Buffer and throttle localStorage writes (e.g., every 250-500ms, flush on unload).

2. Scenario-aware tool waiting

- For long-running orchestration commands, return immediate acknowledgement + jobId and continue chat.
- For short read-only commands, continue waiting synchronously.

3. Adaptive RAG policy

- Increase freshness TTL and reduce full reindex frequency.
- Use partial incremental updates (messages/jobs only) instead of full rebuild.

## Proposed Immediate Code Changes (Minimal Risk)

1. queue_new_job timeout correction

- File: src/services/commands/definitions/jobs.ts
- Add spawnsChildJobs: true (or timeoutMs: 180000)

2. Safe tool argument parsing

- File: src/services/ai/providers.ts
- Add try/catch around JSON.parse for OpenAI/OpenRouter tool arguments

3. Index dedupe lock

- File: src/services/rag/workspaceIndexer.ts
- Add in-flight promise map by workspaceId

4. Retrieval non-blocking refresh policy

- File: src/services/rag/retrieval.ts
- Only await ensureWorkspaceIndexed when index is absent; otherwise schedule async refresh

## Phase 1 Status (Implemented)

Completed in current codebase:

1. queue_new_job timeout semantics corrected

- File: src/services/commands/definitions/jobs.ts
- Change: queue_new_job now declares spawnsChildJobs: true so tool wait logic uses child-job timeout policy.

2. Retrieval switched to non-blocking stale refresh

- File: src/services/rag/retrieval.ts
- Change: retrieval blocks only when no index exists; stale/dirty refresh now runs asynchronously.

3. Per-workspace indexing in-flight dedupe added

- File: src/services/rag/workspaceIndexer.ts
- Change: concurrent ensureWorkspaceIndexed calls for the same workspace are coalesced via in-flight promise map.

4. Provider tool-argument parsing hardened

- File: src/services/ai/providers.ts
- Change: malformed OpenAI/OpenRouter tool argument JSON now safely falls back to {} instead of throwing.

5. Lightweight performance instrumentation added

- File: src/services/perf.ts
- File: src/services/ai/runner.ts
- File: src/services/rag/retrieval.ts
- File: src/services/commands/tools.ts
- Change: opt-in perf logs now capture round timing, first-token latency, retrieval/indexing timing mode, and tool execution wait duration.

Enable instrumentation in browser localStorage:

- key: decops:perf-debug
- value: 1

6. Toolkit and command catalogs added to workspace vector index

- File: src/services/rag/workspaceIndexer.ts
- Change: workspace indexing now includes:
  - toolkit documents (id, category, status, descriptions, command lists)
  - command documents (id, description, tags, toolkit membership, arg summary)
- Effect: the model can semantically retrieve toolkit/command knowledge from RAG context before calling discovery tools.

## Validation Strategy

- Add latency benchmark tests for simulated turns with and without indexing refresh.
- Add regression tests for tool timeout behavior on queue_new_job.
- Add test for malformed OpenAI tool argument JSON not crashing parse path.
- Track p50/p95 "time to first token" and "time to assistant final" before/after.

## Summary

Primary reasons chat feels slow are not token rendering. They are pre-token blocking work (RAG indexing), synchronous waiting for long tool/job completion, and timeout configuration mismatches for orchestration commands.

The fastest win is to decouple indexing from request path and fix queue_new_job timeout semantics. The biggest long-term win is unifying duplicate chat pathways into one pipeline with clear mode flags and measurable performance budgets.
