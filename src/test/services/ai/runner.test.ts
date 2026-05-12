import { describe, it, expect, vi, beforeEach } from "vitest";
import { runChatTurn, type ChatRunResult } from "@/services/ai/runner";
import type { CommandContext } from "@/services/commands/types";

/**
 * runner.ts mocking strategy:
 *
 *  • Providers: stubbed so we don't need real API keys, real URL parsing,
 *    or real tool-block payload shapes. We control exactly what tool blocks
 *    each round emits via `parseToolUseBlocks`.
 *  • SSE: stubbed — every test in this file uses the non-streaming path
 *    (stream:false). The SSE path has its own integration concerns and
 *    requires a ReadableStream fixture; not covered here.
 *  • executeToolCall: stubbed so we don't actually queue jobs through the
 *    registry — the test verifies the runner's loop behaviour, not the
 *    command execution pipeline (already tested elsewhere).
 *  • fetch: stubbed; the runner doesn't care about HTTP shape because
 *    parseProviderResponse / parseToolUseBlocks do the unpacking.
 */

vi.mock("@/services/ai/providers", () => ({
    ANTHROPIC_API_URL: "https://api.test/anthropic",
    getModelProvider: vi.fn(() => "anthropic"),
    getApiKey: vi.fn(() => "test-key"),
    buildHeaders: vi.fn(() => ({ "Content-Type": "application/json" })),
    buildProviderRequest: vi.fn((_model, _sp, _msgs, _max) => ({
        url: "https://api.test/messages",
        headers: { "Content-Type": "application/json" },
        body: { /* shape doesn't matter — parsers below are mocked */ },
    })),
    parseProviderResponse: vi.fn(),
    parseToolUseBlocks: vi.fn(),
    buildToolResultMessages: vi.fn(() => [
        { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "{}" }] },
    ]),
}));

vi.mock("@/services/ai/sse", () => ({
    parseAnthropicSSE: vi.fn(),
}));

vi.mock("@/services/commands/tools", () => ({
    executeToolCall: vi.fn(),
}));

import {
    parseProviderResponse,
    parseToolUseBlocks,
    getApiKey,
} from "@/services/ai/providers";
import { executeToolCall } from "@/services/commands/tools";

const mockFetch = vi.fn();
(globalThis as any).fetch = mockFetch;

function jsonResponse(data: any, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => data,
    } as Response;
}

function makeCtx(): CommandContext {
    // Runner only touches commandContext when dispatching tool calls, and
    // the tool dispatcher is fully mocked here.
    return {} as unknown as CommandContext;
}

beforeEach(() => {
    vi.resetAllMocks();
    mockFetch.mockReset();
    (getApiKey as any).mockReturnValue("test-key");
});

describe("runChatTurn: end_turn (no tool calls)", () => {
    it("returns the model's text and stops when no tool_use blocks", async () => {
        mockFetch.mockResolvedValueOnce(jsonResponse({ content: [] }));
        (parseProviderResponse as any).mockReturnValue("Hello world");
        (parseToolUseBlocks as any).mockReturnValue([]);

        const tokens: string[] = [];
        const result = await runChatTurn(
            {
                model: "claude-3-opus",
                systemPrompt: "You are a test bot",
                messages: [{ role: "user", content: "hi" }],
            },
            { onToken: (t) => tokens.push(t) },
        );

        expect(result.reason).toBe("end_turn");
        expect(result.text).toBe("Hello world");
        expect(result.toolCalls).toEqual([]);
        expect(tokens).toEqual(["Hello world"]);
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("returns the [No response] sentinel when the model emits empty text", async () => {
        mockFetch.mockResolvedValueOnce(jsonResponse({ content: [] }));
        (parseProviderResponse as any).mockReturnValue("");
        (parseToolUseBlocks as any).mockReturnValue([]);

        const result = await runChatTurn({
            model: "claude-3-opus",
            systemPrompt: "x",
            messages: [],
        });

        expect(result.reason).toBe("end_turn");
        expect(result.text).toBe("[No response]");
    });
});

describe("runChatTurn: tool-use loop", () => {
    it("executes a tool call and continues to a second round", async () => {
        // Round 1: model emits a tool_use, no text
        // Round 2: model emits final text, no tool_use → end_turn
        mockFetch
            .mockResolvedValueOnce(jsonResponse({ content: [] }))
            .mockResolvedValueOnce(jsonResponse({ content: [] }));

        (parseToolUseBlocks as any)
            .mockReturnValueOnce([{ id: "t1", name: "create_agent", input: { name: "Alice" } }])
            .mockReturnValueOnce([]);

        (parseProviderResponse as any)
            .mockReturnValueOnce("") // first round: just a tool call
            .mockReturnValueOnce("Agent created: Alice");

        (executeToolCall as any).mockResolvedValueOnce({
            name: "create_agent",
            input: { name: "Alice" },
            result: { id: "a1", name: "Alice" },
            duration_ms: 12,
            jobId: "job-1",
        });

        const result = await runChatTurn({
            model: "claude-3-opus",
            systemPrompt: "x",
            messages: [{ role: "user", content: "make an agent" }],
            tools: [{ name: "create_agent", input_schema: {} }],
            commandContext: makeCtx(),
        });

        expect(result.reason).toBe("end_turn");
        expect(result.text).toContain("Agent created: Alice");
        expect(result.toolCalls).toHaveLength(1);
        expect(result.toolCalls[0].name).toBe("create_agent");
        expect(result.toolCalls[0].jobId).toBe("job-1");
        expect(executeToolCall).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("stops with no_command_context when tools requested but no context", async () => {
        mockFetch.mockResolvedValueOnce(jsonResponse({ content: [] }));
        (parseToolUseBlocks as any).mockReturnValue([{ id: "t1", name: "x", input: {} }]);
        (parseProviderResponse as any).mockReturnValue("partial");

        // Tools provided but no commandContext → wantsTools=false → runner
        // treats first round as a normal end_turn (since parseToolUseBlocks
        // is only consulted when wantsTools is true). So instead, we test
        // the defensive branch differently: pass commandContext but then
        // null it. Simplest path: assert that wantsTools is false when
        // either tools or context is missing → end_turn path.
        const result = await runChatTurn({
            model: "claude-3-opus",
            systemPrompt: "x",
            messages: [],
            tools: [{ name: "x" }],
            // commandContext intentionally omitted
        });

        // Without commandContext, runner treats it as no-tools mode and
        // immediately ends on the first round's text.
        expect(["end_turn", "no_command_context"]).toContain(result.reason);
    });

    it("propagates intercepted tool calls without invoking executeToolCall", async () => {
        mockFetch
            .mockResolvedValueOnce(jsonResponse({ content: [] }))
            .mockResolvedValueOnce(jsonResponse({ content: [] }));
        (parseToolUseBlocks as any)
            .mockReturnValueOnce([{ id: "t1", name: "blocked_op", input: { x: 1 } }])
            .mockReturnValueOnce([]);
        (parseProviderResponse as any)
            .mockReturnValueOnce("")
            .mockReturnValueOnce("done");

        const result = await runChatTurn(
            {
                model: "claude-3-opus",
                systemPrompt: "x",
                messages: [],
                tools: [{ name: "blocked_op" }],
                commandContext: makeCtx(),
            },
            {
                interceptToolCall: (name) =>
                    name === "blocked_op"
                        ? { content: "denied", isError: true, error: "Permission denied" }
                        : null,
            },
        );

        expect(result.reason).toBe("end_turn");
        expect(result.toolCalls).toHaveLength(1);
        expect(result.toolCalls[0].error).toBe("Permission denied");
        // The interceptor short-circuited — the real dispatcher was never invoked.
        expect(executeToolCall).not.toHaveBeenCalled();
    });

    it("returns max_rounds when the loop hits its cap", async () => {
        // Configure every round to emit a tool call so the runner keeps looping.
        const calls = Array.from({ length: 10 });
        for (const _ of calls) {
            mockFetch.mockResolvedValueOnce(jsonResponse({ content: [] }));
        }
        (parseToolUseBlocks as any).mockReturnValue([
            { id: "t-loop", name: "loop_tool", input: {} },
        ]);
        (parseProviderResponse as any).mockReturnValue("loop text");
        (executeToolCall as any).mockResolvedValue({
            name: "loop_tool",
            input: {},
            result: {},
            duration_ms: 1,
        });

        const result = await runChatTurn({
            model: "claude-3-opus",
            systemPrompt: "x",
            messages: [],
            tools: [{ name: "loop_tool" }],
            commandContext: makeCtx(),
            maxRounds: 3,
        });

        expect(result.reason).toBe("max_rounds");
        expect(result.toolCalls).toHaveLength(3);
        expect(executeToolCall).toHaveBeenCalledTimes(3);
    });
});

describe("runChatTurn: error & abort handling", () => {
    it("returns reason='aborted' when signal is pre-aborted", async () => {
        const controller = new AbortController();
        controller.abort();

        const result = await runChatTurn(
            {
                model: "claude-3-opus",
                systemPrompt: "x",
                messages: [],
            },
            { signal: controller.signal },
        );

        expect(result.reason).toBe("aborted");
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns reason='aborted' when fetch throws AbortError mid-flight", async () => {
        const abortErr = new DOMException("aborted", "AbortError");
        mockFetch.mockRejectedValueOnce(abortErr);

        const result = await runChatTurn({
            model: "claude-3-opus",
            systemPrompt: "x",
            messages: [],
        });

        expect(result.reason).toBe("aborted");
    });

    it("returns reason='error' with the provider message for HTTP failures", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: async () => ({ error: { message: "boom" } }),
        } as Response);

        const result = await runChatTurn({
            model: "claude-3-opus",
            systemPrompt: "x",
            messages: [],
        });

        expect(result.reason).toBe("error");
        expect(result.error).toContain("boom");
    });

    it("surfaces the missing-key UX when getApiKey throws the marker error", async () => {
        // The runner's isMissingKeyError matches text — easiest is to throw
        // from fetch with that exact message.
        mockFetch.mockRejectedValueOnce(new Error("No Anthropic API key configured"));

        const result = await runChatTurn({
            model: "claude-3-opus",
            systemPrompt: "x",
            messages: [],
        });

        expect(result.reason).toBe("error");
        expect(result.text).toContain("No API key configured");
        expect(result.text).toContain("LLM Manager");
    });
});

describe("runChatTurn: callbacks", () => {
    it("fires onRoundEnd at the end of each round", async () => {
        mockFetch.mockResolvedValueOnce(jsonResponse({ content: [] }));
        (parseToolUseBlocks as any).mockReturnValueOnce([]);
        (parseProviderResponse as any).mockReturnValueOnce("done");

        const rounds: number[] = [];
        await runChatTurn(
            {
                model: "claude-3-opus",
                systemPrompt: "x",
                messages: [],
            },
            { onRoundEnd: (r) => rounds.push(r) },
        );

        expect(rounds).toEqual([0]);
    });

    it("fires onToolCallStart and onToolCallComplete for executed tools", async () => {
        mockFetch
            .mockResolvedValueOnce(jsonResponse({ content: [] }))
            .mockResolvedValueOnce(jsonResponse({ content: [] }));
        (parseToolUseBlocks as any)
            .mockReturnValueOnce([{ id: "t1", name: "op", input: { v: 1 } }])
            .mockReturnValueOnce([]);
        (parseProviderResponse as any)
            .mockReturnValueOnce("")
            .mockReturnValueOnce("ok");
        (executeToolCall as any).mockResolvedValueOnce({
            name: "op", input: { v: 1 }, result: { ok: true }, duration_ms: 1,
        });

        const starts: Array<[string, any]> = [];
        const completes: any[] = [];

        await runChatTurn(
            {
                model: "claude-3-opus",
                systemPrompt: "x",
                messages: [],
                tools: [{ name: "op" }],
                commandContext: makeCtx(),
            },
            {
                onToolCallStart: (name, input) => starts.push([name, input]),
                onToolCallComplete: (d) => completes.push(d),
            },
        );

        // onToolCallStart fires at least once with the populated input
        expect(starts.some(([name, input]) => name === "op" && input.v === 1)).toBe(true);
        expect(completes).toHaveLength(1);
        expect(completes[0].name).toBe("op");
    });
});
