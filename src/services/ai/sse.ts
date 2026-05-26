/**
 * Anthropic Server-Sent Events parser.
 *
 * Extracted from streaming.ts so the unified `runChatTurn` runner and any
 * legacy callers can share one implementation. The parser is provider-
 * specific (Anthropic SSE format) but generic over UI — callers provide
 * callbacks for text deltas, tool-use lifecycle events, and errors.
 */

export interface AnthropicSSECallbacks {
  onText: (text: string) => void;
  onToolUseStart: (block: { id: string; name: string }) => void;
  onToolUseInput: (json: string) => void;
  onContentBlockStop: () => void;
  onMessageStop: () => void;
  onError: (err: Error) => void;
}

export type SSETextBlock = { type: "text"; text: string };
export type SSEToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};
export type SSEContentBlock = SSETextBlock | SSEToolUseBlock;

export async function parseAnthropicSSE(
  response: Response,
  callbacks: AnthropicSSECallbacks,
  signal?: AbortSignal,
): Promise<{ contentBlocks: SSEContentBlock[]; stopReason: string }> {
  const reader = response.body!.getReader();
  if (signal) {
    signal.addEventListener("abort", () => { reader.cancel(); }, { once: true });
  }
  const decoder = new TextDecoder();
  let buffer = "";
  let stopReason = "end_turn";

  const contentBlocks: SSEContentBlock[] = [];
  let currentBlockIndex = -1;
  let currentToolInput = "";
  // Track whether we're inside a native Anthropic thinking block.
  // When the model uses its built-in thinking mode, the SSE stream emits
  // content_block_start with type "thinking" and thinking_delta events.
  // We wrap these in ```thinking fences so the downstream parseActions()
  // extractor can surface them as ThinkingCard UI elements.
  let inThinkingBlock = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

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
              } else if (block.type === "thinking") {
                // Native Anthropic thinking block — open a ```thinking
                // fence so parseActions() can extract it downstream.
                inThinkingBlock = true;
                callbacks.onText("```thinking\n");
              }
              break;
            }
            case "content_block_delta": {
              const delta = event.delta;
              const idx = event.index ?? currentBlockIndex;
              if (delta.type === "text_delta" && delta.text) {
                callbacks.onText(delta.text);
                const block = contentBlocks[idx];
                if (block && block.type === "text") {
                  block.text = (block.text || "") + delta.text;
                }
              } else if (delta.type === "input_json_delta" && delta.partial_json) {
                currentToolInput += delta.partial_json;
                callbacks.onToolUseInput(delta.partial_json);
              } else if (delta.type === "thinking_delta" && delta.thinking) {
                // Native thinking delta — pass through as-is so it ends
                // up inside the ```thinking fence we opened above.
                callbacks.onText(delta.thinking);
              }
              break;
            }
            case "content_block_stop": {
              const idx = event.index ?? currentBlockIndex;
              const block = contentBlocks[idx];
              if (block && block.type === "tool_use" && currentToolInput) {
                try {
                  block.input = JSON.parse(currentToolInput);
                } catch {
                  block.input = {};
                }
                currentToolInput = "";
              }
              if (inThinkingBlock) {
                // Close the ```thinking fence.
                callbacks.onText("\n```\n");
                inThinkingBlock = false;
              }
              callbacks.onContentBlockStop();
              break;
            }
            case "message_delta": {
              if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
              break;
            }
            case "message_stop": {
              callbacks.onMessageStop();
              break;
            }
            case "error": {
              callbacks.onError(new Error(event.error?.message || "Stream error"));
              break;
            }
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }
  } finally {
    // If the stream ended mid-thinking, close the fence so the block
    // is still parseable.
    if (inThinkingBlock) {
      callbacks.onText("\n```\n");
      inThinkingBlock = false;
    }
    reader.releaseLock();
  }

  return { contentBlocks, stopReason };
}

/**
 * OpenAI-style SSE parser (used by OpenAI + OpenRouter chat completions).
 * Streams text deltas immediately and accumulates tool_call deltas so the
 * runner can execute tools without waiting for the full response.
 */
export interface OpenAISSECallbacks {
  onText: (text: string) => void;
  /** Fired when a new tool_call delta arrives with a new index. */
  onToolUseStart?: (block: { id: string; name: string }) => void;
  /** Fired when tool_call function arguments delta arrives. */
  onToolUseInput?: (json: string) => void;
}

export async function parseOpenAISSE(
  response: Response,
  callbacks: OpenAISSECallbacks,
  signal?: AbortSignal,
): Promise<{ text: string; toolCalls: Array<{ id: string; name: string; arguments: string }> }> {
  const reader = response.body!.getReader();
  if (signal) {
    signal.addEventListener("abort", () => { reader.cancel(); }, { once: true });
  }
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  // Accumulate tool call deltas keyed by index.
  const toolCallByIndex: Array<{ id: string; name: string; arguments: string }> = [];
  // Track whether we've announced start for a given tool-call index.
  const startedIndexes = new Set<number>();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const event = JSON.parse(payload);
          const delta = event?.choices?.[0]?.delta;
          if (!delta) continue;
          // Text content delta
          if (typeof delta.content === "string" && delta.content.length > 0) {
            full += delta.content;
            callbacks.onText(delta.content);
          }
          // Tool call deltas — each delta may contain partial tool_calls
          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCallByIndex[idx]) {
                toolCallByIndex[idx] = { id: "", name: "", arguments: "" };
              }
              const entry = toolCallByIndex[idx];
              if (tc.id) entry.id = tc.id;
              if (tc.function?.name) entry.name = tc.function.name;
              if (tc.function?.arguments) {
                entry.arguments += tc.function.arguments;
                callbacks.onToolUseInput?.(tc.function.arguments);
              }
              // Fire onToolUseStart exactly once when both id and name exist.
              if (entry.id && entry.name && !startedIndexes.has(idx)) {
                startedIndexes.add(idx);
                callbacks.onToolUseStart?.({ id: entry.id, name: entry.name });
              }
            }
          }
        } catch {
          // skip malformed line
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { text: full, toolCalls: toolCallByIndex.filter(tc => tc.id && tc.name) };
}
