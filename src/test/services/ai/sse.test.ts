import { describe, it, expect, vi } from "vitest";
import { parseOpenAISSE } from "@/services/ai/sse";

function makeSSE(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

function sseEvent(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

describe("parseOpenAISSE", () => {
  it("emits tool start only once per tool index", async () => {
    const onText = vi.fn();
    const onToolUseStart = vi.fn();
    const onToolUseInput = vi.fn();

    const response = makeSSE([
      sseEvent({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: "deploy_network" } }] } }] }),
      sseEvent({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { arguments: "{\"config\":" } }] } }] }),
      sseEvent({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "{}" } }] } }] }),
      sseEvent({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "}" } }] } }] }),
      "data: [DONE]\n\n",
    ]);

    const result = await parseOpenAISSE(response, {
      onText,
      onToolUseStart,
      onToolUseInput,
    });

    expect(onText).not.toHaveBeenCalled();
    expect(onToolUseStart).toHaveBeenCalledTimes(1);
    expect(onToolUseStart).toHaveBeenCalledWith({ id: "call_1", name: "deploy_network" });
    expect(onToolUseInput).toHaveBeenCalledTimes(3);
    expect(result.toolCalls).toEqual([
      {
        id: "call_1",
        name: "deploy_network",
        arguments: '{"config":{}}',
      },
    ]);
  });

  it("streams text deltas in order", async () => {
    const onText = vi.fn();

    const response = makeSSE([
      sseEvent({ choices: [{ delta: { content: "Hello " } }] }),
      sseEvent({ choices: [{ delta: { content: "world" } }] }),
      "data: [DONE]\n\n",
    ]);

    const result = await parseOpenAISSE(response, { onText });

    expect(onText).toHaveBeenNthCalledWith(1, "Hello ");
    expect(onText).toHaveBeenNthCalledWith(2, "world");
    expect(result.text).toBe("Hello world");
    expect(result.toolCalls).toEqual([]);
  });
});
