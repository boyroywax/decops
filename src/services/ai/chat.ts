/**
 * Chat functions — agent-to-agent, user-to-agent, and workspace-level chat.
 * Extracted from services/ai.ts for modularity.
 */

import type { Agent, Message, BridgeMessage, ArchPhase, DeployProgress, MeshConfig } from "@/types";
import { ROLES } from "@/constants";
import { TOOLKITS } from "@/services/toolkits";
import { getAllTools, getToolsForAgent } from "@/services/commands/tools";
import type { CommandContext } from "@/services/commands/types";
import type { WorkspaceContext } from "./prompts";
import { buildWorkspaceSystemPrompt } from "./prompts";
import { getSelectedModel, getAgentModel } from "./models";
import {
  getModelProvider,
  buildProviderRequest, parseProviderResponse,
} from "./providers";
import { getChatDelegation } from "./delegation";
import { runChatTurn } from "./runner";

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  architectCard?: {
    prompt: string;
    phase: ArchPhase;
    preview: MeshConfig | null;
    deployProgress: DeployProgress;
    live?: boolean;
  };
  /** Tool calls the AI made (stored for display) */
  toolCalls?: ToolCallDisplay[];
  /** Job ID(s) associated with this message — renders inline progress */
  jobIds?: string[];
}

/** Lightweight representation of a tool call for display in chat */
export interface ToolCallDisplay {
  name: string;
  input: Record<string, any>;
  result: any;
  error?: string;
  duration_ms: number;
  jobId?: string;
}

export async function callAgentAI(
  agent: Agent,
  senderAgent: Agent,
  message: string,
  channelType: string,
  conversationHistory: (Message | BridgeMessage)[],
  crossNetworkCtx?: string,
): Promise<string> {
  const model = getAgentModel(agent.id);

  const systemPrompt = [
    `You are "${agent.name}", a ${ROLES.find(r => r.id === agent.role)?.label} agent in a decentralized mesh workspace.`,
    `Your DID: ${agent.did}`,
    `Communication channel type: ${channelType}`,
    agent.prompt ? `\nYour core directive:\n${agent.prompt}` : "",
    agent.toolkits && agent.toolkits.length > 0
      ? `\nYour enabled toolkits: ${agent.toolkits.map(b => {
          const tk = TOOLKITS.find(t => t.id === b.toolkitId);
          return tk ? `${tk.name} (${tk.commands.length} commands)` : b.toolkitId;
        }).join(", ")}. You can only use commands from these toolkits.`
      : "",
    crossNetworkCtx ? `\nCROSS-NETWORK BRIDGE: This message comes from "${senderAgent.name}" in the "${crossNetworkCtx}" network. You are in a different network. Acknowledge the cross-network context.` : "",
    `\nYou are receiving a message from "${senderAgent.name}" (${ROLES.find(r => r.id === senderAgent.role)?.label}, DID: ${senderAgent.did}).`,
    `Respond concisely and in-character. Keep responses under 150 words. If you have structured output, use markdown formatting.`,
  ].filter(Boolean).join("\n");

  const messages: { role: string; content: string }[] = [];
  conversationHistory.slice(-6).forEach((m) => {
    messages.push({ role: m.fromId === agent.id ? "assistant" : "user", content: m.content });
    if (m.response && m.fromId !== agent.id) messages.push({ role: "assistant", content: m.response });
  });
  messages.push({ role: "user", content: message });

  try {
    const req = buildProviderRequest(model, systemPrompt, messages, 1000);
    const response = await fetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(req.body),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error?.message || `API request failed (${response.status})`);
    }
    const data = await response.json();
    return parseProviderResponse(model, data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `[Agent error: ${msg}]`;
  }
}

/**
 * Direct user-to-agent chat. The user is a human operator, not another agent.
 * Uses the agent's system prompt and role to respond in-character.
 *
 * If a CommandContext is supplied, the agent gains tool-use capability scoped to
 * its enabled toolkits, and we run a tool-call loop until the model emits a
 * final text response (or hits the round limit).
 */
export async function chatWithAgent(
  agent: Agent,
  userMessage: string,
  history: ChatMessage[],
  commandContext?: CommandContext,
  onToolCall?: (display: ToolCallDisplay) => void,
): Promise<{ text: string; toolCalls: ToolCallDisplay[] }> {
  const model = getAgentModel(agent.id);
  const provider = getModelProvider(model);

  const role = ROLES.find(r => r.id === agent.role);
  const tools = commandContext && (provider === "anthropic" || provider === "openai")
    ? getToolsForAgent(agent)
    : [];

  const systemPrompt = [
    `You are "${agent.name}", a ${role?.label || agent.role} agent in a decentralized mesh workspace.`,
    `Your DID: ${agent.did}`,
    agent.prompt ? `\nYour core directive:\n${agent.prompt}` : "",
    agent.toolkits && agent.toolkits.length > 0
      ? `\nYour enabled toolkits: ${agent.toolkits.map(b => {
          const tk = TOOLKITS.find(t => t.id === b.toolkitId);
          return tk ? `${tk.name} (${tk.commands.length} commands)` : b.toolkitId;
        }).join(", ")}. You can only use commands from these toolkits. If you need a capability from a disabled toolkit, ask the operator to enable it.`
      : "",
    tools.length > 0
      ? `\nYou have ${tools.length} tools available. When responding to a user's prompt, you must follow this methodology:
- First attempt to understand and extrapolate on the meaning of the user's prompt.
- If the prompt is asking for an action to be conducted on the workspace, or within libp2p, define the action/s to call.
- Then, queue the jobs that will direct those actions.
- Finally, review the output of the job/s and return an analysis of the ran job.
- If an error occurs, reapproach the prompt and attempt to restart the understanding process unless you need more/missing information from the user.`
      : "",
    `\nYou are chatting directly with a human operator who manages this workspace.`,
    `Respond concisely and in-character. Keep responses under 200 words. Use markdown formatting when appropriate.`,
  ].filter(Boolean).join("\n");

  const messages: any[] = [
    ...history.slice(-20).map(m => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  const result = await runChatTurn(
    {
      model,
      systemPrompt,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      commandContext,
      maxRounds: tools.length > 0 ? 6 : 1,
      maxTokens: 1500,
    },
    {
      onToolCallComplete: onToolCall,
    },
  );
  return { text: result.text, toolCalls: result.toolCalls };
}

export async function chatWithWorkspace(
  userMessage: string,
  history: ChatMessage[],
  ctx: WorkspaceContext,
  commandContext?: CommandContext,
): Promise<{ text: string; toolCalls: ToolCallDisplay[] }> {
  const model = getSelectedModel();
  const provider = getModelProvider(model);
  let systemPrompt = buildWorkspaceSystemPrompt(ctx);

  // Pluggable delegation: toolkits can register delegation checks
  const delegation = getChatDelegation(userMessage);
  let maxRounds = 8;
  if (delegation) {
    systemPrompt = delegation.enhance(systemPrompt);
    maxRounds = delegation.maxRounds ?? 12;
  }

  // Build tools from command registry (tool use supported for anthropic + openai)
  const tools = commandContext && (provider === "anthropic" || provider === "openai") ? getAllTools() : [];

  const messages: any[] = [
    ...history.slice(-20).map(m => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  const result = await runChatTurn({
    model,
    systemPrompt,
    messages,
    tools: tools.length > 0 ? tools : undefined,
    commandContext,
    maxRounds,
  });
  return { text: result.text, toolCalls: result.toolCalls };
}
