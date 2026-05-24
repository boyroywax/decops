/**
 * Streaming workspace chat — thin wrapper over the unified `runChatTurn`
 * runner. Kept for backward compatibility with existing call sites
 * (ChatPanel, delegation helpers). New code should call `runChatTurn`
 * directly with `stream: true`.
 */

import type { CommandContext } from "@/services/commands/types";
import { getAllTools, getToolsByToolkitIds } from "@/services/commands/tools";
import type { ToolCallDisplay, ChatMessage } from "./chat";
import type { WorkspaceContext } from "./prompts";
import { buildWorkspaceSystemPrompt } from "./prompts";
import { getSelectedModel } from "./models";
import { getModelProvider } from "./providers";
import { getChatDelegation } from "./delegation";
import { runChatTurn } from "./runner";
import type { ChatTurnMessage } from "./runner";

// Re-export the SSE parser so any external caller importing it from this
// module continues to work after the move into sse.ts.
export { parseAnthropicSSE } from "./sse";

export interface StreamCallbacks {
  /** Called with each text token as it arrives. Non-streaming providers
   *  emit synthetic chunks so the UI still updates progressively. */
  onToken: (token: string) => void;
  /** Called when a tool call starts executing (UI feedback). */
  onToolCallStart?: (name: string, input: Record<string, unknown>) => void;
  /** Called when a tool call completes. */
  onToolCallComplete?: (display: ToolCallDisplay) => void;
  /** Called after each provider round finishes (after any tool exec). UI
   *  can use this to show an interim "processing tool results" hint. */
  onRoundEnd?: (round: number) => void;
  /** AbortSignal — when fired, the run stops and returns whatever it has. */
  signal?: AbortSignal;
}

/**
 * Streaming workspace chat.
 *
 * Anthropic models stream tokens live via SSE. Every other provider falls
 * back to a single-shot request, then emits synthetic text chunks so the UI
 * still presents progressive typing.
 */
export async function streamChatWithWorkspace(
  userMessage: string,
  history: ChatMessage[],
  ctx: WorkspaceContext,
  callbacks: StreamCallbacks,
  commandContext?: CommandContext,
  /** Optional toolkit allowlist from the active chat agent. */
  toolkitIds?: string[],
): Promise<{ text: string; toolCalls: ToolCallDisplay[] }> {
  const model = getSelectedModel();
  const provider = getModelProvider(model);
  let systemPrompt = buildWorkspaceSystemPrompt(ctx);

  // Pluggable delegation — toolkits can augment the system prompt and
  // adjust round budget based on keyword detection in the user message.
  const delegation = getChatDelegation(userMessage);
  let maxRounds = 8;
  if (delegation) {
    systemPrompt = delegation.enhance(systemPrompt);
    maxRounds = delegation.maxRounds ?? 12;
  }

  const tools = commandContext
    ? (toolkitIds && toolkitIds.length > 0 ? getToolsByToolkitIds(toolkitIds) : getAllTools())
    : [];

  const messages: ChatTurnMessage[] = [
    ...history.slice(-20).map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  const result = await runChatTurn(
    {
      model,
      systemPrompt,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      commandContext,
      maxRounds,
      stream: provider === "anthropic" || provider === "openai" || provider === "openrouter",
    },
    {
      onToken: callbacks.onToken,
      onToolCallStart: callbacks.onToolCallStart,
      onToolCallComplete: callbacks.onToolCallComplete,
      onRoundEnd: callbacks.onRoundEnd,
      signal: callbacks.signal,
    },
  );

  return { text: result.text, toolCalls: result.toolCalls };
}
