/**
 * Navigator commands — the navigator's tool surface.
 *
 * These commands give the navigator bot (and any other caller) the
 * primitives it needs to:
 *   1. Capture a prompt as a Goal.
 *   2. Decompose it into sub-goals with agent or huddle assignments.
 *   3. Summon an ad-hoc cross-network huddle (persists as a Group).
 *   4. Inspect state.
 *
 * Sub-goal execution itself is delegated to the existing jobs subsystem
 * via `queue_new_job` / agent-runtime — the navigator only plans + routes.
 */
import type { CommandDefinition } from "@/services/commands/types";
import type { Agent } from "@/types";
import { navigatorService } from "../service";
// didcomm/keys/resolvers is loaded lazily inside handlers to keep the
// (wasm-backed) module out of cold module-load paths — particularly the
// vitest worker, which otherwise hangs trying to resolve it.

// ── navigator_submit_prompt ───────────────────────────────────────

export const navigatorSubmitPromptCommand: CommandDefinition = {
  id: "navigator_submit_prompt",
  description:
    "Capture a user prompt as a new Navigator Goal. Returns the goal id; use navigator_decompose_goal next to break it down.",
  tags: ["navigator", "goal"],
  rbac: ["orchestrator", "builder"],
  args: {
    prompt: {
      name: "prompt",
      type: "string",
      description: "The user prompt to capture as a goal.",
      required: true,
    },
    title: {
      name: "title",
      type: "string",
      description: "Optional short title. Defaults to the first 80 chars of the prompt.",
      required: false,
    },
  },
  output: "JSON with the created goal { goalId, thid, status }.",
  outputSchema: {
    type: "object",
    properties: {
      goalId: { type: "string" },
      thid: { type: "string" },
      status: { type: "string" },
    },
    required: ["goalId", "thid", "status"],
  },
  execute: async (args, context) => {
    const { networks } = context.ecosystem;
    const goal = navigatorService.createGoal({
      prompt: String(args.prompt),
      title: typeof args.title === "string" ? args.title : undefined,
      networkIds: networks.map((n) => n.id),
    });
    context.workspace.addLog(`Navigator: captured goal "${goal.title}" (${goal.id})`);
    context.storage.lastNavigatorGoalId = goal.id;
    return { goalId: goal.id, thid: goal.thid, status: goal.status };
  },
};

// ── navigator_decompose_goal ──────────────────────────────────────

export const navigatorDecomposeGoalCommand: CommandDefinition = {
  id: "navigator_decompose_goal",
  description:
    "Add sub-goals to a Navigator Goal. Each sub-goal is assigned to one agent (assignedAgentId) or one huddle (huddleId), or left unassigned.",
  tags: ["navigator", "goal", "planning"],
  rbac: ["orchestrator", "builder"],
  args: {
    goalId: {
      name: "goalId",
      type: "string",
      description: "Goal id returned from navigator_submit_prompt.",
      required: true,
    },
    subgoals: {
      name: "subgoals",
      type: "array",
      description:
        "Array of { title, instruction, assignedAgentId?, huddleId?, order? } objects.",
      required: true,
    },
  },
  output: "JSON with the created sub-goals.",
  outputSchema: {
    type: "object",
    properties: {
      count: { type: "number" },
      subgoals: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            status: { type: "string" },
          },
        },
      },
    },
  },
  execute: async (args, context) => {
    const goalId = String(args.goalId);
    const specs = (args.subgoals as Array<Record<string, unknown>>) ?? [];
    if (!Array.isArray(specs) || specs.length === 0) {
      throw new Error("navigator_decompose_goal: 'subgoals' must be a non-empty array.");
    }
    const created = navigatorService.addSubgoals(
      goalId,
      specs.map((s) => ({
        title: String(s.title ?? "untitled"),
        instruction: String(s.instruction ?? ""),
        assignedAgentId: typeof s.assignedAgentId === "string" ? s.assignedAgentId : undefined,
        huddleId: typeof s.huddleId === "string" ? s.huddleId : undefined,
        order: typeof s.order === "number" ? s.order : undefined,
      })),
    );
    context.workspace.addLog(`Navigator: decomposed goal ${goalId} into ${created.length} sub-goal(s)`);
    return { count: created.length, subgoals: created.map((s) => ({ id: s.id, title: s.title, status: s.status })) };
  },
};

// ── navigator_summon_huddle ───────────────────────────────────────

export const navigatorSummonHuddleCommand: CommandDefinition = {
  id: "navigator_summon_huddle",
  description:
    "Summon an ad-hoc cross-network huddle. Persists a Group (kind='huddle') populated from agents across networks and registers it with the Navigator service. Returns { huddleId, groupId }.",
  tags: ["navigator", "huddle", "group"],
  rbac: ["orchestrator", "builder"],
  args: {
    goalId: {
      name: "goalId",
      type: "string",
      description: "Parent goal id this huddle is forming around.",
      required: true,
    },
    subgoalId: {
      name: "subgoalId",
      type: "string",
      description: "Sub-goal this huddle will deliberate on.",
      required: true,
    },
    name: {
      name: "name",
      type: "string",
      description: "Human-readable name for the huddle group.",
      required: true,
    },
    memberAgentIds: {
      name: "memberAgentIds",
      type: "array",
      description:
        "Agent IDs OR names to include. Members may span multiple networks — that is the point of a huddle.",
      required: true,
    },
    topic: {
      name: "topic",
      type: "string",
      description: "Short statement of what the huddle is forming around.",
      required: false,
    },
    governance: {
      name: "governance",
      type: "string",
      description: "Governance model: majority | threshold | delegated | unanimous. Defaults to majority.",
      required: false,
    },
  },
  output: "JSON with { huddleId, groupId, members, networkIds }.",
  outputSchema: {
    type: "object",
    properties: {
      huddleId: { type: "string" },
      groupId: { type: "string" },
      jobId: { type: "string" },
      members: { type: "array", items: { type: "string" } },
      networkIds: { type: "array", items: { type: "string" } },
      thid: { type: "string" },
      pthid: { type: "string" },
    },
  },
  execute: async (args, context) => {
    const goalId = String(args.goalId);
    const subgoalId = String(args.subgoalId);
    const goal = navigatorService.getGoal(goalId);
    if (!goal) throw new Error(`Navigator: unknown goal ${goalId}`);

    const agents: Agent[] = context.workspace.getAgents?.() ?? context.workspace.agents;
    const memberInputs = (args.memberAgentIds as unknown[]) ?? [];
    if (!Array.isArray(memberInputs) || memberInputs.length < 2) {
      throw new Error("navigator_summon_huddle: at least 2 members are required.");
    }
    const members: Agent[] = [];
    for (const input of memberInputs) {
      const a = agents.find((x) => x.id === input || x.name === input);
      if (!a) throw new Error(`Agent '${String(input)}' not found`);
      members.push(a);
    }
    const memberIds = [...new Set(members.map((m) => m.id))];
    const networkIds = [...new Set(members.map((m) => m.networkId).filter((n): n is string => !!n))];

    // Mint DIDComm keys for huddle members up-front so peers can route
    // bot-to-bot envelopes immediately. Loaded lazily — see top of file.
    try {
      const { ensureLocalDoc } = await import("@/services/didcomm");
      for (const m of members) {
        try { ensureLocalDoc(m.did); }
        catch { /* keys are best-effort here */ }
      }
    } catch { /* didcomm unavailable (e.g. test env) — skip */ }

    // Create the persistent group via the standard create_group path so
    // the huddle shows up in the groups list and respects existing job
    // wiring (channels, RBAC, etc).
    const job = context.jobs.addJob({
      type: "create_group",
      request: {
        name: String(args.name),
        members: memberIds,
        governance:
          (args.governance === "threshold" || args.governance === "delegated" || args.governance === "unanimous")
            ? args.governance
            : "majority",
        kind: "huddle",
        networkIds,
        summonedBy: "navigator",
        topic: typeof args.topic === "string" ? args.topic : goal.title,
      },
    });

    // We don't have the group id synchronously (it's minted inside the
    // job's execute()), but the navigator service only needs a *reference*
    // — we record the job id and resolve to the real group id when the
    // job completes. For now, store the job id as a provisional groupId.
    const huddle = navigatorService.registerHuddle({
      goalId,
      subgoalId,
      groupId: `job:${job.id}`,
      members: memberIds,
      networkIds,
    });

    context.workspace.addLog(
      `Navigator: summoned huddle "${args.name}" (${memberIds.length} agents, ${networkIds.length} network(s))`,
    );
    return {
      huddleId: huddle.id,
      groupId: huddle.groupId,
      jobId: job.id,
      members: memberIds,
      networkIds,
      thid: huddle.thid,
      pthid: huddle.pthid,
    };
  },
};

// ── navigator_status ──────────────────────────────────────────────

export const navigatorStatusCommand: CommandDefinition = {
  id: "navigator_status",
  description:
    "Report the navigator's current goals + huddles. Without args returns the active goal; pass goalId to inspect a specific one.",
  tags: ["navigator", "query"],
  rbac: ["orchestrator", "builder"],
  args: {
    goalId: {
      name: "goalId",
      type: "string",
      description: "Specific goal id to inspect.",
      required: false,
    },
    includeLifecycle: {
      name: "includeLifecycle",
      type: "boolean",
      description: "Include merged goal + subgoal lifecycle events in output.",
      required: false,
      defaultValue: false,
    },
  },
  output: "JSON snapshot of goals + huddles.",
  outputSchema: {
    type: "object",
    properties: {
      activeGoalId: { type: ["string", "null"] },
      goalCount: { type: "number" },
      huddleCount: { type: "number" },
      goals: { type: "array" },
      goal: { type: "object" },
      huddles: { type: "array" },
    },
  },
  execute: async (args) => {
    const snap = navigatorService.snapshot();
    if (typeof args.goalId === "string") {
      const goal = navigatorService.getGoal(args.goalId);
      const huddles = navigatorService.listHuddlesForGoal(args.goalId);
      const includeLifecycle = args.includeLifecycle === true;
      return {
        goal,
        huddles,
        lifecycle: includeLifecycle ? navigatorService.getGoalLifecycle(args.goalId) : undefined,
      };
    }
    return {
      activeGoalId: snap.activeGoalId,
      goalCount: snap.goals.length,
      huddleCount: snap.huddles.length,
      goals: snap.goals.slice(0, 5).map((g) => ({
        id: g.id, title: g.title, status: g.status, subgoals: g.subgoals.length,
      })),
    };
  },
};

// ── navigator_control_subgoal ────────────────────────────────────

export const navigatorControlSubgoalCommand: CommandDefinition = {
  id: "navigator_control_subgoal",
  description:
    "Fine-grained lifecycle control for a sub-goal (pause, resume, block, complete, fail, skip, retry, reassign).",
  tags: ["navigator", "subgoal", "lifecycle", "control"],
  rbac: ["orchestrator", "builder"],
  args: {
    goalId: { name: "goalId", type: "string", description: "Parent goal id.", required: true },
    subgoalId: { name: "subgoalId", type: "string", description: "Sub-goal id.", required: true },
    action: {
      name: "action",
      type: "string",
      description: "Lifecycle action.",
      required: true,
      enum: ["pause", "resume", "block", "complete", "fail", "skip", "retry", "reassign-agent", "reassign-huddle", "clear-assignment"],
    },
    reason: { name: "reason", type: "string", description: "Optional reason/note for this action.", required: false },
    stopLinkedJobs: {
      name: "stopLinkedJobs",
      type: "boolean",
      description: "When true, stop currently running/awaiting-input linked jobs before applying lifecycle action.",
      required: false,
      defaultValue: false,
    },
    assignedAgentId: { name: "assignedAgentId", type: "agent", description: "Used by reassign-agent.", required: false },
    huddleId: { name: "huddleId", type: "string", description: "Used by reassign-huddle.", required: false },
  },
  output: "JSON describing the updated sub-goal lifecycle state.",
  outputSchema: {
    type: "object",
    properties: {
      goalId: { type: "string" },
      subgoalId: { type: "string" },
      status: { type: "string" },
      retries: { type: "number" },
      assignedAgentId: { type: ["string", "null"] },
      huddleId: { type: ["string", "null"] },
      reason: { type: ["string", "null"] },
      stoppedJobIds: { type: "array", items: { type: "string" } },
    },
    required: ["goalId", "subgoalId", "status"],
  },
  execute: async (args, context) => {
    const goalId = String(args.goalId);
    const subgoalId = String(args.subgoalId);
    const action = String(args.action);
    const reason = typeof args.reason === "string" ? args.reason : undefined;
    const stopLinkedJobs = args.stopLinkedJobs === true;

    const goal = navigatorService.getGoal(goalId);
    if (!goal) throw new Error(`Navigator: unknown goal ${goalId}`);
    const sub = goal.subgoals.find((s) => s.id === subgoalId);
    if (!sub) throw new Error(`Navigator: unknown sub-goal ${subgoalId}`);

    const stoppedJobIds: string[] = [];
    if (stopLinkedJobs) {
      const activeById = new Map(
        context.jobs
          .getQueue()
          .filter((j) => j.status === "running" || j.status === "awaiting-input")
          .map((j) => [j.id, j]),
      );
      for (const jobId of sub.jobIds) {
        if (!activeById.has(jobId)) continue;
        context.jobs.stopJob(jobId);
        stoppedJobIds.push(jobId);
      }
    }

    let updated;
    if (action === "pause") {
      updated = navigatorService.controlSubgoal(goalId, subgoalId, {
        status: "paused",
        reason,
        actor: "operator",
        note: reason || "Paused by operator",
      });
    } else if (action === "resume") {
      const targetStatus = sub.assignedAgentId || sub.huddleId ? "assigned" : "pending";
      updated = navigatorService.controlSubgoal(goalId, subgoalId, {
        status: targetStatus,
        reason,
        actor: "operator",
        note: reason || "Resumed by operator",
      });
    } else if (action === "block") {
      updated = navigatorService.controlSubgoal(goalId, subgoalId, {
        status: "blocked",
        reason: reason || "Blocked by operator",
        actor: "operator",
        note: reason || "Blocked by operator",
      });
    } else if (action === "complete") {
      updated = navigatorService.controlSubgoal(goalId, subgoalId, {
        status: "completed",
        result: reason || sub.result || "Marked complete by operator",
        actor: "operator",
        note: reason || "Marked complete by operator",
      });
    } else if (action === "fail") {
      updated = navigatorService.controlSubgoal(goalId, subgoalId, {
        status: "failed",
        error: reason || "Marked failed by operator",
        reason,
        actor: "operator",
        note: reason || "Marked failed by operator",
      });
    } else if (action === "skip") {
      updated = navigatorService.controlSubgoal(goalId, subgoalId, {
        status: "skipped",
        reason: reason || "Skipped by operator",
        actor: "operator",
        note: reason || "Skipped by operator",
      });
    } else if (action === "retry") {
      const targetStatus = sub.assignedAgentId || sub.huddleId ? "assigned" : "pending";
      updated = navigatorService.controlSubgoal(goalId, subgoalId, {
        status: targetStatus,
        reason,
        error: undefined,
        incrementRetries: true,
        actor: "operator",
        note: reason || "Retry requested",
      });
    } else if (action === "reassign-agent") {
      const assignedAgentId = typeof args.assignedAgentId === "string" ? args.assignedAgentId : undefined;
      if (!assignedAgentId) throw new Error("navigator_control_subgoal: assignedAgentId is required for reassign-agent");
      updated = navigatorService.controlSubgoal(goalId, subgoalId, {
        assignedAgentId,
        huddleId: undefined,
        status: "assigned",
        reason,
        actor: "operator",
        note: reason || `Reassigned to agent ${assignedAgentId}`,
      });
    } else if (action === "reassign-huddle") {
      const huddleId = typeof args.huddleId === "string" ? args.huddleId : undefined;
      if (!huddleId) throw new Error("navigator_control_subgoal: huddleId is required for reassign-huddle");
      updated = navigatorService.controlSubgoal(goalId, subgoalId, {
        huddleId,
        assignedAgentId: undefined,
        status: "consulting",
        reason,
        actor: "operator",
        note: reason || `Reassigned to huddle ${huddleId}`,
      });
    } else if (action === "clear-assignment") {
      updated = navigatorService.controlSubgoal(goalId, subgoalId, {
        assignedAgentId: undefined,
        huddleId: undefined,
        status: "pending",
        reason,
        actor: "operator",
        note: reason || "Assignment cleared",
      });
    } else {
      throw new Error(`navigator_control_subgoal: unsupported action '${action}'`);
    }

    context.workspace.addLog(`Navigator: sub-goal ${subgoalId} action=${action} status=${updated.status}`);
    return {
      goalId,
      subgoalId,
      status: updated.status,
      retries: updated.retries || 0,
      assignedAgentId: updated.assignedAgentId || null,
      huddleId: updated.huddleId || null,
      reason: updated.reason || null,
      stoppedJobIds,
    };
  },
};

// ── navigator_goal_lifecycle ─────────────────────────────────────

export const navigatorGoalLifecycleCommand: CommandDefinition = {
  id: "navigator_goal_lifecycle",
  description: "Return merged lifecycle timeline (goal + sub-goals) for monitoring and audit.",
  tags: ["navigator", "goal", "lifecycle", "monitoring"],
  rbac: ["orchestrator", "builder"],
  args: {
    goalId: { name: "goalId", type: "string", description: "Goal id.", required: true },
    limit: { name: "limit", type: "number", description: "Maximum events to return (newest first).", required: false, defaultValue: 100 },
  },
  output: "JSON with lifecycle events for a goal.",
  outputSchema: {
    type: "object",
    properties: {
      goalId: { type: "string" },
      eventCount: { type: "number" },
      events: { type: "array" },
    },
    required: ["goalId", "eventCount", "events"],
  },
  execute: async (args) => {
    const goalId = String(args.goalId);
    const limit = typeof args.limit === "number" && Number.isFinite(args.limit)
      ? Math.max(1, Math.floor(args.limit))
      : 100;
    const events = navigatorService.getGoalLifecycle(goalId)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
    return {
      goalId,
      eventCount: events.length,
      events,
    };
  },
};

// ── navigator_cancel_goal ─────────────────────────────────────────

export const navigatorCancelGoalCommand: CommandDefinition = {
  id: "navigator_cancel_goal",
  description: "Cancel a goal (sets its status to 'cancelled'). Does not abort already-queued jobs.",
  tags: ["navigator", "goal"],
  rbac: ["orchestrator", "builder"],
  args: {
    goalId: { name: "goalId", type: "string", description: "Goal to cancel.", required: true },
  },
  output: "JSON { goalId, status }.",
  outputSchema: {
    type: "object",
    properties: {
      goalId: { type: "string" },
      status: { type: "string" },
    },
    required: ["goalId", "status"],
  },
  execute: async (args, context) => {
    const goalId = String(args.goalId);
    const goal = navigatorService.cancelGoal(goalId);
    context.workspace.addLog(`Navigator: cancelled goal ${goalId}`);
    return { goalId, status: goal.status };
  },
};

// ── navigator_start_subgoal ───────────────────────────────────────

export const navigatorStartSubgoalCommand: CommandDefinition = {
  id: "navigator_start_subgoal",
  description:
    "Dispatch work for a single sub-goal. Queues a `send_message` job for direct agent assignments or a `broadcast_message` job for huddle assignments. Marks the sub-goal as 'executing' and records the job id.",
  tags: ["navigator", "subgoal", "execute"],
  rbac: ["orchestrator", "builder"],
  args: {
    goalId: { name: "goalId", type: "string", description: "Parent goal id.", required: true },
    subgoalId: { name: "subgoalId", type: "string", description: "Sub-goal id to dispatch.", required: true },
  },
  output: "JSON { jobId, subgoalId, status, dispatch }.",
  outputSchema: {
    type: "object",
    properties: {
      jobId: { type: "string" },
      subgoalId: { type: "string" },
      status: { type: "string" },
      dispatch: { type: "string" },
    },
    required: ["jobId", "subgoalId", "status", "dispatch"],
  },
  execute: async (args, context) => {
    const goalId = String(args.goalId);
    const subgoalId = String(args.subgoalId);
    const goal = navigatorService.getGoal(goalId);
    if (!goal) throw new Error(`Navigator: unknown goal ${goalId}`);
    const sub = goal.subgoals.find((s) => s.id === subgoalId);
    if (!sub) throw new Error(`Navigator: unknown sub-goal ${subgoalId}`);
    if (!sub.assignedAgentId && !sub.huddleId) {
      throw new Error("navigator_start_subgoal: sub-goal has no assignee. Set assignedAgentId or huddleId first.");
    }

    const instruction = sub.instruction || sub.title;
    let job;
    let dispatch: "agent" | "huddle";

    if (sub.assignedAgentId) {
      dispatch = "agent";
      const targetAgentId = sub.assignedAgentId;
      job = context.jobs.addJob({
        type: "send_message",
        request: {
          from_agent_id: "user",
          to_agent_id: targetAgentId,
          message: `[Navigator goal ${goalId} · sub-goal ${subgoalId}] ${instruction}`,
        },
      });
    } else {
      dispatch = "huddle";
      const huddle = navigatorService.listHuddlesForGoal(goalId).find((h) => h.id === sub.huddleId);
      if (!huddle) throw new Error(`Navigator: huddle ${sub.huddleId} not found for this goal`);
      // The huddle's groupId may still be a provisional `job:<id>` ref
      // until the create_group job completes. Strip the prefix and let
      // the broadcast job validate the real id at execution time.
      const groupId = huddle.groupId.startsWith("job:") ? huddle.groupId.slice(4) : huddle.groupId;
      job = context.jobs.addJob({
        type: "broadcast_message",
        request: {
          group_id: groupId,
          message: `[Navigator goal ${goalId} · sub-goal ${subgoalId} · huddle ${huddle.id}] ${instruction}`,
        },
      });
    }

    const updated = navigatorService.updateSubgoal(goalId, subgoalId, {
      status: "executing",
      jobIds: [...sub.jobIds, job.id],
    });

    context.workspace.addLog(
      `Navigator: started sub-goal ${subgoalId} via ${dispatch} (job ${job.id})`,
    );
    return { jobId: job.id, subgoalId, status: updated.status, dispatch };
  },
};

export const navigatorCommands = [
  navigatorSubmitPromptCommand,
  navigatorDecomposeGoalCommand,
  navigatorSummonHuddleCommand,
  navigatorStartSubgoalCommand,
  navigatorControlSubgoalCommand,
  navigatorGoalLifecycleCommand,
  navigatorStatusCommand,
  navigatorCancelGoalCommand,
];
