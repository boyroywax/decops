# Codebase Gap Analysis — decops

**Date:** 2026-05-12
**Branch:** `feat/libp2p-toolkit`
**Scope:** Full audit of `src/` covering architecture, testing, types, performance, errors, theme, security, docs, jobs, and build.

---

## Executive Summary

The codebase has matured into a multi-toolkit workspace, but several systemic gaps remain. The most urgent issues are **concurrency safety in the job executor**, **RBAC enforcement**, **type-safety regression** (~294 `any` usages in `src/hooks` + `src/services`), and **inconsistent toolkit registration patterns**. Testing coverage is partial (34 test files) but key runtime paths (`useJobExecutor`, `runChatTurn`, streaming) remain untested.

### Severity Counts
| Severity | Count |
|----------|-------|
| High     | 6     |
| Medium   | 9     |
| Low      | 5     |

---

## 1. Architectural Inconsistencies

### 1.1 Toolkit Registration Patterns Diverge — **HIGH**
- **Files:** `src/toolkits/architect/register.ts`, `src/toolkits/libp2p/register.ts`, `src/toolkits/studio/register.ts`, `src/toolkits/editor/`, `src/toolkits/image-gen/`
- **Problem:** Three different registration styles coexist:
  - Hook-based: `useRegisterLibp2pChatAgent.ts` (re-runs on mount)
  - Module side-effect: `register.ts` (registered at import time)
  - Barrel re-exports without explicit registration
- **Impact:** Hard to reason about lifecycle, double-registration risk, race on HMR.
- **Fix:** Adopt a single contract — e.g. `defineToolkit({ id, register })` invoked from a central `toolkits/index.ts`. Document in `docs/TOOLKIT_CONTRACT.md`.

### 1.2 Bot Bypass of Shared Pipeline — **HIGH (PARTIALLY FIXED)**
- **Files:** Recently fixed in `src/toolkits/libp2p/useRegisterLibp2pChatAgent.ts`; still verify `studio`, `editor`.
- **Problem:** Toolkits historically attached a custom `onSubmit` that bypassed `streamChatWithWorkspace` and its `ThinkingIndicator` UI.
- **Status:** libp2p now flows through the unified pipeline (commit `021e048`).
- **Remaining:** Audit `studioBot.ts`, `editor` for similar custom dispatchers; ensure all bots register a `ChatDelegation` rather than an `onSubmit`.

### 1.3 Two Workspace Context Sources — **MEDIUM**
- **Files:** `src/context/CommandContextProvider.tsx`, `src/context/WorkspaceContext.tsx`
- **Problem:** Some commands read from `CommandContext.workspace`, others import hooks directly. Stale snapshot risk in `send_message`.
- **Fix:** Make `CommandContext` the single source of truth for command-time state; expose `getMessages()` getters rather than snapshots.

---

## 2. Testing Gaps

### 2.1 Critical Runtime Paths Untested — **HIGH**
- **Untested:**
  - `src/hooks/useJobExecutor.tsx` (the central job orchestrator)
  - `src/services/ai/runner.ts` (`runChatTurn`)
  - `src/services/ai/streaming.ts` (`streamChatWithWorkspace`)
  - `src/services/ai/delegation.ts`
  - `src/toolkits/libp2p/libp2pBot.ts`, `src/toolkits/studio/studioBot.ts`
- **Current coverage:** 34 test files concentrated in `src/test/services/commands/*` and `src/test/services/autonomy/*`.
- **Fix:** Add executor concurrency tests (multiple jobs racing slots), tool-loop tests, delegation routing tests. Target ≥ 60% line coverage on `src/services/ai/` and `src/hooks/useJobExecutor.tsx`.

### 2.2 No E2E / Integration Tests for Chat UI — **MEDIUM**
- **Problem:** `ChatPanel.tsx` (~1000 LOC) has no Playwright/Cypress tests covering the submit flow, slash commands, @mentions, or streaming.
- **Fix:** Add a Playwright smoke suite covering: send message → tool call → streaming token → final commit.

---

## 3. Type Safety Gaps — **HIGH**

### 3.1 `any` Proliferation
- **Count:** 294 occurrences of `: any` / `as any` in `src/hooks` + `src/services`.
- **Hot spots:**
  - `src/hooks/useJobExecutor.tsx` — `jobs: any[]`, `addJob: any`, `updateJobStatus: any` props
  - `src/services/commands/tools.ts` — tool input/result typed as `any`
  - `src/services/ai/streaming.ts` — `messages: any[]`
- **Fix:**
  - Export proper types from `useJobs`, `useNotebook`, etc. and use them in `useJobExecutor`.
  - Define a generic `ToolResult<T>` and `ToolInput<T extends ToolSchema>`.
  - Enable `noImplicitAny` (already in `tsconfig.json`?) and gradually fix.

### 3.2 Missing Discriminated Unions for Job States
- **File:** `src/types/jobs.ts` (or wherever `Job` is defined)
- **Problem:** `job.status` is a string union, but `result` is `any` for all states.
- **Fix:** Use discriminated union: `{ status: "completed"; result: T } | { status: "failed"; error: string }`.

---

## 4. Performance & Concurrency Gaps

### 4.1 Job Executor Race Conditions — **HIGH**
- **File:** `src/hooks/useJobExecutor.tsx`
- **Problem:** `processingRef.current` (a `Set`) is mutated inside fire-and-forget async IIFEs. Concurrent React effect re-runs can read stale `jobs` snapshots and over-allocate slots.
- **Fix:**
  - Wrap slot management in a proper async lock / queue (e.g. `p-limit`).
  - Move job state into a Zustand store keyed by `id` so reads are atomic.
  - Add an integration test that queues 20 jobs and asserts `MAX_CONCURRENT_JOBS` is never exceeded.

### 4.2 Latency Fixes Applied (commit `021e048`) — **DONE**
- 1000ms polling now triggers immediately on state change.
- Artificial `setTimeout(300ms)` removed from `create_agent`.
- 50–250ms simulated network latency removed from `agent_health_check`.

### 4.3 Remaining Polling Fallback — **LOW**
- The `setInterval(processJobs, 1000)` is still a fallback. Consider removing entirely once state-change-driven invocation is verified for all queueing paths.

### 4.4 Topology Retry Loop — **MEDIUM**
- **File:** `src/services/commands/definitions/topology.ts` lines 60–80
- **Problem:** 30 attempts × 500ms = 15s worst-case wait inside a tool execution; blocks the chat round.
- **Fix:** Use exponential backoff with a much shorter ceiling (e.g. 5s); or push the wait into a separate orchestration step the LLM can re-poll.

---

## 5. Error Handling Gaps

### 5.1 Silent `catch` Blocks — **MEDIUM**
- ~18 catch blocks that swallow errors without logging or surfacing to the user.
- **Files:** scattered across `src/components/`, `src/hooks/`, `src/services/`
- **Fix:** Create a `logError(context, err)` utility that captures the context name, stack, and forwards to the workspace log + a future telemetry sink.

### 5.2 Stream Error Channel Underused — **LOW**
- Several agent `onSubmit` paths (legacy) called `stream.error(msg)` but didn't update the conversation. Standard pipeline handles this; verify all delegations route through `streamChatWithWorkspace`.

---

## 6. Theme / UI Consistency Gaps

### 6.1 Hardcoded Colors — **MEDIUM**
- **Files:** `src/toolkits/libp2p/styles/libp2p.css` (partially fixed for solar tabs/radio in commit `021e048`); `src/toolkits/studio/styles/`, `src/toolkits/editor/styles/`
- **Problem:** Many components hard-code `#1e293b`, `#94a3b8`, etc. instead of CSS variables. Solar/light themes inherit dark colors.
- **Fix:** Replace remaining literals with `var(--bg-surface, …)`, `var(--text-secondary, …)`, etc. Run `grep -rn "background: #" src/toolkits/*/styles` to enumerate remaining instances.

### 6.2 Accessibility — **MEDIUM**
- **Problem:** Many icon-only buttons lack `aria-label`. Modals don't trap focus consistently.
- **Fix:** Add a11y lint rule, audit `IconButton` usage, ensure `Libp2pBotModal`, `JobInputPromptModal` use a shared `Dialog` with focus-trap.

---

## 7. Security Gaps

### 7.1 RBAC Not Enforced — **HIGH**
- **File:** `src/services/commands/registry.ts`
- **Problem:** `CommandDefinition.rbac` arrays exist but `registry.execute()` doesn't validate the caller's role.
- **Fix:**
  - Add a `currentUser.role` check before invoking `execute`.
  - Throw a typed `RBACDenied` error and surface to user.
  - Test with a non-`builder` user attempting `deploy_network`.

### 7.2 Identity Export Auditing — **MEDIUM**
- **File:** `src/toolkits/libp2p/libp2pBot.ts` — `interceptToolCall` blocks export when not user-initiated, good, but no audit log is written when an export does proceed.
- **Fix:** Append every identity export to `workspace.addLog()` with timestamp and node id.

### 7.3 XSS Risk in Editor — **MEDIUM**
- **File:** `src/toolkits/editor/EditorView.tsx`
- **Problem:** If preview renders user/LLM markdown, ensure sanitization (DOMPurify or markdown-it-safe).
- **Fix:** Confirm all rendering uses `react-markdown` with safe defaults, and avoid `dangerouslySetInnerHTML`.

---

## 8. Documentation Gaps — **LOW**

- **Missing:** ADRs (Architecture Decision Records) for: toolkit contract, chat-delegation model, job lifecycle, theme tokens.
- **Missing:** Top-level `docs/ARCHITECTURE.md` mapping `services/` → `hooks/` → `components/`.
- **Sparse JSDoc:** `src/services/ai/runner.ts`, `src/services/commands/tools.ts`.
- **Fix:** Add `docs/` index, write 5 short ADRs.

---

## 9. Job / Command System Gaps

### 9.1 Missing Tool Output Schemas — **MEDIUM**
- Many `CommandDefinition` entries lack `outputSchema`. The LLM cannot reliably chain tools that don't declare what they return.
- **Fix:** Add minimal `outputSchema` to every tool that returns structured data (target `src/services/commands/definitions/*.ts`).

### 9.2 Command Timeout Inconsistency — **MEDIUM**
- **File:** `src/services/commands/tools.ts`
- **Problem:** Tool-job wait uses `TOOL_JOB_TIMEOUT_MS = 30s` / `JOB_RUNNER_TIMEOUT_MS = 180s`. No per-command override; long-running commands like `deploy_network` rely on the runner allowlist.
- **Fix:** Add an optional `timeoutMs` field on `CommandDefinition`; default to 30s, allow per-tool override.

### 9.3 `JOB_RUNNER_COMMANDS` Allowlist Is Stale — **LOW**
- Currently only `["studio_run_job", "studio_create_job"]`. `deploy_network` likely also spawns child jobs and may hit the 30s timeout.
- **Fix:** Replace allowlist with `command.spawnsChildJobs: true` flag.

---

## 10. Dependency / Build Gaps — **LOW**

- **Unused imports** sprinkled across UI files (no `ts-prune` in CI).
- **No bundle-size budget** — Vite build outputs not size-checked.
- **No `--strict` enforcement check** in CI.
- **Fix:** Add `ts-prune`, `size-limit`, and a `tsc --noEmit --strict` step to a GH Actions workflow.

---

## Prioritized Action Plan

### Phase 1 — Stability (1 sprint)
1. [HIGH] Add concurrency tests for `useJobExecutor.tsx`; fix race on slot allocation.
2. [HIGH] Enforce RBAC in `registry.execute()`.
3. [HIGH] Audit remaining bots (studio, editor) for bypass patterns; route everything through `streamChatWithWorkspace`.

### Phase 2 — Quality (1 sprint)
4. [HIGH] Type-safety: introduce `Job<T>`, `ToolResult<T>`; eliminate `any` in `useJobExecutor`, `tools.ts`, `streaming.ts`.
5. [MEDIUM] Add tests for `runChatTurn`, `streamChatWithWorkspace`, delegation routing.
6. [MEDIUM] Replace hardcoded colors in remaining toolkit CSS with vars.
7. [MEDIUM] Add per-command `timeoutMs` + `spawnsChildJobs` flag.

### Phase 3 — Polish (½ sprint)
8. [MEDIUM] Centralized `logError` utility; replace silent catches.
9. [MEDIUM] Identity export audit log; verify editor sanitization.
10. [LOW] ADRs, bundle-size budget, `ts-prune` in CI.

---

## Appendix — Quick Verification Commands

```bash
# Count any usages in services/hooks
grep -rn ": any\|as any" src/hooks src/services | wc -l    # current: 294

# Find hardcoded colors in toolkits
grep -rn "background: #\|color: #" src/toolkits/*/styles

# Find silent catches
grep -rn "catch.*{}\|catch.*{ *}" src

# List tests
find src/test -name "*.test.*" | wc -l                      # current: 34
```
