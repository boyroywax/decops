/**
 * Central reset helper for module-level singletons.
 *
 * The codebase has several services that hold per-user / per-workspace
 * state in module-scoped Maps (taskEngine, agentRuntime, commands/tools).
 * Without an explicit reset, a logout followed by a different user's
 * login — or a workspace switch — leaves the previous session's
 * tasks, inboxes, lifecycle logs, and pending tool-job promises live
 * in memory.
 *
 * `resetRuntimeState()` is the single entry point that wipes them all.
 *
 * Wired into:
 *   - `AuthContext.logout()`
 *   - `useWorkspaceManager.setActiveWorkspaceId()` (on actual change)
 *   - vitest global `afterEach` (via test setup)
 *
 * See §2.1 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */

import { clearAll as clearTaskEngine } from "@/services/autonomy/taskEngine";
import { clearAll as clearAgentRuntime } from "@/services/agentRuntime";
import { clearAll as clearCommandTools } from "@/services/commands/tools";

export function resetRuntimeState(): void {
  clearTaskEngine();
  clearAgentRuntime();
  clearCommandTools();
}
