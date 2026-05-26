/**
 * Agent Runtime Service — manages agent lifecycle, message routing,
 * and autonomous execution.
 *
 * Agent-to-agent communication follows the OpenRouter/OpenAI chat completions
 * format for standardized, portable interactions.
 */

import type { Agent } from "@/types";
import type {
  AgentRuntimeStatus, AgentRuntimeState,
  AgentAutonomyConfig, AgentLifecycleEvent, AgentLifecycleEventKind,
  AgentRequest, AgentResponse, AgentChatMessage,
  AgentInboxMessage,
} from "@/types/agentRuntime";
import { DEFAULT_AGENT_AUTONOMY_CONFIG } from "@/types/agentRuntime";
import { buildProviderRequest, parseProviderResponse, parseToolUseBlocks } from "@/services/ai/providers";
import { getAgentModel } from "@/services/ai/models";

// ── Runtime state store (in-memory) ────────────────

const runtimeStates = new Map<string, AgentRuntimeState>();
const inboxes = new Map<string, AgentInboxMessage[]>();
const lifecycleLogs = new Map<string, AgentLifecycleEvent[]>();

// ── Lifecycle management ───────────────────────────

/** Initialize runtime state for an agent */
export function activateAgent(agent: Agent): AgentRuntimeState {
  const now = new Date().toISOString();
  const state: AgentRuntimeState = {
    agentId: agent.id,
    status: "idle",
    pendingMessages: 0,
    totalProcessed: 0,
    activeSince: now,
    lastActivityAt: now,
    autonomyLevel: agent.autonomyConfig?.autonomyLevel || DEFAULT_AGENT_AUTONOMY_CONFIG.autonomyLevel,
    currentModel: getAgentModel(agent.id),
    endpoint: agent.endpoint || { protocol: "internal" },
  };
  runtimeStates.set(agent.id, state);
  inboxes.set(agent.id, []);

  recordLifecycleEvent(agent.id, "activated", { model: state.currentModel });
  return state;
}

/** Deactivate an agent's runtime */
export function deactivateAgent(agentId: string): void {
  const state = runtimeStates.get(agentId);
  if (state) {
    state.status = "offline";
    recordLifecycleEvent(agentId, "deactivated", { uptime: state.activeSince });
  }
  runtimeStates.delete(agentId);
  inboxes.delete(agentId);
}

/** Get runtime state for an agent */
export function getAgentRuntime(agentId: string): AgentRuntimeState | undefined {
  return runtimeStates.get(agentId);
}

/** Get all active agent runtimes */
export function getAllActiveRuntimes(): AgentRuntimeState[] {
  return Array.from(runtimeStates.values()).filter(s => s.status !== "offline");
}

/** Update agent runtime status */
export function setAgentStatus(agentId: string, status: AgentRuntimeStatus, detail?: Record<string, any>): void {
  const state = runtimeStates.get(agentId);
  if (!state) return;

  const prevStatus = state.status;
  state.status = status;
  state.lastActivityAt = new Date().toISOString();

  if (status === "error" && detail?.error) {
    state.lastError = detail.error;
  }

  recordLifecycleEvent(agentId, "status_changed", { from: prevStatus, to: status, ...detail });
}

/** Update agent autonomy level */
export function setAgentAutonomyLevel(
  agentId: string,
  config: Partial<AgentAutonomyConfig>,
): void {
  const state = runtimeStates.get(agentId);
  if (!state) return;

  if (config.autonomyLevel) {
    state.autonomyLevel = config.autonomyLevel;
  }

  recordLifecycleEvent(agentId, "autonomy_changed", { config });
}

// ── Lifecycle event logging ────────────────────────

function recordLifecycleEvent(
  agentId: string,
  kind: AgentLifecycleEventKind,
  detail: Record<string, any>,
): void {
  const event: AgentLifecycleEvent = {
    kind,
    agentId,
    timestamp: new Date().toISOString(),
    detail,
  };
  const log = lifecycleLogs.get(agentId) || [];
  log.push(event);
  // Keep last 500 events per agent
  if (log.length > 500) log.splice(0, log.length - 500);
  lifecycleLogs.set(agentId, log);
}

/** Get lifecycle events for an agent */
export function getAgentLifecycleLog(agentId: string): AgentLifecycleEvent[] {
  return lifecycleLogs.get(agentId) || [];
}

// ── Message routing (OpenRouter-compatible) ────────

/**
 * Build an agent-to-agent request using OpenRouter/OpenAI chat completions format.
 * This creates a standardized request envelope that can be routed internally
 * or sent to an external OpenRouter endpoint.
 */
export function buildAgentRequest(
  fromAgent: Agent,
  toAgent: Agent,
  message: string,
  conversationHistory: AgentChatMessage[] = [],
  options?: {
    taskId?: string;
    priority?: "low" | "normal" | "high" | "critical";
    tools?: AgentRequest["tools"];
  },
): AgentRequest {
  const model = getAgentModel(toAgent.id);

  // Build system prompt from the agent's AIEOS identity
  const systemMessage: AgentChatMessage = {
    role: "system",
    content: buildAgentSystemPrompt(toAgent),
  };

  const messages: AgentChatMessage[] = [
    systemMessage,
    ...conversationHistory,
    {
      role: "user",
      content: message,
      name: fromAgent.name,
    },
  ];

  return {
    id: crypto.randomUUID(),
    fromAgentId: fromAgent.id,
    toAgentId: toAgent.id,
    model,
    messages,
    max_tokens: 2048,
    tools: options?.tools,
    metadata: {
      channelId: undefined,
      networkId: toAgent.networkId,
      taskId: options?.taskId,
      priority: options?.priority || "normal",
    },
    createdAt: new Date().toISOString(),
  };
}

/**
 * Process an agent request — route to the appropriate LLM provider
 * and return a standardized response.
 */
export async function processAgentRequest(
  request: AgentRequest,
  agent: Agent,
): Promise<AgentResponse> {
  const state = runtimeStates.get(agent.id);
  if (state) {
    state.status = "busy";
    state.activeTaskId = request.metadata?.taskId;
    state.lastActivityAt = new Date().toISOString();
  }

  try {
    // Convert AgentChatMessages to provider format
    const systemMsg = request.messages.find(m => m.role === "system");
    const chatMsgs = request.messages
      .filter(m => m.role !== "system")
      .map(m => ({ role: m.role, content: m.content || "" }));

    const model = request.model;
    const providerReq = buildProviderRequest(
      model,
      systemMsg?.content || "",
      chatMsgs,
      request.max_tokens || 2048,
      request.tools?.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      })),
    );

    const response = await fetch(providerReq.url, {
      method: "POST",
      headers: providerReq.headers,
      body: JSON.stringify(providerReq.body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error?.message || `API request failed (${response.status})`);
    }

    const data = await response.json();
    const text = parseProviderResponse(model, data);
    const toolUseBlocks = parseToolUseBlocks(model, data);

    // Build OpenRouter-compatible response
    const agentResponse: AgentResponse = {
      requestId: request.id,
      agentId: agent.id,
      model,
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: text || null,
          tool_calls: toolUseBlocks.length > 0 ? toolUseBlocks.map(tb => ({
            id: tb.id,
            type: "function" as const,
            function: {
              name: tb.name,
              arguments: JSON.stringify(tb.input),
            },
          })) : undefined,
        },
        finish_reason: toolUseBlocks.length > 0 ? "tool_calls" : "stop",
      }],
      usage: data.usage ? {
        prompt_tokens: data.usage.prompt_tokens || 0,
        completion_tokens: data.usage.completion_tokens || 0,
        total_tokens: data.usage.total_tokens || 0,
      } : undefined,
      createdAt: new Date().toISOString(),
    };

    // Update runtime state
    if (state) {
      state.status = "idle";
      state.totalProcessed++;
      state.activeTaskId = undefined;
      state.lastActivityAt = new Date().toISOString();
    }

    recordLifecycleEvent(agent.id, "message_received", {
      fromAgentId: request.fromAgentId,
      requestId: request.id,
      hasToolCalls: toolUseBlocks.length > 0,
    });

    return agentResponse;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (state) {
      state.status = "error";
      state.lastError = errorMsg;
      state.activeTaskId = undefined;
    }
    recordLifecycleEvent(agent.id, "error_occurred", { error: errorMsg, requestId: request.id });
    throw err;
  }
}

// ── Inbox management ───────────────────────────────

/** Queue a message for an agent */
export function enqueueMessage(agentId: string, request: AgentRequest): AgentInboxMessage {
  const inbox = inboxes.get(agentId) || [];
  const msg: AgentInboxMessage = {
    id: crypto.randomUUID(),
    request,
    status: "pending",
    receivedAt: new Date().toISOString(),
  };
  inbox.push(msg);
  inboxes.set(agentId, inbox);

  const state = runtimeStates.get(agentId);
  if (state) {
    state.pendingMessages = inbox.filter(m => m.status === "pending").length;
  }

  return msg;
}

/** Get pending messages for an agent */
export function getAgentInbox(agentId: string): AgentInboxMessage[] {
  return inboxes.get(agentId) || [];
}

/** Get pending message count */
export function getAgentPendingCount(agentId: string): number {
  return (inboxes.get(agentId) || []).filter(m => m.status === "pending").length;
}

// ── Agent system prompt builder ────────────────────

/** Build a rich system prompt from the agent's AIEOS entity */
function buildAgentSystemPrompt(agent: Agent): string {
  const aieos = agent.aieos;
  const parts: string[] = [];

  // Core identity
  const name = aieos.identity?.names?.nickname || aieos.identity?.names?.first || agent.name;
  parts.push(`You are "${name}", an autonomous AI agent in a decentralized mesh workspace.`);
  parts.push(`Your DID: ${agent.did}`);
  parts.push(`Your role: ${agent.role}`);

  // Agent directive
  if (agent.prompt) {
    parts.push(`\nCore directive:\n${agent.prompt}`);
  }

  // AIEOS personality
  if (aieos.psychology?.neural_matrix) {
    const nm = aieos.psychology.neural_matrix;
    parts.push(`\nPersonality matrix: creativity=${nm.creativity}, empathy=${nm.empathy}, logic=${nm.logic}, adaptability=${nm.adaptability}`);
  }

  if (aieos.linguistics?.text_style) {
    const ts = aieos.linguistics.text_style;
    parts.push(`Communication style: formality=${ts.formality_level}, verbosity=${ts.verbosity_level}, vocabulary=${ts.vocabulary_level}`);
  }

  if (aieos.motivations?.core_drive) {
    parts.push(`Core drive: ${aieos.motivations.core_drive}`);
  }

  // Capabilities
  if (aieos.capabilities?.skills && aieos.capabilities.skills.length > 0) {
    parts.push(`\nSkills: ${aieos.capabilities.skills.map(s => s.name).join(", ")}`);
  }

  // Presence (v1.2.0)
  if (aieos.presence?.access?.website) {
    parts.push(`Website: ${aieos.presence.access.website}`);
  }

  parts.push(`\nRespond in-character. Be concise and effective. Use markdown when helpful.`);

  return parts.filter(Boolean).join("\n");
}
