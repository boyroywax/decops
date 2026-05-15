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
    reader.releaseLock();
  }

  return { contentBlocks, stopReason };
}
