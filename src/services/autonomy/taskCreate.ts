/**
 * Task creation — factory + default autonomy config.
 *
 * Split from taskEngine.ts per §3.8 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
import type { AgentTask, AutonomyConfig } from "@/types/autonomy";
import { activeTasks } from "./taskStore";

export function createTask(
  goal: string,
  assigneeId: string,
  createdBy: string,
  constraints?: string[],
  config?: Partial<AutonomyConfig>,
  parentTaskId?: string,
): AgentTask {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  // Import default config inline to avoid circular import issues
  const defaultConfig: AutonomyConfig = {
    maxRounds: 12,
    maxEscalations: 3,
    allowSubTasks: true,
    allowJobCreation: true,
    allowAgentCreation: true,
    autoExecuteConsensus: false,
    maxConcurrentSubTasks: 4,
    taskTimeoutMs: 5 * 60 * 1000,
    maxReplanAttempts: 2,
    allowMidExecutionChat: true,
  };

  const task: AgentTask = {
    id,
    goal,
    constraints,
    createdBy,
    assigneeId,
    escalationLevel: "self",
    history: [{
      kind: "created",
      timestamp: now,
      agentId: createdBy,
      detail: { goal, assigneeId, constraints },
    }],
    status: "pending",
    parentTaskId,
    childTaskIds: [],
    config: { ...defaultConfig, ...config },
    createdAt: now,
    updatedAt: now,
    workspaceStorage: {},
    chatHistory: [],
  };

  activeTasks.set(id, task);
  return task;
}
