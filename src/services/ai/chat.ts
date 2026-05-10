/**
 * Chat functions — agent-to-agent, user-to-agent, and workspace-level chat.
 * Extracted from services/ai.ts for modularity.
 */

import type { Agent, Message, BridgeMessage } from "@/types";
import { ROLES } from "@/constants";
import { TOOLKITS } from "@/services/toolkits";
import { getAllTools, getToolsForAgent, executeToolCall } from "@/services/commands/tools";
import type { CommandContext } from "@/services/commands/types";
import type { WorkspaceContext } from "./prompts";
import { buildWorkspaceSystemPrompt } from "./prompts";
import { getSelectedModel, getAgentModel } from "./models";
import {
  getModelProvider,
  buildProviderRequest, parseProviderResponse,
  parseToolUseBlocks, buildToolResultMessages,
} from "./providers";
import { getChatDelegation } from "./delegation";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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
      ? `\nYou have ${tools.length} tools available. When the operator asks you to do something that requires a tool, CALL THE TOOL — do not promise to do it later. After you receive tool results, summarize them concisely for the operator.`
      : "",
    `\nYou are chatting directly with a human operator who manages this workspace.`,
    `Respond concisely and in-character. Keep responses under 200 words. Use markdown formatting when appropriate.`,
  ].filter(Boolean).join("\n");

  const apiMessages: any[] = [
    ...history.slice(-20).map(m => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  const allToolCalls: ToolCallDisplay[] = [];
  const MAX_TOOL_ROUNDS = tools.length > 0 ? 6 : 1;

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const req = buildProviderRequest(
        model, systemPrompt, apiMessages, 1500,
        tools.length > 0 ? tools : undefined,
      );
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

      const toolUseBlocks = tools.length > 0 ? parseToolUseBlocks(model, data) : [];
      if (toolUseBlocks.length === 0 || !commandContext) {
        const text = parseProviderResponse(model, data);
        return { text, toolCalls: allToolCalls };
      }

      // Execute tools and feed results back
      const rawAssistant = provider === "openai"
        ? data.choices?.[0]?.message?.tool_calls
        : data.content;

      const toolResults: { id: string; content: string; isError?: boolean }[] = [];
      for (const block of toolUseBlocks) {
        const result = await executeToolCall(
          block.id,
          block.name,
          block.input || {},
          commandContext,
        );
        const display: ToolCallDisplay = {
          name: result.name,
          input: result.input,
          result: result.result,
          error: result.error,
          duration_ms: result.duration_ms,
          jobId: result.jobId,
        };
        allToolCalls.push(display);
        onToolCall?.(display);

        toolResults.push({
          id: block.id,
          content: result.error
            ? JSON.stringify({ error: result.error })
            : JSON.stringify(result.result ?? { success: true }),
          isError: !!result.error,
        });
      }

      const resultMsgs = buildToolResultMessages(model, rawAssistant, toolResults);
      apiMessages.push(...resultMsgs);
    }

    return { text: "[Tool call loop limit reached]", toolCalls: allToolCalls };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("No Anthropic API key") || msg.includes("No OpenAI API key") || msg.includes("No Google API key")) {
      return {
        text: `⚠️ No API key configured. Go to **LLM Manager → Providers** to add your API key.`,
        toolCalls: allToolCalls,
      };
    }
    return { text: `[Agent error: ${msg}]`, toolCalls: allToolCalls };
  }
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

  // Build message history
  const apiMessages: any[] = [
    ...history.slice(-20).map(m => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  const allToolCalls: ToolCallDisplay[] = [];
  const MAX_TOOL_ROUNDS = maxRounds;

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const req = buildProviderRequest(model, systemPrompt, apiMessages, 4096, tools.length > 0 ? tools : undefined);
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

      // Check for tool use
      const toolUseBlocks = parseToolUseBlocks(model, data);

      if (toolUseBlocks.length === 0 || !commandContext) {
        const text = parseProviderResponse(model, data);
        return { text, toolCalls: allToolCalls };
      }

      // Tool use round — execute tools then loop
      // Get raw assistant content for the tool result message
      const rawAssistant = provider === "openai"
        ? data.choices?.[0]?.message?.tool_calls
        : data.content;

      const toolResults: { id: string; content: string; isError?: boolean }[] = [];
      for (const block of toolUseBlocks) {
        const result = await executeToolCall(
          block.id,
          block.name,
          block.input || {},
          commandContext,
        );

        allToolCalls.push({
          name: result.name,
          input: result.input,
          result: result.result,
          error: result.error,
          duration_ms: result.duration_ms,
          jobId: result.jobId,
        });

        const content = result.error
          ? JSON.stringify({ error: result.error })
          : JSON.stringify(result.result ?? { success: true });

        toolResults.push({
          id: block.id,
          content,
          isError: !!result.error,
        });
      }

      // Append assistant + tool results in provider-specific format
      const resultMsgs = buildToolResultMessages(model, rawAssistant, toolResults);
      apiMessages.push(...resultMsgs);
    }

    return { text: "[Tool call loop limit reached]", toolCalls: allToolCalls };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("No Anthropic API key") || msg.includes("No OpenAI API key") || msg.includes("No Google API key")) {
      return { text: "⚠️ No API key configured. Go to **LLM Manager → Providers** to add your API key.", toolCalls: [] };
    }
    return { text: `[Chat error: ${msg}]`, toolCalls: [] };
  }
}
