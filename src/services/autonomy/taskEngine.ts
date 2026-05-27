/**
 * Task engine — the autonomous execution loop.
 *
 * Lifecycle of a task:
 * 1. CREATED   → task assigned to an agent
 * 2. PLANNING  → agent AI generates a TaskPlan
 * 3. EXECUTING → agent runs planned actions (commands AND jobs)
 * 4. If blocked → REPLAN with AI chat or DELEGATION or ESCALATION
 * 5. COMPLETED or FAILED
 *
 * Tasks coordinate:
 *   - Jobs (multi-step pipelines via the headless executor)
 *   - Commands (individual units of work via the registry)
 *   - Workspace storage (artifacts and inter-step data)
 *   - AI chat bots (mid-execution reasoning and adaptation)
 *
 * The engine supports recursive delegation: when an agent delegates, the
 * target gets a sub-task that goes through the same lifecycle.
 *
 * NOTE: Implementation split across sibling modules per §3.8 of
 *   MVP_AUDIT_AND_REFACTOR_PLAN.md:
 *     - taskStore.ts       — active-task Map + state-mutation helpers
 *     - taskCreate.ts      — createTask factory + default config
 *     - taskActions.ts     — executeActions + resolveJobDefinition
 *     - taskCapability.ts  — handleCapabilityGaps + role extraction
 *     - taskEngine.ts (this file) — the main executeTask loop + peer helper
 */

import type { Agent, Group, Network } from "@/types";
import { nextEscalation } from "@/types/autonomy";
import type { TaskResult } from "@/types/autonomy";
import type { CommandContext } from "@/services/commands/types";
import { generatePlan } from "./planner";
import { findDelegationTarget, delegationEvent, escalationEvent } from "./delegation";
import { chatDuringTask } from "./taskChat";
import {
  activeTasks,
  updateTask,
  addEvent,
  completeTask,
  failTask,
} from "./taskStore";
import { executeActions } from "./taskActions";
import { handleCapabilityGaps } from "./taskCapability";

// ── Public re-exports (preserve external surface) ────
export {
  activeTasks,
  getTask,
  getAllTasks,
  clearTasks,
  clearAll,
} from "./taskStore";
export { createTask } from "./taskCreate";

// ── Main execution loop ────────────────────────────

/**
 * Execute a task autonomously.
 *
 * This is the core loop: plan → execute actions → handle failures →
 * delegate/escalate → recurse.
 *
 * Returns the final TaskResult.
 */
export async function executeTask(
  taskId: string,
  context: CommandContext,
): Promise<TaskResult> {
  const task = activeTasks.get(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  const agents = [...context.workspace.agents, ...(context.storage._agents || [])];
  const agent = agents.find((a: Agent) => a.id === task.assigneeId);
  if (!agent) throw new Error(`Assignee agent ${task.assigneeId} not found`);

  const groups = context.workspace.groups;
  const networks = context.ecosystem.ecosystem?.networks || [];

  // Initialize task workspace storage on the context so actions/jobs share state
  if (!task.workspaceStorage) task.workspaceStorage = {};
  const taskContext: CommandContext = {
    ...context,
    storage: { ...context.storage, ...task.workspaceStorage },
  };

  // Timeout guard
  const deadline = Date.now() + task.config.taskTimeoutMs;

  let round = 0;
  let escalations = 0;
  let replanAttempts = 0;

  try {
    while (round < task.config.maxRounds && Date.now() < deadline) {
      round++;

      // ── Phase 1: Planning ──
      updateTask(task, "planning");
      const currentAgent = agents.find((a: Agent) => a.id === task.assigneeId) || agent;

      // Get peer agents (same group / same network)
      const peerAgents = gatherPeers(currentAgent, agents, groups, networks);

      addEvent(task, {
        kind: "plan_generated",
        timestamp: new Date().toISOString(),
        agentId: task.assigneeId,
        detail: { round, escalationLevel: task.escalationLevel },
      });

      const plan = await generatePlan(
        currentAgent,
        task.goal,
        task.constraints || [],
        peerAgents,
        taskContext.storage,
        task.config.planningModel,
        taskContext.jobs.getCatalog?.() || [],
      );

      addEvent(task, {
        kind: "plan_generated",
        timestamp: new Date().toISOString(),
        agentId: task.assigneeId,
        detail: {
          analysis: plan.analysis,
          canSelfComplete: plan.canSelfComplete,
          actionCount: plan.actions.length,
          gaps: plan.gaps,
        },
      });

      taskContext.workspace.addLog(
        `🤖 [${currentAgent.name}] Plan (round ${round}): ${plan.canSelfComplete ? `${plan.actions.length} actions` : "needs delegation"} — ${plan.analysis.substring(0, 120)}`,
      );

      // ── Phase 2: Self-execution ──
      if (plan.canSelfComplete && plan.actions.length > 0) {
        updateTask(task, "executing");

        const actionResult = await executeActions(task, plan.actions, taskContext);

        // Sync workspace storage back to the task
        Object.assign(task.workspaceStorage!, taskContext.storage);

        if (actionResult.success) {
          return completeTask(task, actionResult, taskContext);
        }

        // Some actions failed — try AI-assisted re-planning before escalating
        taskContext.workspace.addLog(
          `⚠️ [${currentAgent.name}] Execution had failures: ${actionResult.summary}`,
        );

        if (task.config.allowMidExecutionChat && replanAttempts < task.config.maxReplanAttempts) {
          replanAttempts++;
          const chatResult = await chatDuringTask(task, currentAgent,
            `Execution of ${plan.actions.length} actions had failures: ${actionResult.summary}\n\n` +
            `Partial results: ${JSON.stringify(actionResult.data || {}).substring(0, 500)}\n\n` +
            `Should I re-plan with a different approach, continue with what succeeded, or abort?`,
            {
              actionsSummary: actionResult.summary,
              error: actionResult.summary,
              storageKeys: Object.keys(taskContext.storage).filter(k => !k.startsWith("_")),
            },
          );

          if (chatResult.ok) {
            const response = chatResult.response.toUpperCase();
            if (response.startsWith("REPLAN")) {
              addEvent(task, {
                kind: "replan_requested",
                timestamp: new Date().toISOString(),
                agentId: task.assigneeId,
                detail: { reason: chatResult.response, attempt: replanAttempts },
              });
              taskContext.workspace.addLog(
                `🔄 [${currentAgent.name}] Re-planning (attempt ${replanAttempts}/${task.config.maxReplanAttempts}): ${chatResult.response.substring(0, 120)}`,
              );
              continue; // Loop back to Phase 1
            }
            if (response.startsWith("ABORT")) {
              return failTask(task, `AI recommended abort: ${chatResult.response}`, taskContext);
            }
            // "CONTINUE" or unrecognized — fall through to delegation
          }
        }
      }

      // ── Phase 3: Delegation ──
      if (plan.delegationTarget || !plan.canSelfComplete) {
        const target = plan.delegationTarget || findDelegationTarget(
          task.escalationLevel === "self" ? "group" : task.escalationLevel,
          currentAgent,
          task.goal,
          agents,
          groups,
          networks,
          task.history
            .filter(e => e.kind === "delegated")
            .map(e => e.detail.targetId as string),
        );

        if (target && target.type === "agent") {
          // Direct delegation to another agent
          taskContext.workspace.addLog(
            `🔀 [${currentAgent.name}] Delegating to ${target.targetId}: ${target.reasoning}`,
          );

          addEvent(task, delegationEvent(task.assigneeId, target));

          // Reassign and loop
          task.assigneeId = target.targetId;
          continue;
        }

        if (target && target.type === "group") {
          // Group-level delegation — trigger consensus if needed
          taskContext.workspace.addLog(
            `👥 [${currentAgent.name}] Escalating to group: ${target.reasoning}`,
          );

          // Check for capability gaps that might require new agent creation
          if (plan.gaps && plan.gaps.length > 0 && task.config.allowAgentCreation) {
            const gapResult = await handleCapabilityGaps(
              task, plan.gaps, target.targetId, currentAgent, agents, groups, taskContext,
            );
            if (gapResult) continue; // New agent created, retry
          }
        }

        // ── Phase 4: Escalation ──
        if (escalations < task.config.maxEscalations) {
          const nextLevel = nextEscalation(task.escalationLevel);
          if (nextLevel) {
            escalations++;
            addEvent(task, escalationEvent(
              task.assigneeId,
              task.escalationLevel,
              nextLevel,
              target?.reasoning || "No suitable target at current level",
            ));
            task.escalationLevel = nextLevel;

            taskContext.workspace.addLog(
              `⬆️ Escalating task from ${task.escalationLevel} to ${nextLevel} (escalation ${escalations}/${task.config.maxEscalations})`,
            );
            continue;
          }
        }
      }

      // If we get here without continuing, we're stuck
      if (plan.gaps && plan.gaps.length > 0) {
        taskContext.workspace.addLog(`🔎 Capability gaps identified: ${plan.gaps.join(", ")}`);
      }
      break;
    }

    // Exhausted all rounds or escalations
    return failTask(task, "Exhausted all planning rounds and escalation levels", taskContext);
  } catch (err) {
    return failTask(
      task,
      `Task engine error: ${err instanceof Error ? err.message : String(err)}`,
      taskContext,
    );
  }
}

// ── Peer gathering ─────────────────────────────────

function gatherPeers(
  agent: Agent,
  allAgents: Agent[],
  groups: Group[],
  networks: Network[],
): Agent[] {
  const peers = new Set<string>();

  // Group peers
  const agentGroups = groups.filter((g) => g.members?.includes(agent.id));
  for (const group of agentGroups) {
    for (const mid of group.members) {
      if (mid !== agent.id) peers.add(mid);
    }
  }

  // Network peers
  for (const net of networks) {
    if (net.agents?.some(a => a.id === agent.id)) {
      for (const a of net.agents) {
        if (a.id !== agent.id) peers.add(a.id);
      }
    }
  }

  return allAgents.filter(a => peers.has(a.id));
}
