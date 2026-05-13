/**
 * Autonomy command definitions — expose the autonomous agent system through
 * the standard command registry so it works with the job executor, tool-use
 * bridge, and Studio visual editor.
 *
 * Commands:
 *  - assign_task          — give an agent a task to complete autonomously
 *  - delegate_task        — agent delegates a task to another agent/group
 *  - escalate_task        — push a task up the escalation hierarchy
 *  - task_status          — check the status of an autonomous task
 *  - list_tasks           — list all active/completed tasks
 *  - group_ideate         — run a group ideation session
 *  - propose_agent        — propose creating a new agent (triggers group consensus)
 *  - execute_proposal     — execute an approved consensus proposal
 */

import type { CommandDefinition, CommandContext } from "@/services/commands/types";
import {
  createTask,
  executeTask,
  getTask,
  getAllTasks,
  runIdeationSession,
  buildAgentProposal,
  deliberate,
} from "@/services/autonomy";
import type { Agent } from "@/types";
import type { ConsensusProposal, AgentSpec, WorkflowSpec, EcosystemChangeSpec } from "@/types/autonomy";

// ── assign_task ────────────────────────────────────

export const assignTaskCommand: CommandDefinition = {
  id: "assign_task",
  description: "Assign a task to an agent for autonomous execution. The agent will plan, execute, delegate, and escalate as needed to complete the goal.",
  tags: ["autonomy", "task", "agent", "ai"],
  rbac: ["orchestrator", "builder", "researcher", "curator", "validator"],
  usesAI: "ai-text",
  args: {
    agentId: {
      name: "agentId",
      type: "agent",
      description: "The agent to assign the task to",
      required: true,
    },
    goal: {
      name: "goal",
      type: "string",
      description: "Natural language description of the task goal",
      required: true,
    },
    constraints: {
      name: "constraints",
      type: "array",
      description: "Optional list of constraints the agent must honor",
      required: false,
    },
    maxRounds: {
      name: "maxRounds",
      type: "number",
      description: "Maximum planning/execution rounds",
      required: false,
      defaultValue: 12,
    },
    maxEscalations: {
      name: "maxEscalations",
      type: "number",
      description: "Maximum escalation levels to try",
      required: false,
      defaultValue: 3,
    },
    allowAgentCreation: {
      name: "allowAgentCreation",
      type: "boolean",
      description: "Allow groups to propose creating new agents to fill gaps",
      required: false,
      defaultValue: true,
    },
    autoExecuteConsensus: {
      name: "autoExecuteConsensus",
      type: "boolean",
      description: "Auto-execute approved consensus proposals (vs. require human approval)",
      required: false,
      defaultValue: false,
    },
  },
  output: "Task execution result with full history of planning, actions, delegations, and escalations.",
  outputSchema: {
    type: "object",
    properties: {
      taskId: { type: "string" },
      goal: { type: "string" },
      status: { type: "string" },
      result: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          summary: { type: "string" },
          resolvedBy: { type: "string" },
        },
      },
      escalationLevel: { type: "string" },
      historyLength: { type: "number" },
    },
  },
  execute: async (args, context: CommandContext) => {
    const { addLog } = context.workspace;

    addLog(`🎯 Assigning autonomous task to agent ${args.agentId}: "${args.goal}"`);

    const task = createTask(
      args.goal,
      args.agentId,
      context.auth?.user?.did || "user",
      args.constraints,
      {
        maxRounds: args.maxRounds || 12,
        maxEscalations: args.maxEscalations || 3,
        allowAgentCreation: args.allowAgentCreation !== false,
        autoExecuteConsensus: args.autoExecuteConsensus || false,
      },
    );

    addLog(`📋 Task ${task.id.slice(0, 8)} created — starting autonomous execution`);

    const result = await executeTask(task.id, context);

    // Store in shared storage
    context.storage.lastTaskResult = result;
    context.storage[`task_${task.id}`] = {
      taskId: task.id,
      goal: task.goal,
      status: task.status,
      result,
      escalationLevel: task.escalationLevel,
      historyLength: task.history.length,
    };

    return {
      taskId: task.id,
      goal: task.goal,
      status: task.status,
      result,
      escalationLevel: task.escalationLevel,
      historyLength: task.history.length,
    };
  },
};

// ── delegate_task ──────────────────────────────────

export const delegateTaskCommand: CommandDefinition = {
  id: "delegate_task",
  description: "Delegate an active task to another agent or group. The target will take over execution.",
  tags: ["autonomy", "task", "delegation"],
  rbac: ["orchestrator", "builder", "researcher", "curator", "validator"],
  args: {
    taskId: {
      name: "taskId",
      type: "string",
      description: "ID of the task to delegate",
      required: true,
    },
    targetAgentId: {
      name: "targetAgentId",
      type: "agent",
      description: "Agent ID or name to delegate to",
      required: true,
    },
    subGoal: {
      name: "subGoal",
      type: "string",
      description: "Optional refined sub-goal for the delegation (defaults to original goal)",
      required: false,
    },
  },
  output: "Updated task status after delegation.",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async (args, context: CommandContext) => {
    const task = getTask(args.taskId);
    if (!task) throw new Error(`Task "${args.taskId}" not found`);

    const { addLog } = context.workspace;

    task.assigneeId = args.targetAgentId;
    task.history.push({
      kind: "delegated",
      timestamp: new Date().toISOString(),
      agentId: args.targetAgentId,
      detail: {
        targetType: "agent",
        targetId: args.targetAgentId,
        subGoal: args.subGoal || task.goal,
      },
    });
    task.status = "delegated";
    task.updatedAt = new Date().toISOString();
    if (args.subGoal) task.goal = args.subGoal;

    addLog(`🔀 Task ${task.id.slice(0, 8)} delegated to ${args.targetAgentId}`);

    // Resume execution with new assignee
    const result = await executeTask(task.id, context);

    context.storage.lastTaskResult = result;
    return {
      taskId: task.id,
      delegatedTo: args.targetAgentId,
      status: task.status,
      result,
    };
  },
};

// ── escalate_task ──────────────────────────────────

export const escalateTaskCommand: CommandDefinition = {
  id: "escalate_task",
  description: "Escalate a task to the next organizational level (self → group → network → ecosystem).",
  tags: ["autonomy", "task", "escalation"],
  rbac: ["orchestrator", "builder", "researcher", "curator", "validator"],
  args: {
    taskId: {
      name: "taskId",
      type: "string",
      description: "ID of the task to escalate",
      required: true,
    },
    reason: {
      name: "reason",
      type: "string",
      description: "Why the task needs escalation",
      required: false,
      defaultValue: "Current level cannot complete the task",
    },
  },
  output: "Updated task status after escalation.",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async (args, context: CommandContext) => {
    const task = getTask(args.taskId);
    if (!task) throw new Error(`Task "${args.taskId}" not found`);

    const { nextEscalation } = await import("../../../types/autonomy");
    const nextLevel = nextEscalation(task.escalationLevel);
    if (!nextLevel) throw new Error(`Task is already at the highest escalation level (${task.escalationLevel})`);

    const prevLevel = task.escalationLevel;
    task.escalationLevel = nextLevel;
    task.history.push({
      kind: "escalated",
      timestamp: new Date().toISOString(),
      agentId: task.assigneeId,
      detail: { fromLevel: prevLevel, toLevel: nextLevel, reason: args.reason },
    });
    task.updatedAt = new Date().toISOString();

    context.workspace.addLog(
      `⬆️ Task ${task.id.slice(0, 8)} escalated: ${prevLevel} → ${nextLevel} (${args.reason})`,
    );

    // Resume execution at new level
    const result = await executeTask(task.id, context);

    context.storage.lastTaskResult = result;
    return {
      taskId: task.id,
      escalatedFrom: prevLevel,
      escalatedTo: nextLevel,
      status: task.status,
      result,
    };
  },
};

// ── task_status ────────────────────────────────────

export const taskStatusCommand: CommandDefinition = {
  id: "task_status",
  description: "Check the current status, history, and result of an autonomous task.",
  tags: ["autonomy", "task", "query"],
  rbac: ["orchestrator", "builder", "researcher", "curator", "validator"],
  args: {
    taskId: {
      name: "taskId",
      type: "string",
      description: "ID of the task to check",
      required: true,
    },
  },
  output: "Full task status including history and result.",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async (args) => {
    const task = getTask(args.taskId);
    if (!task) throw new Error(`Task "${args.taskId}" not found`);

    return {
      taskId: task.id,
      goal: task.goal,
      status: task.status,
      assigneeId: task.assigneeId,
      escalationLevel: task.escalationLevel,
      result: task.result,
      createdBy: task.createdBy,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      historyLength: task.history.length,
      history: task.history.map(e => ({
        kind: e.kind,
        timestamp: e.timestamp,
        agentId: e.agentId,
        summary: summarizeEvent(e),
      })),
      childTaskIds: task.childTaskIds,
      parentTaskId: task.parentTaskId,
    };
  },
};

function summarizeEvent(event: any): string {
  switch (event.kind) {
    case "created": return `Task created with goal: "${event.detail.goal?.substring(0, 80)}"`;
    case "plan_generated": return `Plan generated: ${event.detail.actionCount ?? "?"} actions, self-complete: ${event.detail.canSelfComplete}`;
    case "action_executed": return `Executed ${event.detail.commandId} (step ${event.detail.order})`;
    case "action_failed": return `Failed: ${event.detail.commandId} — ${event.detail.error}`;
    case "delegated": return `Delegated to ${event.detail.targetId} (${event.detail.targetType})`;
    case "escalated": return `Escalated: ${event.detail.fromLevel} → ${event.detail.toLevel}`;
    case "agent_proposed": return `Proposed new agent: ${event.detail.spec?.name}`;
    case "agent_created": return `Created agent: ${event.detail.agentName} (${event.detail.role})`;
    case "consensus_reached": return `Consensus: ${event.detail.outcome?.decision}`;
    case "completed": return `Completed: ${event.detail.summary}`;
    case "failed": return `Failed: ${event.detail.reason}`;
    default: return event.kind;
  }
}

// ── list_tasks ─────────────────────────────────────

export const listTasksCommand: CommandDefinition = {
  id: "list_tasks",
  description: "List all autonomous tasks (active and completed).",
  tags: ["autonomy", "task", "query"],
  rbac: ["orchestrator", "builder", "researcher", "curator", "validator"],
  args: {
    status: {
      name: "status",
      type: "string",
      description: "Filter by status (pending, planning, executing, delegated, escalated, completed, failed, blocked)",
      required: false,
      enum: ["pending", "planning", "executing", "delegated", "escalated", "completed", "failed", "blocked"],
    },
  },
  output: "Array of task summaries.",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async (args) => {
    let tasks = getAllTasks();
    if (args.status) {
      tasks = tasks.filter(t => t.status === args.status);
    }
    return tasks.map(t => ({
      taskId: t.id,
      goal: t.goal.substring(0, 120),
      status: t.status,
      assigneeId: t.assigneeId,
      escalationLevel: t.escalationLevel,
      historyLength: t.history.length,
      createdAt: t.createdAt,
      result: t.result ? { success: t.result.success, summary: t.result.summary } : undefined,
    }));
  },
};

// ── group_ideate ───────────────────────────────────

export const groupIdeateCommand: CommandDefinition = {
  id: "group_ideate",
  description: "Run an AI-powered group ideation session. The group analyzes the workspace and proposes improvements: new agents, workflows, network changes, and collaboration strategies.",
  tags: ["autonomy", "group", "ideation", "ai", "consensus"],
  rbac: ["orchestrator", "builder"],
  usesAI: "ai-text",
  args: {
    groupId: {
      name: "groupId",
      type: "group",
      description: "The group to run the ideation session with",
      required: true,
    },
    topic: {
      name: "topic",
      type: "string",
      description: "Topic or challenge to ideate on (e.g. 'How can we improve our security audit process?')",
      required: true,
    },
    focus: {
      name: "focus",
      type: "array",
      description: "Optional focus areas: agents, workflows, networks, channels, bridges",
      required: false,
    },
    maxProposals: {
      name: "maxProposals",
      type: "number",
      description: "Maximum number of proposals to generate",
      required: false,
      defaultValue: 5,
    },
    autoExecute: {
      name: "autoExecute",
      type: "boolean",
      description: "Auto-execute approved proposals (default: false — store for human review)",
      required: false,
      defaultValue: false,
    },
  },
  output: "Ideation session results with proposals, deliberation outcomes, and summary.",
  outputSchema: {
    type: "object",
    properties: {
      topic: { type: "string" },
      groupName: { type: "string" },
      proposals: { type: "array" },
      observations: { type: "array" },
      summary: { type: "string" },
    },
  },
  execute: async (args, context: CommandContext) => {
    const { addLog, agents, groups } = context.workspace;
    const networks = context.ecosystem.ecosystem?.networks || [];
    const ecosystem = context.ecosystem.ecosystem;

    addLog(`💡 Starting ideation session for group "${args.groupId}" on topic: "${args.topic}"`);

    const result = await runIdeationSession(
      {
        topic: args.topic,
        groupId: args.groupId,
        focus: args.focus,
        maxProposals: args.maxProposals || 5,
      },
      agents,
      groups,
      networks,
      ecosystem,
    );

    addLog(`📊 Ideation complete: ${result.proposals.length} proposals generated`);

    // Auto-execute approved proposals if configured
    if (args.autoExecute) {
      const approved = result.proposals.filter(p => p.outcome?.passed);
      for (const proposal of approved) {
        try {
          await executeProposal(proposal, context);
          proposal.executed = true;
          addLog(`✅ Auto-executed: ${proposal.title}`);
        } catch (err) {
          addLog(`⚠️ Failed to execute "${proposal.title}": ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    // Store results
    context.storage.lastIdeationResult = result;
    context.storage[`ideation_${args.groupId}`] = result;

    // Produce deliverable
    context.addDeliverable({
      key: `ideation-${args.groupId}`,
      name: `Ideation: ${args.topic.substring(0, 50)}`,
      type: "json",
      content: JSON.stringify(result, null, 2),
      tags: ["autonomy", "ideation", "consensus"],
    });

    return result;
  },
};

// ── propose_agent ──────────────────────────────────

export const proposeAgentCommand: CommandDefinition = {
  id: "propose_agent",
  description: "Propose creating a new agent to fill a capability gap. Triggers group consensus deliberation.",
  tags: ["autonomy", "agent", "consensus", "ai"],
  rbac: ["orchestrator", "builder"],
  usesAI: "ai-text",
  args: {
    groupId: {
      name: "groupId",
      type: "group",
      description: "Group to deliberate on the proposal",
      required: true,
    },
    name: {
      name: "name",
      type: "string",
      description: "Proposed agent name",
      required: true,
    },
    role: {
      name: "role",
      type: "string",
      description: "Agent role",
      enum: ["researcher", "builder", "curator", "validator", "orchestrator"],
      required: true,
    },
    prompt: {
      name: "prompt",
      type: "string",
      description: "System prompt / core directive for the new agent",
      required: true,
    },
    title: {
      name: "title",
      type: "string",
      description: "Job title descriptor",
      required: false,
    },
    justification: {
      name: "justification",
      type: "string",
      description: "Why this agent is needed",
      required: true,
    },
    autoExecute: {
      name: "autoExecute",
      type: "boolean",
      description: "Auto-create the agent if approved (default: false)",
      required: false,
      defaultValue: false,
    },
  },
  output: "Consensus result with member positions and outcome.",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async (args, context: CommandContext) => {
    const { addLog, agents, groups } = context.workspace;

    const group = groups.find((g: any) => g.id === args.groupId);
    if (!group) throw new Error(`Group "${args.groupId}" not found`);

    const spec: AgentSpec = {
      name: args.name,
      role: args.role,
      prompt: args.prompt,
      title: args.title,
      justification: args.justification,
      groupId: args.groupId,
    };

    const proposalBase = buildAgentProposal(
      context.auth?.user?.did || "user",
      args.groupId,
      spec,
    );

    const proposal: ConsensusProposal = {
      ...proposalBase,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };

    addLog(`📋 Agent proposal: "${args.name}" (${args.role}) submitted to group "${group.name}"`);

    // Deliberate
    const allAgents = [...agents, ...(context.storage._agents || [])];
    const memberAgents = group.members
      .map((mid: string) => allAgents.find((a: any) => a.id === mid))
      .filter(Boolean) as Agent[];

    if (memberAgents.length >= 2) {
      const result = await deliberate(proposal, memberAgents, group.governance, group.threshold, group.modelId);

      addLog(`🗳️ Deliberation result: ${result.outcome?.decision}`);

      if (result.outcome?.passed && args.autoExecute) {
        try {
          await executeProposal(result, context);
          result.executed = true;
          addLog(`✅ Agent "${args.name}" created after group approval`);
        } catch (err) {
          addLog(`⚠️ Failed to create agent: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      context.storage.lastProposal = result;
      context.storage[`proposal_${result.id}`] = result;

      context.addDeliverable({
        key: `proposal-${result.id}`,
        name: `Proposal: ${args.name}`,
        type: "json",
        content: JSON.stringify(result, null, 2),
        tags: ["autonomy", "proposal", "consensus", args.role],
      });

      return result;
    }

    // Single-member group or empty — auto-approve
    addLog(`📋 Group has < 2 members — auto-approving proposal`);

    if (args.autoExecute !== false) {
      try {
        await executeProposal(proposal, context);
        proposal.executed = true;
        addLog(`✅ Agent "${args.name}" created (auto-approved)`);
      } catch (err) {
        addLog(`⚠️ Failed to create agent: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return proposal;
  },
};

// ── execute_proposal ───────────────────────────────

export const executeProposalCommand: CommandDefinition = {
  id: "execute_proposal",
  description: "Execute a previously approved consensus proposal (create agent, workflow, or ecosystem change).",
  tags: ["autonomy", "consensus", "execution"],
  rbac: ["orchestrator", "builder"],
  args: {
    proposalId: {
      name: "proposalId",
      type: "string",
      description: "Proposal ID to execute (stored in shared storage as proposal_{id})",
      required: true,
    },
  },
  output: "Result of the proposal execution.",
  outputSchema: { type: "object", additionalProperties: true },
  execute: async (args, context: CommandContext) => {
    const proposal = context.storage[`proposal_${args.proposalId}`] as ConsensusProposal | undefined;
    if (!proposal) throw new Error(`Proposal "${args.proposalId}" not found in storage`);

    if (proposal.executed) throw new Error("Proposal has already been executed");
    if (proposal.outcome && !proposal.outcome.passed) throw new Error("Proposal was not approved");

    const result = await executeProposal(proposal, context);
    proposal.executed = true;
    context.storage[`proposal_${args.proposalId}`] = proposal;

    return result;
  },
};

// ── Proposal executor (internal) ───────────────────

async function executeProposal(
  proposal: ConsensusProposal,
  context: CommandContext,
): Promise<any> {
  const { registry } = await import("../registry");

  switch (proposal.kind) {
    case "create_agent": {
      const spec = proposal.spec as AgentSpec;
      return registry.execute("create_agent", {
        name: spec.name,
        role: spec.role,
        prompt: spec.prompt,
        title: spec.title,
      }, context);
    }

    case "create_workflow": {
      const spec = proposal.spec as WorkflowSpec;
      // Create a job definition from the workflow spec
      const jobDef = {
        id: crypto.randomUUID(),
        name: spec.name,
        description: spec.description,
        mode: "serial" as const,
        steps: spec.steps.map((s, i) => ({
          id: crypto.randomUUID(),
          commandId: s.commandId,
          args: s.args,
          name: s.reasoning || `Step ${i + 1}`,
        })),
        deliverables: (spec.deliverables || []).map(d => ({
          key: d.toLowerCase().replace(/\s+/g, "-"),
          name: d,
          label: d,
          type: "txt" as const,
        })),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      context.jobs.saveDefinition(jobDef);
      context.workspace.addLog(`📦 Saved workflow "${spec.name}" to job catalog`);
      return { jobDefinitionId: jobDef.id, name: spec.name };
    }

    case "ecosystem_change": {
      const spec = proposal.spec as EcosystemChangeSpec;
      switch (spec.changeType) {
        case "add_network":
          return registry.execute("create_network", {
            name: spec.entities.name || "New Network",
            description: spec.description,
          }, context);
        case "add_bridge":
          return registry.execute("create_bridge", {
            fromAgentId: spec.entities.fromAgentId,
            toAgentId: spec.entities.toAgentId,
          }, context);
        case "add_channel":
          return registry.execute("create_channel", {
            from_agent_id: spec.entities.fromAgentId,
            to_agent_id: spec.entities.toAgentId,
            channel_type: spec.entities.channelType || "task",
          }, context);
        default:
          return { message: `Ecosystem change "${spec.changeType}" stored — requires manual implementation`, spec };
      }
    }

    default:
      return { message: `Proposal kind "${proposal.kind}" stored — requires manual implementation`, proposal };
  }
}

// ── Exports ────────────────────────────────────────

export const autonomyCommands = [
  assignTaskCommand,
  delegateTaskCommand,
  escalateTaskCommand,
  taskStatusCommand,
  listTasksCommand,
  groupIdeateCommand,
  proposeAgentCommand,
  executeProposalCommand,
];
