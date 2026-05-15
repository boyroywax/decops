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
 */

import type { Agent, Group, Network } from "@/types";
import type {
  AgentTask,
  TaskEvent,
  TaskResult,
  TaskPlan,
  PlannedAction,
  AutonomyConfig,
  EscalationLevel,
  ConsensusProposal,
  AgentSpec,
} from "@/types/autonomy";
import { nextEscalation } from "@/types/autonomy";
import type { CommandContext } from "@/services/commands/types";
import { registry } from "@/services/commands/registry";
import { generatePlan } from "./planner";
import { findDelegationTarget, buildDelegationRequest, delegationEvent, escalationEvent } from "./delegation";
import { identifyGaps } from "./capability";
import { deliberate, buildAgentProposal } from "./consensus";
import { runJob, type JobResult } from "@/services/jobs/executor";
import { chatDuringTask } from "./taskChat";

// ── Task store (module-level, lives for the session) ─────────

const activeTasks = new Map<string, AgentTask>();

export function getTask(id: string): AgentTask | undefined {
  return activeTasks.get(id);
}

export function getAllTasks(): AgentTask[] {
  return Array.from(activeTasks.values());
}

export function clearTasks(): void {
  activeTasks.clear();
}

// ── Task creation ──────────────────────────────────

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

// ── Action execution ───────────────────────────────

async function executeActions(
  task: AgentTask,
  actions: PlannedAction[],
  context: CommandContext,
): Promise<TaskResult> {
  const jobIds: string[] = [];
  const artifactIds: string[] = [];
  const errors: string[] = [];
  const results: Record<string, any> = {};

  for (const action of actions) {
    try {
      // ── Job action: run a multi-step pipeline via the headless executor ──
      if (action.type === "job") {
        const jobDef = resolveJobDefinition(action, context);
        if (!jobDef) {
          const msg = `Job definition not found for action ${action.order}`;
          if (action.optional) {
            addEvent(task, {
              kind: "action_failed",
              timestamp: new Date().toISOString(),
              agentId: task.assigneeId,
              detail: { type: "job", error: msg, optional: true },
            });
            continue;
          }
          errors.push(msg);
          break;
        }

        addEvent(task, {
          kind: "job_queued",
          timestamp: new Date().toISOString(),
          agentId: task.assigneeId,
          detail: {
            jobName: jobDef.name,
            jobId: jobDef.id,
            stepCount: jobDef.steps.length,
            mode: jobDef.mode,
            reasoning: action.reasoning,
          },
        });

        context.workspace.addLog(
          `📋 [Task] Running job "${jobDef.name}" (${jobDef.steps.length} steps, ${jobDef.mode} mode)`,
        );

        const jobResult = await runJob(jobDef, context, {
          addLog: context.workspace.addLog,
          onStepUpdate: (stepId, status, result) => {
            context.workspace.addLog(`  └─ Step ${stepId}: ${status}${result ? ` — ${result.substring(0, 80)}` : ""}`);
          },
        }, action.jobInputs);

        if (jobResult.success) {
          addEvent(task, {
            kind: "job_completed",
            timestamp: new Date().toISOString(),
            agentId: task.assigneeId,
            detail: {
              jobName: jobDef.name,
              summary: jobResult.summary,
              deliverableCount: jobResult.deliverables.length,
            },
          });

          results[`action_${action.order}`] = {
            type: "job",
            jobName: jobDef.name,
            success: true,
            summary: jobResult.summary,
            deliverables: jobResult.deliverables,
          };

          // Merge job storage back into task workspace
          if (task.workspaceStorage) {
            Object.assign(task.workspaceStorage, jobResult.storage);
          }

          jobIds.push(jobDef.id);
          for (const d of jobResult.deliverables) {
            artifactIds.push(d.artifactId);
          }
        } else {
          addEvent(task, {
            kind: "job_failed",
            timestamp: new Date().toISOString(),
            agentId: task.assigneeId,
            detail: {
              jobName: jobDef.name,
              error: jobResult.error,
              summary: jobResult.summary,
            },
          });

          if (action.optional) continue;
          errors.push(`Job "${jobDef.name}": ${jobResult.error || jobResult.summary}`);
          break;
        }

        continue;
      }

      // ── Command action: run a single command via the registry ──
      // Validate command exists
      const cmd = registry.get(action.commandId);
      if (!cmd) {
        const msg = `Command "${action.commandId}" not found`;
        if (action.optional) {
          addEvent(task, {
            kind: "action_failed",
            timestamp: new Date().toISOString(),
            agentId: task.assigneeId,
            detail: { commandId: action.commandId, error: msg, optional: true },
          });
          continue;
        }
        errors.push(msg);
        addEvent(task, {
          kind: "action_failed",
          timestamp: new Date().toISOString(),
          agentId: task.assigneeId,
          detail: { commandId: action.commandId, error: msg },
        });
        break;
      }

      // Execute command
      const result = await registry.execute(action.commandId, action.args, context);

      addEvent(task, {
        kind: "action_executed",
        timestamp: new Date().toISOString(),
        agentId: task.assigneeId,
        detail: {
          commandId: action.commandId,
          order: action.order,
          reasoning: action.reasoning,
          resultPreview: typeof result === "string"
            ? result.substring(0, 200)
            : JSON.stringify(result).substring(0, 200),
        },
      });

      results[`action_${action.order}`] = result;

      // Track created entities
      if (result?.id) {
        if (action.commandId.includes("artifact")) artifactIds.push(result.id);
        if (action.commandId.includes("job")) jobIds.push(result.id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (action.optional) {
        addEvent(task, {
          kind: "action_failed",
          timestamp: new Date().toISOString(),
          agentId: task.assigneeId,
          detail: { commandId: action.commandId, error: msg, optional: true },
        });
        continue;
      }
      errors.push(`${action.commandId}: ${msg}`);
      addEvent(task, {
        kind: "action_failed",
        timestamp: new Date().toISOString(),
        agentId: task.assigneeId,
        detail: { commandId: action.commandId, error: msg },
      });
      break; // Stop on non-optional failure
    }
  }

  return {
    success: errors.length === 0,
    summary: errors.length === 0
      ? `Successfully executed ${actions.length} actions`
      : `Failed: ${errors.join("; ")}`,
    artifactIds,
    jobIds,
    resolvedBy: task.assigneeId,
    data: results,
  };
}

// ── Job definition resolver ────────────────────────

/**
 * Resolve a job definition from a PlannedAction.
 *
 * Sources (in priority order):
 * 1. Inline `action.jobDefinition` — the AI composed a full job definition
 * 2. Catalog lookup via `action.jobDefinitionId` — references a saved definition
 * 3. Fallback: synthesize a single-step job from the action's commandId/args
 */
function resolveJobDefinition(
  action: PlannedAction,
  context: CommandContext,
): import("@/types/jobs").JobDefinition | null {
  // 1. Inline definition
  if (action.jobDefinition) return action.jobDefinition;

  // 2. Catalog lookup
  if (action.jobDefinitionId) {
    const catalog = context.jobs.getCatalog?.() || [];
    const found = catalog.find((d) => d.id === action.jobDefinitionId);
    if (found) return found;
    return null;
  }

  // 3. Synthesize from command
  if (action.commandId) {
    const now = Date.now();
    return {
      id: `synth-${action.commandId}-${now}`,
      name: `Synthesized: ${action.commandId}`,
      description: action.reasoning,
      mode: "serial" as const,
      steps: [{
        id: `step-1`,
        commandId: action.commandId,
        args: action.args,
        name: action.commandId,
      }],
      createdAt: now,
      updatedAt: now,
    };
  }

  return null;
}

// ── Capability gap handler ─────────────────────────

async function handleCapabilityGaps(
  task: AgentTask,
  gaps: string[],
  groupId: string,
  proposingAgent: Agent,
  agents: Agent[],
  groups: Group[],
  context: CommandContext,
): Promise<boolean> {
  const group = groups.find((g) => g.id === groupId);
  if (!group) return false;

  // Check what commands are missing
  const requiredCommands = gaps
    .map(g => g.match(/\b[a-z_]+\b/g))
    .flat()
    .filter(Boolean) as string[];

  const { missingCommands, recommendations } = identifyGaps(agents, requiredCommands);

  if (recommendations.length === 0) return false;

  // Build a proposal for creating a new agent
  const spec: AgentSpec = {
    name: `${group.name}-specialist-${Date.now().toString(36)}`,
    role: extractRoleFromRecommendation(recommendations[0]),
    prompt: `You are a specialist agent created to address capability gaps in the "${group.name}" group. Your primary focus: ${gaps.join(", ")}`,
    justification: `Capability gaps identified during autonomous task execution: ${gaps.join("; ")}. Recommendations: ${recommendations.join("; ")}`,
    groupId,
  };

  const proposal = {
    ...buildAgentProposal(proposingAgent.id, groupId, spec),
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };

  addEvent(task, {
    kind: "agent_proposed",
    timestamp: new Date().toISOString(),
    agentId: proposingAgent.id,
    detail: { proposalId: proposal.id, spec },
  });

  context.workspace.addLog(
    `💡 [${proposingAgent.name}] Proposing new agent "${spec.name}" (${spec.role}) to fill capability gap`,
  );

  // Run deliberation if group has members
  const memberAgents = group.members
    .map((mid: string) => agents.find((a: Agent) => a.id === mid))
    .filter(Boolean) as Agent[];

  if (memberAgents.length >= 2) {
    const deliberated = await deliberate(
      proposal as ConsensusProposal,
      memberAgents,
      group.governance,
      group.threshold,
      group.modelId,
    );

    addEvent(task, {
      kind: "consensus_reached",
      timestamp: new Date().toISOString(),
      agentId: proposingAgent.id,
      detail: {
        proposalId: proposal.id,
        outcome: deliberated.outcome,
        positions: deliberated.positions.map(p => ({
          agent: p.agentName,
          vote: p.vote,
        })),
      },
    });

    if (!deliberated.outcome?.passed) {
      context.workspace.addLog(
        `❌ Group "${group.name}" rejected agent proposal: ${deliberated.outcome?.decision}`,
      );
      return false;
    }

    context.workspace.addLog(
      `✅ Group "${group.name}" approved new agent: ${deliberated.outcome?.decision}`,
    );
  }

  // Auto-execute if configured (or if group is too small for deliberation)
  if (task.config.autoExecuteConsensus || memberAgents.length < 2) {
    try {
      await registry.execute("create_agent", {
        name: spec.name,
        role: spec.role,
        prompt: spec.prompt,
        title: spec.title,
      }, context);

      addEvent(task, {
        kind: "agent_created",
        timestamp: new Date().toISOString(),
        agentId: proposingAgent.id,
        detail: { agentName: spec.name, role: spec.role },
      });

      context.workspace.addLog(`🆕 Created agent "${spec.name}" (${spec.role})`);

      // If the new agent should be in the group, add it
      if (spec.groupId) {
        const newAgent = context.storage[`agent_${spec.name}`];
        if (newAgent) {
          try {
            await registry.execute("toggle_group_member", {
              groupId: spec.groupId,
              agentId: newAgent,
            }, context);
          } catch { /* best effort */ }
        }
      }

      return true;
    } catch (err) {
      context.workspace.addLog(
        `⚠️ Failed to create agent: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  // Proposal created but awaiting human approval
  context.workspace.addLog(
    `📋 Agent proposal "${spec.name}" created — awaiting human approval`,
  );

  // Store proposal for human review
  context.storage[`proposal_${proposal.id}`] = proposal;
  return false;
}

function extractRoleFromRecommendation(rec: string): string {
  const lower = rec.toLowerCase();
  if (lower.includes("researcher")) return "researcher";
  if (lower.includes("builder")) return "builder";
  if (lower.includes("curator")) return "curator";
  if (lower.includes("validator")) return "validator";
  if (lower.includes("orchestrator")) return "orchestrator";
  return "builder"; // default role
}

// ── Task state helpers ─────────────────────────────

function updateTask(task: AgentTask, status: AgentTask["status"]): void {
  task.status = status;
  task.updatedAt = new Date().toISOString();
}

function addEvent(task: AgentTask, event: TaskEvent): void {
  task.history.push(event);
  task.updatedAt = new Date().toISOString();
}

function completeTask(
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

function failTask(
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
