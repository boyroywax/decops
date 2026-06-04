import { useEffect, useMemo, useState } from "react";
import { useJobsContext } from "@/context/JobsContext";
import { useWorkspaceContext } from "@/context/WorkspaceContext";
import type { Job, Message } from "@/types";
import type { NavigatorGoal, NavigatorSubgoal } from "./types";
import { navigatorService } from "./service";
import { buildGoalProcessOrder } from "./navigatorGoalArchive";

type JobsRuntime = ReturnType<typeof useJobsContext>;

function getJobMessageIds(job: Job): string[] {
  const ids = new Set<string>();
  const steps = job.resultDetails?.steps || [];

  for (const step of steps) {
    if (step.commandId !== "send_message" && step.commandId !== "broadcast_message") continue;
    if (!step.result || typeof step.result !== "object") continue;

    const result = step.result as Record<string, unknown>;
    if (typeof result.messageId === "string" && result.messageId.trim()) {
      ids.add(result.messageId);
    }
    if (Array.isArray(result.messageIds)) {
      for (const messageId of result.messageIds) {
        if (typeof messageId === "string" && messageId.trim()) ids.add(messageId);
      }
    }
  }

  return Array.from(ids);
}

function getTrackedMessages(subgoal: NavigatorSubgoal, jobsById: Map<string, Job>, messagesById: Map<string, Message>): Message[] {
  const messageIds = new Set<string>();

  for (const jobId of subgoal.jobIds) {
    const job = jobsById.get(jobId);
    if (!job) continue;
    for (const messageId of getJobMessageIds(job)) {
      messageIds.add(messageId);
    }
  }

  return Array.from(messageIds)
    .map((id) => messagesById.get(id))
    .filter((message): message is Message => !!message)
    .sort((a, b) => (a.ts || 0) - (b.ts || 0));
}

function summarizeDeliveredReplies(messages: Message[], agentNameById: Map<string, string>): string | null {
  const delivered = messages.filter(
    (message) => message.status === "delivered" && typeof message.response === "string" && message.response.trim().length > 0,
  );

  if (delivered.length === 0) return null;
  if (delivered.length === 1) return delivered[0].response?.trim() || null;

  return delivered
    .map((message) => {
      const agentName = agentNameById.get(message.toId) || message.toId.slice(0, 8);
      return `${agentName}: ${String(message.response).trim()}`;
    })
    .join("\n\n");
}

export function startNavigatorSubgoalExecution(
  goalId: string,
  subgoal: NavigatorSubgoal,
  jobsCtx: JobsRuntime,
): { jobId: string; dispatch: "agent" | "huddle" } | null {
  if (subgoal.status === "completed" || subgoal.status === "skipped" || subgoal.status === "executing") {
    return null;
  }

  const instruction = subgoal.instruction || subgoal.title;

  if (subgoal.assignedAgentId) {
    const job = jobsCtx.addJob({
      type: "send_message",
      request: {
        from_agent_id: "user",
        to_agent_id: subgoal.assignedAgentId,
        message: `[Navigator goal ${goalId} · sub-goal ${subgoal.id}] ${instruction}`,
        await_response: true,
      },
    });
    navigatorService.controlSubgoal(goalId, subgoal.id, {
      status: "executing",
      appendJobId: job.id,
      actor: "navigator",
      note: `Started via direct agent dispatch (job ${job.id})`,
    });
    return { jobId: job.id, dispatch: "agent" };
  }

  if (subgoal.huddleId) {
    const huddle = navigatorService.listHuddlesForGoal(goalId).find((item) => item.id === subgoal.huddleId);
    if (!huddle) {
      navigatorService.controlSubgoal(goalId, subgoal.id, {
        status: "blocked",
        reason: `Huddle ${subgoal.huddleId} not found`,
        actor: "navigator",
        note: `Start requested but huddle ${subgoal.huddleId} is missing`,
      });
      return null;
    }

    const groupId = huddle.groupId.startsWith("job:") ? huddle.groupId.slice(4) : huddle.groupId;
    const job = jobsCtx.addJob({
      type: "broadcast_message",
      request: {
        group_id: groupId,
        message: `[Navigator goal ${goalId} · sub-goal ${subgoal.id} · huddle ${huddle.id}] ${instruction}`,
        await_responses: true,
      },
    });
    navigatorService.controlSubgoal(goalId, subgoal.id, {
      status: "executing",
      appendJobId: job.id,
      actor: "navigator",
      note: `Started via huddle dispatch (job ${job.id})`,
    });
    return { jobId: job.id, dispatch: "huddle" };
  }

  navigatorService.controlSubgoal(goalId, subgoal.id, {
    status: "blocked",
    reason: "Sub-goal has no assignee",
    actor: "navigator",
    note: "Cannot start sub-goal without assigned agent or huddle",
  });
  return null;
}

function getNextExecutionGroup(goal: NavigatorGoal): NavigatorSubgoal[] {
  const processOrder = buildGoalProcessOrder(goal);
  const subgoalsById = new Map(goal.subgoals.map((subgoal) => [subgoal.id, subgoal] as const));
  for (const group of processOrder.groups) {
    const members = group.subgoals
      .map((item) => subgoalsById.get(item.id))
      .filter((subgoal): subgoal is NavigatorSubgoal => !!subgoal);
    if (members.some((subgoal) => subgoal.status !== "completed" && subgoal.status !== "skipped")) {
      return members;
    }
  }
  return [];
}

export function useNavigatorExecutionBridge(): void {
  const jobsCtx = useJobsContext();
  const [snapshot, setSnapshot] = useState(() => navigatorService.snapshot());

  useEffect(() => {
    const unsubscribe = navigatorService.subscribe(setSnapshot);
    return () => { unsubscribe(); };
  }, []);

  useEffect(() => {
    for (const goal of snapshot.goals) {
      if (!goal.autoRun) continue;

      if (goal.status === "completed" || goal.status === "cancelled" || goal.status === "failed") {
        if (goal.autoRun) navigatorService.updateGoal(goal.id, { autoRun: false });
        continue;
      }

      const group = getNextExecutionGroup(goal);
      if (group.length === 0) {
        navigatorService.updateGoal(goal.id, { autoRun: false });
        continue;
      }

      if (group.some((subgoal) => subgoal.status === "executing" || subgoal.status === "consulting")) {
        continue;
      }

      if (group.some((subgoal) => subgoal.status === "paused" || subgoal.status === "blocked" || subgoal.status === "failed")) {
        continue;
      }

      const ready = group.filter((subgoal) => subgoal.status === "assigned");
      if (ready.length === 0) {
        const pending = group.filter((subgoal) => subgoal.status === "pending");
        if (pending.length > 0) {
          navigatorService.updateGoal(goal.id, {
            status: "blocked",
            autoRun: false,
            error: `Cannot start step with ${pending.length} unassigned sub-goal(s).`,
          });
        }
        continue;
      }

      let started = 0;
      for (const subgoal of ready) {
        if (startNavigatorSubgoalExecution(goal.id, subgoal, jobsCtx)) started++;
      }

      if (started > 0 && goal.status !== "executing") {
        navigatorService.updateGoal(goal.id, { status: "executing", error: undefined });
      }
    }
  }, [jobsCtx, snapshot.goals]);
}

export function useNavigatorReplyBridge(): void {
  const jobsCtx = useJobsContext();
  const workspaceCtx = useWorkspaceContext();

  const jobsById = useMemo(() => {
    const map = new Map<string, Job>();
    for (const job of jobsCtx.jobs) map.set(job.id, job);
    return map;
  }, [jobsCtx.jobs]);

  const messagesById = useMemo(() => {
    const map = new Map<string, Message>();
    for (const message of workspaceCtx.messages) {
      map.set(message.id, message);
    }
    return map;
  }, [workspaceCtx.messages]);

  const agentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const agent of workspaceCtx.agents) {
      map.set(agent.id, agent.name);
    }
    return map;
  }, [workspaceCtx.agents]);

  useEffect(() => {
    const snapshot = navigatorService.snapshot();

    for (const goal of snapshot.goals) {
      for (const subgoal of goal.subgoals) {
        if (subgoal.status !== "executing") continue;

        const messages = getTrackedMessages(subgoal, jobsById, messagesById);
        if (messages.length === 0) continue;

        const pendingReplies = messages.filter((message) => message.status === "sending").length;
        if (pendingReplies > 0) continue;

        const deliveredCount = messages.filter((message) => message.status === "delivered").length;
        const deliveredSummary = summarizeDeliveredReplies(messages, agentNameById);
        if (deliveredSummary) {
          navigatorService.controlSubgoal(goal.id, subgoal.id, {
            status: "completed",
            result: deliveredSummary,
            actor: "navigator",
            note: `Auto-completed from ${deliveredCount} delivered repl${deliveredCount === 1 ? "y" : "ies"}`,
          });
          continue;
        }

        const failedReplies = messages.filter((message) => message.status === "failed").length;
        const noPromptReplies = messages.filter((message) => message.status === "no-prompt").length;
        if (failedReplies + noPromptReplies === messages.length) {
          navigatorService.controlSubgoal(goal.id, subgoal.id, {
            status: "failed",
            error: failedReplies > 0
              ? "All tracked replies failed"
              : "All tracked replies ended without an agent prompt",
            actor: "navigator",
            note: failedReplies > 0
              ? `Auto-failed after ${failedReplies} reply failure${failedReplies === 1 ? "" : "s"}`
              : `Auto-failed because ${noPromptReplies} tracked repl${noPromptReplies === 1 ? "y has" : "ies have"} no prompt`,
          });
        }
      }
    }
  }, [agentNameById, jobsById, messagesById]);
}