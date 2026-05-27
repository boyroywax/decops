/**
 * Task store — module-level active-task Map and state-mutation helpers.
 *
 * Split from taskEngine.ts per §3.8 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
import type { CommandContext } from "@/services/commands/types";
import type { AgentTask, TaskEvent, TaskResult } from "@/types/autonomy";

// ── Task store (module-level, lives for the session) ─────────

export const activeTasks = new Map<string, AgentTask>();

export function getTask(id: string): AgentTask | undefined {
  return activeTasks.get(id);
}

export function getAllTasks(): AgentTask[] {
  return Array.from(activeTasks.values());
}

export function clearTasks(): void {
  activeTasks.clear();
}

/**
 * Reset all module-level state. Called by `resetRuntimeState()` on logout
 * and workspace-switch to prevent task leakage across users/workspaces.
 * See §2.1 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
export function clearAll(): void {
  activeTasks.clear();
}

// ── Task state helpers ─────────────────────────────

export function updateTask(task: AgentTask, status: AgentTask["status"]): void {
  task.status = status;
  task.updatedAt = new Date().toISOString();
}

export function addEvent(task: AgentTask, event: TaskEvent): void {
  task.history.push(event);
  task.updatedAt = new Date().toISOString();
}

export function completeTask(
  task: AgentTask,
  result: TaskResult,
  context: CommandContext,
): TaskResult {
  updateTask(task, "completed");
  task.result = result;
  addEvent(task, {
    kind: "completed",
    timestamp: new Date().toISOString(),
    agentId: task.assigneeId,
    detail: { summary: result.summary },
  });

  context.workspace.addLog(`✅ Task completed: ${result.summary}`);

  // Produce deliverable
  context.addDeliverable({
    key: `task-result-${task.id}`,
    name: `Task: ${task.goal.substring(0, 50)}`,
    type: "json",
    content: JSON.stringify({
      taskId: task.id,
      goal: task.goal,
      status: "completed",
      result,
      escalationLevel: task.escalationLevel,
      rounds: task.history.filter(e => e.kind === "plan_generated").length,
      history: task.history,
    }, null, 2),
    tags: ["autonomy", "task-result"],
  });

  return result;
}

export function failTask(
  task: AgentTask,
  reason: string,
  context: CommandContext,
): TaskResult {
  const result: TaskResult = {
    success: false,
    summary: reason,
    resolvedBy: task.assigneeId,
  };
  updateTask(task, "failed");
  task.result = result;
  addEvent(task, {
    kind: "failed",
    timestamp: new Date().toISOString(),
    agentId: task.assigneeId,
    detail: { reason },
  });

  context.workspace.addLog(`❌ Task failed: ${reason}`);

  // Still produce a deliverable with the failure report
  context.addDeliverable({
    key: `task-result-${task.id}`,
    name: `Task (failed): ${task.goal.substring(0, 50)}`,
    type: "json",
    content: JSON.stringify({
      taskId: task.id,
      goal: task.goal,
      status: "failed",
      result,
      escalationLevel: task.escalationLevel,
      history: task.history,
    }, null, 2),
    tags: ["autonomy", "task-result", "failed"],
  });

  return result;
}
