import { useEffect, useMemo } from "react";
import { useJobsContext } from "@/context/JobsContext";
import { useWorkspaceContext } from "@/context/WorkspaceContext";
import type { Job, Message } from "@/types";
import type { NavigatorSubgoal } from "./types";
import { navigatorService } from "./service";

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