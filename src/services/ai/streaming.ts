/**
 * SSE stream parser and streaming chat implementation.
 * Extracted from services/ai.ts for modularity.
 */

import type { CommandContext } from "@/services/commands/types";
import { getAllTools, executeToolCall } from "@/services/commands/tools";
import type { ToolCallDisplay, ChatMessage } from "./chat";
import type { WorkspaceContext } from "./prompts";
import { buildWorkspaceSystemPrompt } from "./prompts";
import { getSelectedModel, getAgentModel } from "./models";
import {
  ANTHROPIC_API_URL,
  getModelProvider, getApiKey, buildHeaders,
  buildProviderRequest, parseProviderResponse,
  parseToolUseBlocks, buildToolResultMessages,
} from "./providers";
import { chatWithWorkspace } from "./chat";
import { shouldDelegateToStudioBot } from "@/services/studioBot";

// ── SSE Stream Parser ──────────────────────────────

/**
 * Parse Anthropic SSE stream and invoke callbacks for each event.
 * Handles `content_block_delta` (text), `content_block_start` (tool_use),
 * `message_stop`, and error events.
 */
async function parseAnthropicSSE(
  response: Response,
  callbacks: {
    onText: (text: string) => void;
    onToolUseStart: (block: { id: string; name: string }) => void;
    onToolUseInput: (json: string) => void;
    onContentBlockStop: () => void;
    onMessageStop: () => void;
    onError: (err: Error) => void;
  },
  signal?: AbortSignal,
): Promise<{ contentBlocks: any[]; stopReason: string }> {
  const reader = response.body!.getReader();

  // If abort fires, cancel the reader
  if (signal) {
    signal.addEventListener("abort", () => { reader.cancel(); }, { once: true });
  }
  const decoder = new TextDecoder();
  let buffer = "";
  let stopReason = "end_turn";

  // Track content blocks for tool use
  const contentBlocks: any[] = [];
  let currentBlockIndex = -1;
  let currentToolInput = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === "[DONE]") continue;

        try {
          const event = JSON.parse(jsonStr);

          switch (event.type) {
            case "content_block_start": {
              currentBlockIndex = event.index ?? contentBlocks.length;
              const block = event.content_block;
              if (block.type === "text") {
                contentBlocks[currentBlockIndex] = { type: "text", text: "" };
              } else if (block.type === "tool_use") {
                contentBlocks[currentBlockIndex] = {
                  type: "tool_use",
                  id: block.id,
                  name: block.name,
                  input: {},
                };
                currentToolInput = "";
                callbacks.onToolUseStart({ id: block.id, name: block.name });
              }
              break;
            }
            case "content_block_delta": {
              const delta = event.delta;
              const idx = event.index ?? currentBlockIndex;
              if (delta.type === "text_delta" && delta.text) {
                callbacks.onText(delta.text);
                if (contentBlocks[idx]) {
                  contentBlocks[idx].text = (contentBlocks[idx].text || "") + delta.text;
                }
              } else if (delta.type === "input_json_delta" && delta.partial_json) {
                currentToolInput += delta.partial_json;
                callbacks.onToolUseInput(delta.partial_json);
              }
              break;
            }
            case "content_block_stop": {
              const idx = event.index ?? currentBlockIndex;
              // Finalize tool input JSON
              if (contentBlocks[idx]?.type === "tool_use" && currentToolInput) {
                try {
                  contentBlocks[idx].input = JSON.parse(currentToolInput);
                } catch {
                  contentBlocks[idx].input = {};
                }
                currentToolInput = "";
              }
              callbacks.onContentBlockStop();
              break;
            }
            case "message_delta": {
              if (event.delta?.stop_reason) {
                stopReason = event.delta.stop_reason;
              }
              break;
            }
            case "message_stop": {
              callbacks.onMessageStop();
              break;
            }
            case "error": {
              const errMsg = event.error?.message || "Stream error";
              callbacks.onError(new Error(errMsg));
              break;
            }
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { contentBlocks, stopReason };
}

// ── Streaming Chat ─────────────────────────────────

export interface StreamCallbacks {
  /** Called with each text token as it arrives */
  onToken: (token: string) => void;
  /** Called when a tool call starts executing (for UI feedback) */
  onToolCallStart?: (name: string, input: Record<string, any>) => void;
  /** Called when a tool call completes */
  onToolCallComplete?: (display: ToolCallDisplay) => void;
  /** AbortSignal — when fired, streaming stops immediately */
  signal?: AbortSignal;
}

/**
 * Streaming version of chatWithWorkspace.
 * Text tokens are pushed via onToken callback for live display.
 * Tool use rounds are handled internally — the final text response streams.
 * Returns the complete result for persistence.
 */
export async function streamChatWithWorkspace(
  userMessage: string,
  history: ChatMessage[],
  ctx: WorkspaceContext,
  callbacks: StreamCallbacks,
  commandContext?: CommandContext,
): Promise<{ text: string; toolCalls: ToolCallDisplay[] }> {
  const model = getSelectedModel();
  const provider = getModelProvider(model);
  let systemPrompt = buildWorkspaceSystemPrompt(ctx);

  // Studio Bot delegation: when the message is studio-related, enhance the system prompt
  // with explicit auto-layout instructions and increase tool rounds for complex jobs
  const isStudioRequest = shouldDelegateToStudioBot(userMessage);
  let maxToolRounds = 8;
  if (isStudioRequest) {
    systemPrompt += "\n\n[STUDIO BOT ACTIVE] This request involves Studio operations. " +
      "ALWAYS call studio_auto_layout after creating or modifying jobs to ensure clean canvas layout. " +
      "Use studio_create_job for building complete jobs in one call. " +
      "Ensure all parallel steps write to unique storage keys.";
    maxToolRounds = 12; // More rounds for complex job building
  }

  // For non-Anthropic providers, fall back to non-streaming (emit all at once)
  if (provider !== "anthropic") {
    const result = await chatWithWorkspace(userMessage, history, ctx, commandContext);
    // Emit the full text as a single token burst
    if (result.text) callbacks.onToken(result.text);
    return result;
  }

  const tools = commandContext ? getAllTools() : [];

  const apiMessages: any[] = [
    ...history.slice(-20).map(m => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  const allToolCalls: ToolCallDisplay[] = [];
  const MAX_TOOL_ROUNDS = maxToolRounds;
  let fullText = "";

  try {
    const apiKey = getApiKey();
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const body: any = {
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: apiMessages,
        stream: true,
      };

      if (tools.length > 0 && commandContext) {
        body.tools = tools;
        body.tool_choice = { type: "auto" };
      }

      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: buildHeaders(apiKey),
        body: JSON.stringify(body),
        signal: callbacks.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error?.message || `API request failed (${response.status})`);
      }

      // Parse the SSE stream
      let roundText = "";
      const { contentBlocks } = await parseAnthropicSSE(response, {
        onText: (token) => {
          roundText += token;
          callbacks.onToken(token);
        },
        onToolUseStart: (block) => {
          callbacks.onToolCallStart?.(block.name, {});
        },
        onToolUseInput: () => { /* accumulating internally */ },
        onContentBlockStop: () => { },
        onMessageStop: () => { },
        onError: (err) => { throw err; },
      }, callbacks.signal);

      // Check for tool use blocks
      const toolUseBlocks = contentBlocks.filter((b: any) => b.type === "tool_use");

      fullText += roundText;

      if (toolUseBlocks.length === 0 || !commandContext) {
        // No tool calls — streaming is complete
        const text = fullText || "[No response]";
        return { text, toolCalls: allToolCalls };
      }

      // Tool use round — execute tools then loop
      apiMessages.push({ role: "assistant", content: contentBlocks });

      const toolResults: any[] = [];
      for (const block of toolUseBlocks) {
        callbacks.onToolCallStart?.(block.name, block.input || {});

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
        callbacks.onToolCallComplete?.(display);

        const content = result.error
          ? JSON.stringify({ error: result.error })
          : JSON.stringify(result.result ?? { success: true });

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content,
          ...(result.error ? { is_error: true } : {}),
        });
      }

      apiMessages.push({ role: "user", content: toolResults });
      // Separate rounds with newline if there was text before the tool calls
      if (roundText) fullText += "\n\n";
      // Loop continues — next round will stream the AI's response to tool results
    }

    return { text: fullText || "[Tool call loop limit reached]", toolCalls: allToolCalls };
  } catch (err) {
    // Abort is a normal cancellation — return whatever we have so far
    if (err instanceof DOMException && err.name === "AbortError") {
      return { text: fullText || "[Cancelled]", toolCalls: allToolCalls };
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("No Anthropic API key") || msg.includes("No OpenAI API key") || msg.includes("No Google API key")) {
      return { text: "⚠️ No API key configured. Go to **LLM Manager → Providers** to add your API key.", toolCalls: [] };
    }
    return { text: fullText || `[Chat error: ${msg}]`, toolCalls: allToolCalls };
  }
}
