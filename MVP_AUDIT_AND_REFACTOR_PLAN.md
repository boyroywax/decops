# DECOPS MVP Pre-Release Audit & Refactor Plan

**Date:** 2026-05-26
**Branch:** `feat/helia-ipfs-toolkit`
**Scope:** `src/` (371 files, ~84.6k LOC)
**Goal:** Identify what must be fixed for the MVP cut, what can be deferred to v1.1, and what is acceptable tech debt.

---

## 0. Executive Summary

| Verdict | Detail |
|---|---|
| **Overall MVP risk** | **MEDIUM** — code is functional, but state isolation + a small number of oversized files create avoidable post-launch issues. |
| **Hard blockers** | 1 — module-level `Map`/`Set` singletons that leak across users/tests. |
| **Strong recommendations pre-MVP** | Split `ChatPanel.tsx` (chat is the most-used surface and the biggest risk if it breaks). |
| **Acceptable as tech debt** | Most other >800-LOC files; they are self-contained views. |
| **Already strong** | Error boundaries, promise handling, offline fallback, centralized commands registry, consolidated AI runner. |

---

## 1. Files Over 500 Lines — Inventory

42 source files exceed 500 LOC. The top of the list is the priority list.

| File | LOC | Type | MVP risk | Split priority |
|---|---:|---|---|---|
| [src/toolkits/libp2p/components/Libp2pView.tsx](src/toolkits/libp2p/components/Libp2pView.tsx) | 1630 | View | LOW | P2 |
| [src/components/layout/ChatPanel.tsx](src/components/layout/ChatPanel.tsx) | 1351 | View+Logic | **MEDIUM** | **P1** |
| [src/services/toolkits/types.ts](src/services/toolkits/types.ts) | 1265 | Types | LOW | P3 (declarative) |
| [src/components/views/ToolkitDetailView.tsx](src/components/views/ToolkitDetailView.tsx) | 1104 | View | LOW | P2 |
| [src/toolkits/studio/components/StudioView.tsx](src/toolkits/studio/components/StudioView.tsx) | 1022 | View | LOW | P2 |
| [src/toolkits/editor/EditorView.tsx](src/toolkits/editor/EditorView.tsx) | 1000 | View | LOW | P2 |
| [src/toolkits/orbitdb/service.ts](src/toolkits/orbitdb/service.ts) | 994 | Service | MEDIUM | P2 |
| [src/toolkits/studio/components/StepCardModal.tsx](src/toolkits/studio/components/StepCardModal.tsx) | 928 | Modal | LOW | P2 |
| [src/components/views/SystemView.tsx](src/components/views/SystemView.tsx) | 924 | View | MEDIUM-LOW | P2 |
| [src/components/views/AgentDetailView.tsx](src/components/views/AgentDetailView.tsx) | 887 | View | LOW | P2 |
| [src/toolkits/libp2p/service.ts](src/toolkits/libp2p/service.ts) | 886 | Service | MEDIUM | P2 |
| [src/toolkits/orbitdb-server/components/OrbitdbServerView.tsx](src/toolkits/orbitdb-server/components/OrbitdbServerView.tsx) | 868 | View | LOW | P3 |
| [src/toolkits/libp2p/commands/index.ts](src/toolkits/libp2p/commands/index.ts) | 862 | Commands | LOW | P3 |
| [src/components/views/AieosEditor.tsx](src/components/views/AieosEditor.tsx) | 839 | View | LOW | P3 |
| [src/services/autonomy/taskEngine.ts](src/services/autonomy/taskEngine.ts) | 830 | Service | **HIGH** (module state) | **P1** |
| [src/toolkits/kubo/components/KuboView.tsx](src/toolkits/kubo/components/KuboView.tsx) | 822 | View | LOW | P3 |
| [src/components/layout/AuthenticatedApp.tsx](src/components/layout/AuthenticatedApp.tsx) | 819 | Layout | MEDIUM | P2 |
| [src/toolkits/orbitdb-server/service.ts](src/toolkits/orbitdb-server/service.ts) | 780 | Service | LOW | P3 |
| [src/hooks/useJobExecutor.tsx](src/hooks/useJobExecutor.tsx) | 766 | Hook | MEDIUM | P2 |
| [src/toolkits/kubo/service.ts](src/toolkits/kubo/service.ts) | 743 | Service | LOW | P3 |
| [src/toolkits/helia/service.ts](src/toolkits/helia/service.ts) | 736 | Service | LOW | P3 |
| [src/services/commands/definitions/autonomy.ts](src/services/commands/definitions/autonomy.ts) | 735 | Commands | LOW | P3 |
| [src/toolkits/orchestrator/service.ts](src/toolkits/orchestrator/service.ts) | 716 | Service | LOW | P3 |
| [src/toolkits/studio/components/NodeEditModal.tsx](src/toolkits/studio/components/NodeEditModal.tsx) | 702 | Modal | LOW | P3 |
| [src/services/commands/tools.ts](src/services/commands/tools.ts) | 698 | Bridge | MEDIUM | P2 |
| [src/services/commands/definitions/meta.ts](src/services/commands/definitions/meta.ts) | 672 | Commands | LOW | P3 |
| [src/toolkits/helia/components/HeliaView.tsx](src/toolkits/helia/components/HeliaView.tsx) | 634 | View | LOW | P3 |
| [src/toolkits/studio/components/JobCanvas.tsx](src/toolkits/studio/components/JobCanvas.tsx) | 631 | View | LOW | P3 |
| [src/toolkits/orbitdb/commands/index.ts](src/toolkits/orbitdb/commands/index.ts) | 629 | Commands | LOW | P3 |
| [src/types/index.ts](src/types/index.ts) | 616 | Types | LOW | P3 (declarative) |
| [src/services/commands/dryRun.ts](src/services/commands/dryRun.ts) | 607 | Service | LOW | P3 |
| [src/toolkits/orbitdb/components/OrbitdbView.tsx](src/toolkits/orbitdb/components/OrbitdbView.tsx) | 589 | View | LOW | P3 |
| [src/components/actions/CommandCardModal.tsx](src/components/actions/CommandCardModal.tsx) | 585 | Modal | LOW | P3 |
| [src/components/views/AgentsView.tsx](src/components/views/AgentsView.tsx) | 582 | View | LOW | P3 |
| [src/utils/aieos.ts](src/utils/aieos.ts) | 565 | Util | LOW | P3 |
| [src/components/views/MessagesView.tsx](src/components/views/MessagesView.tsx) | 562 | View | LOW | P3 |
| [src/components/actions/UnifiedBuilder.tsx](src/components/actions/UnifiedBuilder.tsx) | 555 | View | LOW | P3 |
| [src/components/layout/LLMManager.tsx](src/components/layout/LLMManager.tsx) | 552 | Layout | LOW | P3 |
| [src/toolkits/studio/components/NodeEditor.tsx](src/toolkits/studio/components/NodeEditor.tsx) | 549 | View | LOW | P3 |
| [src/services/ai/runner.ts](src/services/ai/runner.ts) | 534 | Service | LOW (recently consolidated) | — |
| [src/components/layout/ArtifactsPanel.tsx](src/components/layout/ArtifactsPanel.tsx) | 533 | Layout | LOW | P3 |
| [src/components/actions/CommandPrompt.tsx](src/components/actions/CommandPrompt.tsx) | 502 | View | LOW | P3 |
| [src/components/layout/Footer.tsx](src/components/layout/Footer.tsx) | 501 | Layout | LOW | P3 |

**Priority legend**
- **P1** = pre-MVP. Touches hot-path or has correctness risk.
- **P2** = v1.1. Maintenance pain but not user-visible.
- **P3** = backlog. Cosmetic / declarative / already isolated.

---

## 2. P1 — Must Address Before MVP

### 2.1 Module-level state singletons (HIGH RISK)

Seven `Map`/`Set` objects live at module scope and persist for the life of the JS context. They leak across logout, across tests, and (in any future multi-user scenario) across users.

| File | Symbol | Type |
|---|---|---|
| [src/services/autonomy/taskEngine.ts](src/services/autonomy/taskEngine.ts) ~L45 | `activeTasks` | `Map<string, AgentTask>` |
| [src/services/agentRuntime.ts](src/services/agentRuntime.ts) ~L22-L24 | `runtimeStates`, `inboxes`, `lifecycleLogs` | 3× `Map` |
| [src/services/automations/registry.ts](src/services/automations/registry.ts) ~L4 | `registry` | `Map<string, AutomationDefinition>` |
| [src/services/commands/tools.ts](src/services/commands/tools.ts) ~L57 | `pendingToolJobs` | `Map<string, PendingToolJob>` |

**Fix plan (small, low-risk):**

1. Add a `clearAll()` export to each module.
2. Call them from a new `resetRuntimeState()` helper in `src/services/runtime.ts`.
3. Invoke `resetRuntimeState()` on:
   - `useAuth.logout()`
   - `useWorkspaceManager.switchWorkspace()`
   - vitest `afterEach` global hook (test-store-helpers.ts)
4. Add a unit test confirming `clearAll()` empties each store.

**Estimated effort:** 0.5 day. Single PR. No API surface changes.

---

### 2.2 Split `ChatPanel.tsx` (1351 LOC, primary user surface)

ChatPanel is the most-used component in the product. It is also the file most frequently changed (memory, mentions, editor preview, jobs all landed here in the past two days). Concentration of churn + size = elevated regression risk for MVP.

**Current sections (approximate):**

| Lines | Section |
|---|---|
| 1–90 | Imports, context wiring |
| 90–230 | `useConversations` integration, refs, layout overrides |
| 230–400 | Activity heartbeat, focus/scroll effects, agent welcome handling |
| 400–550 | P2P (`libp2p`/`helia`/`orbitdb`) subscribers + debounced notifications |
| 550–850 | `send()` — CLI interception, mention routing, workspace chat dispatch, streaming callbacks |
| 850–920 | `@mention` autocomplete logic, pinned-chip management |
| 920–1100 | Header + body branches (conversations / memories / chat) |
| 1100–1351 | Input bar, command prompt, bot menu, footer controls |

**Proposed split:**

```
src/components/layout/ChatPanel.tsx        (~250 LOC — orchestration only)
src/components/chat/
  ChatHeader.tsx                            (~120) Conversations/Memories/New/Expand/Close
  ChatBody.tsx                              (~200) Branch selector + messages list
  ChatInputBar.tsx                          (~250) Input, pinned chips, send button
  ChatMentionPicker.tsx                     (~120) Autocomplete popup
  BotMenu.tsx                               (~150) Agent picker dropdown
src/hooks/chat/
  useChatSend.ts                            (~200) send() pipeline
  useP2PChatNotifications.ts                (~150) libp2p/helia/orbitdb diff → toast
  usePinnedMentions.ts                      (~80)  Chip state + insertion
  useChatScroll.ts                          (~60)  Endref + initial scroll
```

The orchestration component stays in `layout/` because routing/layout context wiring belongs there. Everything reusable moves under `components/chat/` (where `editorPreview.ts`, `MemoriesPanel.tsx`, `types.ts` already live).

**Estimated effort:** 1.5 days. Recommend a single PR with snapshot vitest run before/after to detect regressions. All 556 tests must continue passing.

---

## 3. P2 — v1.1 Refactors

### 3.1 `Libp2pView.tsx` (1630 LOC)
Sections: identity, networks (pnet), peer discovery, bootstrap config, activity log. Split into 6 panel components under `src/toolkits/libp2p/components/panels/`. Self-contained; touching anything else is unlikely.

### 3.2 `StudioView.tsx` + `JobCanvas.tsx` + `StepCardModal.tsx`
Already partly factored. Extract `useStudioDraft.ts` (localStorage autosave) and `useStudioJobBuilder.ts` (serialization). Draft loss on tab close is the only correctness risk; covered by current autosave but lacks tests.

### 3.3 `SystemView.tsx` (924 LOC)
Tabs are independent — process / queue / history / config. Each tab can be its own file. Timeline rendering (currently inline) should become `JobTimeline.tsx`.

### 3.4 `AuthenticatedApp.tsx` (819 LOC)
Holds error boundaries + routing + dock state. Pull the dock/layout shell into `AppShell.tsx`; keep auth/error logic in `AuthenticatedApp.tsx`.

### 3.5 `useJobExecutor.tsx` (766 LOC)
Hook contains job dispatch, polling, abort, retry, and result fan-out in one file. Split into:
- `useJobExecutor.ts` — public hook, ~200 LOC
- `jobExecutorPoll.ts` — polling loop
- `jobExecutorDispatch.ts` — start/abort/retry helpers

### 3.6 `services/commands/tools.ts` (698 LOC)
The bridge between command registry and AI tool format. Has the dark-agent filter, the pending-jobs map (already P1), and the schema converter. Once `pendingToolJobs` is moved out, file should drop to ~500 LOC naturally.

### 3.7 `toolkits/orbitdb/service.ts` & `toolkits/libp2p/service.ts`
Both contain start/stop lifecycle + every command handler in one file. Extract command handlers into a `commands/handlers/` directory parallel to existing `commands/index.ts` (which is just registration).

### 3.8 `taskEngine.ts` (830 LOC) — bundled with P1
After `clearAll()` is added, also extract scoring / scheduling / dispatch into three sibling files.

---

## 4. P3 — Backlog

Declarative files (types, command definitions, large modals) are fine at >500 LOC because the cognitive load is low. Leave alone until they actually break something:

- `services/toolkits/types.ts`, `types/index.ts` — pure type declarations.
- `services/commands/definitions/{autonomy,meta}.ts` — declarative command lists.
- `toolkits/*/commands/index.ts` — declarative command lists.
- `AieosEditor.tsx`, `NodeEditor.tsx`, `NodeEditModal.tsx`, `StepCardModal.tsx`, `CommandCardModal.tsx` — leaf modals with no downstream dependencies.

---

## 5. Bugs, Redundancy & Failed Logic

### 5.1 Positive findings (no action)

- **No `TODO`/`FIXME`/`HACK` comments** in `src/`. Excellent.
- **AI runner already consolidated.** `src/services/ai/runner.ts` was the consolidation target for five previously-duplicate chat loops. No duplication remains across `chat.ts` / `streaming.ts` / `runner.ts` — they are clearly layered.
- **Error boundaries present** in [ViewSwitcher.tsx](src/components/layout/ViewSwitcher.tsx) (~L353-L407) and [AuthenticatedApp.tsx](src/components/layout/AuthenticatedApp.tsx) (~L726).
- **Promise handling sound.** 13 `.catch()` patterns audited; no unhandled chains.
- **Offline fallbacks present** for CREDEBL email/OOB/OID4VCI paths.

### 5.2 Console noise (LOW, but visible)

46 `console.*` calls remain in production paths. Recommended migrations:

| File | Count | Migration |
|---|---:|---|
| [src/services/logging/backends.ts](src/services/logging/backends.ts) | 12 | Keep — these are the logging fallback of last resort. |
| [src/services/credebl/emailValidation.ts](src/services/credebl/emailValidation.ts) | 4 | `console.warn` → `logError({source:"credebl-email"})` |
| [src/services/credebl/did.ts](src/services/credebl/did.ts) | 4 | `console.log` → `logAudit({source:"credebl-did"})` |
| [src/hooks/useLocalStorage.ts](src/hooks/useLocalStorage.ts) | 7 | `console.warn` quota messages → `logError({source:"local-storage"})` |

**Effort:** 1 hour. P2 (post-MVP).

### 5.3 Type evasions (MEDIUM)

- **28 `as any` usages** in production code. Most are Credo SDK introspection (`Repository`, internal modules) where no typedef exists.
- **15 `@ts-ignore` / `@ts-expect-error`** — all in Credo / mdoc / SD-JWT integration code.

**Action for MVP:** Pin Credo version in `package.json` so an upstream change can't silently break the casts. Add a 1-line JSDoc to each cast explaining the reason. **Don't** try to eliminate them.

### 5.4 `react-hooks/exhaustive-deps` exemptions

A handful of effects intentionally omit dependencies. These are correct but undocumented:

- [src/hooks/useJobs.ts](src/hooks/useJobs.ts) ~L67 — "run-once on mount"
- [src/hooks/useRouteSync.ts](src/hooks/useRouteSync.ts) ~L149,L160,L175 — route sync
- [src/hooks/useLocalStorage.ts](src/hooks/useLocalStorage.ts) ~L93 — storage cross-tab sync
- [src/components/layout/ChatPanel.tsx](src/components/layout/ChatPanel.tsx) `send()` dep array — `editorActive`/`editorApi` intentionally excluded (TS2448 hazard)

**Action:** add a 1-line comment above each `// eslint-disable-next-line react-hooks/exhaustive-deps` describing why. **Effort:** 15 minutes. **P1-quick.**

### 5.5 Redundancy — none of substance found

Specifically checked:
- `src/services/ai/{chat,streaming,runner}.ts` — clean three-layer split (sync wrapper / streaming wrapper / unified runner). No duplication.
- `src/services/commands/{registry,tools,definitions}.ts` — registry holds definitions, tools.ts is the AI-format bridge, definitions are the declarative source. No duplication.
- `src/toolkits/*/service.ts` — each is its own libp2p/helia/orbitdb/kubo lifecycle. Repeating patterns are legitimate (each runtime has its own start/stop/peers/dial semantics). Could share a `BaseToolkitService` abstract class but the gain is small.

### 5.6 Memory / lifecycle concerns

- **`useStreamingChatState`** maintains pending text and tool-call accumulators. No cleanup on unmount inspected. **Action:** add a `useEffect(() => () => abort(), [])` guard in the hook. **Effort:** 30 minutes. **P1-quick.**
- **P2P subscriptions in ChatPanel** use refs + debounce. Works but fragile. Defer to ChatPanel split (§2.2) where this becomes `useP2PChatNotifications.ts` with a clean teardown.

### 5.7 Direct localStorage access

27 direct `localStorage.*` calls outside `useLocalStorage()`. All are in stores that intentionally bypass React (Zustand persistence, agent IDs, layout overrides). Acceptable.

---

## 6. MVP Go/No-Go Checklist

### Must do before tagging v1.0

- [ ] **§2.1** — Add `clearAll()` to `taskEngine`, `agentRuntime`, `automations/registry`, `commands/tools`; wire into `logout()` and `switchWorkspace()`.
- [ ] **§2.2** — Split `ChatPanel.tsx` into the proposed 9 files; keep all 556 tests green.
- [ ] **§5.4** — Comment every `eslint-disable react-hooks/exhaustive-deps` with a one-line rationale.
- [ ] **§5.6** — Add unmount cleanup to `useStreamingChatState`.
- [ ] Pin Credo version in `credebl-credo-controller/package.json` (insurance for §5.3).

**Estimated total effort: 2.5–3 engineer-days.**

### Should do, can slip to v1.1

- [ ] §3 P2 splits, especially `useJobExecutor`, `SystemView`, `Libp2pView`.
- [ ] §5.2 Console → structured logging migration.
- [ ] §5.3 JSDoc for each `as any` / `@ts-ignore`.

### Backlog (don't touch unless they break)

- [ ] P3 file splits.
- [ ] Move P2P state from refs to Zustand store.
- [ ] Unused-exports ESLint plugin + cleanup pass.

---

## 7. Risk Register

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Module Maps leak across workspace switch → wrong jobs surfaced | HIGH | HIGH | §2.1 `clearAll()` |
| R2 | ChatPanel regression during feature additions (next 30 days) | MEDIUM | HIGH | §2.2 split + tests |
| R3 | Credo internal API change breaks `as any` casts | LOW | HIGH | Pin Credo version |
| R4 | localStorage quota in private browsing silently fails | LOW | MEDIUM | Already handled (§5.2 cleanup) |
| R5 | useStreamingChatState leaks accumulator on rapid remount | LOW | LOW | §5.6 unmount cleanup |
| R6 | Large views slow first paint of detail pages | LOW | LOW | Defer; lazy-import per-toolkit views (P2) |

---

## 8. One-week MVP-readiness sprint plan

| Day | Work |
|---|---|
| 1 | §2.1 module state isolation + tests; §5.4 deps comments; §5.6 streaming cleanup. |
| 2 | §2.2 ChatPanel extraction — `ChatHeader`, `ChatInputBar`, `ChatMentionPicker`. |
| 3 | §2.2 continued — `useChatSend`, `useP2PChatNotifications`, full vitest sweep. |
| 4 | Manual smoke test of chat + memory + mentions + editor preview + jobs end-to-end. Bugfix. |
| 5 | Pin Credo, regression test, release candidate cut. |

After this, MVP is releasable. Everything in §3 and §5.2/§5.3 is backlog for v1.1.

---

*Generated by automated audit + manual review. Findings reflect the state of `feat/helia-ipfs-toolkit` at HEAD `4f7979b`.*
