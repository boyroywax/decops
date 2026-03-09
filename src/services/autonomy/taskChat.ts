/**
 * Task-level AI chat — lets the task engine consult AI mid-execution.
 *
 * During autonomous task execution, the task engine may need to:
 *   - Reason about partial results and decide next steps
 *   - Recover from errors by asking AI for alternative approaches
 *   - Interpret command outputs to guide the remainder of execution
 *   - Decide whether to re-plan after a failure
 *
 * This module provides `chatDuringTask()` which maintains a conversation
 * history on the AgentTask, giving the AI full context of prior actions,
 * results, and failures within the current task execution.
 */

import type { Agent } from "@/types";
import type { AgentTask } from "@/types/autonomy";
import { ROLES } from "@/constants";
import { TOOLKITS } from "@/services/toolkits";
import { getAgentModel } from "@/services/ai/models";
import {
  buildProviderRequest,
  parseProviderResponse,
} from "@/services/ai/providers";

// ── Types ──────────────────────────────────────────

export interface TaskChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface TaskChatResult {
  /** The AI's response text */
  response: string;
  /** Whether the chat call succeeded */
  ok: boolean;
  /** Error message if the chat failed */
  error?: string;
}

// ── Main function ──────────────────────────────────

/**
 * Consult the AI during task execution for reasoning, adaptation, or
 * error recovery.
 *
 * The task's `chatHistory` is maintained as an append-only log so the AI
 * has full context of the conversation across multiple rounds.
 *
 * @param task    The active AgentTask (mutated: chatHistory and history are appended)
 * @param agent   The agent currently executing the task
 * @param message The question / context to send to the AI
 * @param extras  Optional extra context (e.g., action results, error info)
 * @returns       The AI's response
 */
export async function chatDuringTask(
  task: AgentTask,
  agent: Agent,
  message: string,
  extras?: {
    /** Summary of actions executed so far */
    actionsSummary?: string;
    /** The error that triggered this chat (if any) */
    error?: string;
    /** Current storage keys available */
    storageKeys?: string[];
    /** Model override */
    modelOverride?: string;
  },
): Promise<TaskChatResult> {
  const model = extras?.modelOverride
    || task.config.chatModel
    || task.config.planningModel
    || getAgentModel(agent.id, agent.recommendedModel);

  // Ensure chatHistory exists
  if (!task.chatHistory) task.chatHistory = [];

  // Build system prompt
  const systemPrompt = buildTaskChatSystemPrompt(task, agent, extras);

  // Convert task chat history to provider messages
  const messages = [
    ...task.chatHistory.map(m => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: message },
  ];

  try {
    const req = buildProviderRequest(model, systemPrompt, messages, 2048);
    const response = await fetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error?.message || `Chat API request failed (${response.status})`);
    }

    const data = await response.json();
    const text = parseProviderResponse(model, data);

    // Append to chat history
    const now = new Date().toISOString();
    task.chatHistory.push({ role: "user", content: message, timestamp: now });
    task.chatHistory.push({ role: "assistant", content: text, timestamp: now });

    // Record event in task history
    task.history.push({
      kind: "ai_chat",
      timestamp: now,
      agentId: agent.id,
      detail: {
        messagePreview: message.substring(0, 200),
        responsePreview: text.substring(0, 200),
      },
    });

    task.updatedAt = now;

    return { response: text, ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { response: "", ok: false, error: msg };
  }
}

// ── System prompt builder ──────────────────────────

function buildTaskChatSystemPrompt(
  task: AgentTask,
  agent: Agent,
  extras?: {
    actionsSummary?: string;
    error?: string;
    storageKeys?: string[];
  },
): string {
  const role = ROLES.find(r => r.id === agent.role);
  const parts = [
    `You are "${agent.name}", a ${role?.label || agent.role} agent executing an autonomous task.`,
    agent.prompt ? `\nYour core directive:\n${agent.prompt}` : "",
    agent.toolkits && agent.toolkits.length > 0
      ? `\nYour enabled toolkits: ${agent.toolkits.map(b => {
          const tk = TOOLKITS.find(t => t.id === b.toolkitId);
          return tk ? tk.name : b.toolkitId;
        }).join(", ")}. Your actions are scoped to commands within these toolkits.`
      : "",
    `\n## Current Task`,
    `Goal: ${task.goal}`,
    task.constraints?.length
      ? `Constraints:\n${task.constraints.map((c, i) => `  ${i + 1}. ${c}`).join("\n")}`
      : "",
    `Status: ${task.status}`,
    `Escalation level: ${task.escalationLevel}`,
    `Round: ${task.history.filter(e => e.kind === "plan_generated").length}`,
  ];

  if (extras?.actionsSummary) {
    parts.push(`\n## Actions executed so far\n${extras.actionsSummary}`);
  }

  if (extras?.error) {
    parts.push(`\n## Error encountered\n${extras.error}`);
  }

  if (extras?.storageKeys?.length) {
    parts.push(`\n## Available storage keys\n${extras.storageKeys.join(", ")}`);
  }

  // Include recent history for context
  const recentEvents = task.history.slice(-10).map(e => {
    const detail = typeof e.detail === "object" ? JSON.stringify(e.detail).substring(0, 150) : String(e.detail);
    return `  [${e.kind}] ${detail}`;
  });
  if (recentEvents.length > 0) {
    parts.push(`\n## Recent event history\n${recentEvents.join("\n")}`);
  }

  parts.push(
    `\n## Instructions`,
    `You are being consulted mid-execution. Analyze the situation and provide concise, actionable guidance.`,
    `If asked to decide whether to re-plan, respond with either:`,
    `  - "REPLAN: <reason>" if the current approach should be revised`,
    `  - "CONTINUE: <guidance>" if the current approach should proceed`,
    `  - "ABORT: <reason>" if the task cannot be completed`,
    `Keep responses under 300 words. Be specific and actionable.`,
  );

  return parts.filter(Boolean).join("\n");
}
