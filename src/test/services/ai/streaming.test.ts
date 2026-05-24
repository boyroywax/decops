import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `streamChatWithWorkspace` is a thin orchestration layer:
 *  • builds the system prompt
 *  • applies the matching ChatDelegation (if any)
 *  • selects the tool set based on the toolkit allowlist
 *  • forwards everything to `runChatTurn`
 *
 * These tests exercise the orchestration contract by mocking every dep
 * and asserting the options handed to `runChatTurn`.
 */

vi.mock("@/services/ai/runner", () => ({
    runChatTurn: vi.fn(),
}));
vi.mock("@/services/ai/models", () => ({
    getSelectedModel: vi.fn(() => "claude-3-opus"),
}));
vi.mock("@/services/ai/providers", () => ({
    getModelProvider: vi.fn(() => "anthropic"),
}));
vi.mock("@/services/ai/prompts", () => ({
    buildWorkspaceSystemPrompt: vi.fn(() => "BASE SYSTEM PROMPT"),
}));
vi.mock("@/services/ai/delegation", () => ({
    getChatDelegation: vi.fn(() => null),
}));
vi.mock("@/services/commands/tools", () => ({
    getAllTools: vi.fn(() => [{ name: "all_tool_1" }, { name: "all_tool_2" }]),
    getToolsByToolkitIds: vi.fn((ids: string[]) => [{ name: `scoped:${ids.join(",")}` }]),
}));

import { streamChatWithWorkspace } from "@/services/ai/streaming";
import { runChatTurn } from "@/services/ai/runner";
import { getModelProvider } from "@/services/ai/providers";
import { getChatDelegation } from "@/services/ai/delegation";
import { getAllTools, getToolsByToolkitIds } from "@/services/commands/tools";

const okResult = { text: "hello", toolCalls: [], reason: "end_turn" as const };

beforeEach(() => {
    vi.resetAllMocks();
    (runChatTurn as any).mockResolvedValue(okResult);
    // Re-establish the default mocks that resetAllMocks wiped out.
    (getModelProvider as any).mockReturnValue("anthropic");
    (getChatDelegation as any).mockReturnValue(null);
    (getAllTools as any).mockReturnValue([{ name: "all_tool_1" }, { name: "all_tool_2" }]);
    (getToolsByToolkitIds as any).mockImplementation((ids: string[]) => [
        { name: `scoped:${ids.join(",")}` },
    ]);
});

describe("streamChatWithWorkspace", () => {
    it("forwards text + toolCalls from the runner", async () => {
        (runChatTurn as any).mockResolvedValue({
            text: "final text",
            toolCalls: [{ name: "op", input: {}, duration_ms: 1 }],
            reason: "end_turn",
        });

        const result = await streamChatWithWorkspace(
            "user msg",
            [],
            {} as any,
            { onToken: vi.fn() },
        );

        expect(result.text).toBe("final text");
        expect(result.toolCalls).toHaveLength(1);
        expect(result.toolCalls[0].name).toBe("op");
    });

    it("includes recent history + the user message in messages payload", async () => {
        const history = Array.from({ length: 25 }, (_, i) => ({
            role: "user" as const,
            content: `msg-${i}`,
        }));
        await streamChatWithWorkspace(
            "latest",
            history,
            {} as any,
            { onToken: vi.fn() },
        );

        const opts = (runChatTurn as any).mock.calls[0][0];
        // history is sliced to the last 20, plus the new user message → 21 total
        expect(opts.messages).toHaveLength(21);
        expect(opts.messages[opts.messages.length - 1]).toEqual({
            role: "user",
            content: "latest",
        });
        // First retained history entry is msg-5 (25 - 20)
        expect(opts.messages[0].content).toBe("msg-5");
    });

    it("uses scoped tools when toolkitIds is provided", async () => {
        await streamChatWithWorkspace(
            "hi",
            [],
            {} as any,
            { onToken: vi.fn() },
            {} as any /* commandContext */,
            ["studio", "jobs"],
        );

        const opts = (runChatTurn as any).mock.calls[0][0];
        expect(getToolsByToolkitIds).toHaveBeenCalledWith(["studio", "jobs"]);
        expect(getAllTools).not.toHaveBeenCalled();
        expect(opts.tools).toEqual([{ name: "scoped:studio,jobs" }]);
    });

    it("uses ALL tools when no toolkitIds is supplied", async () => {
        await streamChatWithWorkspace(
            "hi",
            [],
            {} as any,
            { onToken: vi.fn() },
            {} as any,
        );

        const opts = (runChatTurn as any).mock.calls[0][0];
        expect(getAllTools).toHaveBeenCalled();
        expect(opts.tools).toHaveLength(2);
    });

    it("omits tools entirely when commandContext is missing", async () => {
        await streamChatWithWorkspace(
            "hi",
            [],
            {} as any,
            { onToken: vi.fn() },
            // no commandContext
        );

        const opts = (runChatTurn as any).mock.calls[0][0];
        // tools should be undefined (runner contract: empty/undefined = no tools)
        expect(opts.tools).toBeUndefined();
        expect(getAllTools).not.toHaveBeenCalled();
        expect(getToolsByToolkitIds).not.toHaveBeenCalled();
    });

    it("applies a matching delegation: enhances prompt and bumps maxRounds", async () => {
        (getChatDelegation as any).mockReturnValue({
            id: "studio",
            check: () => true,
            enhance: (sp: string) => sp + "\n[STUDIO MODE]",
            maxRounds: 16,
        });

        await streamChatWithWorkspace(
            "/studio build a job",
            [],
            {} as any,
            { onToken: vi.fn() },
        );

        const opts = (runChatTurn as any).mock.calls[0][0];
        expect(opts.systemPrompt).toContain("[STUDIO MODE]");
        expect(opts.maxRounds).toBe(16);
    });

    it("falls back to maxRounds=12 when delegation matches but omits maxRounds", async () => {
        (getChatDelegation as any).mockReturnValue({
            id: "x",
            check: () => true,
            enhance: (sp: string) => sp + "\n[X]",
        });

        await streamChatWithWorkspace("msg", [], {} as any, { onToken: vi.fn() });
        const opts = (runChatTurn as any).mock.calls[0][0];
        expect(opts.maxRounds).toBe(12);
    });

    it("uses default maxRounds=8 when no delegation matches", async () => {
        (getChatDelegation as any).mockReturnValue(null);
        await streamChatWithWorkspace("msg", [], {} as any, { onToken: vi.fn() });

        const opts = (runChatTurn as any).mock.calls[0][0];
        expect(opts.maxRounds).toBe(8);
    });

    it("enables stream:true for anthropic, openai, and openrouter; false for others", async () => {
        (getModelProvider as any).mockReturnValueOnce("openai");
        await streamChatWithWorkspace("msg", [], {} as any, { onToken: vi.fn() });
        expect((runChatTurn as any).mock.calls[0][0].stream).toBe(true);

        (getModelProvider as any).mockReturnValueOnce("anthropic");
        await streamChatWithWorkspace("msg", [], {} as any, { onToken: vi.fn() });
        expect((runChatTurn as any).mock.calls[1][0].stream).toBe(true);

        (getModelProvider as any).mockReturnValueOnce("openrouter");
        await streamChatWithWorkspace("msg", [], {} as any, { onToken: vi.fn() });
        expect((runChatTurn as any).mock.calls[2][0].stream).toBe(true);

        (getModelProvider as any).mockReturnValueOnce("google");
        await streamChatWithWorkspace("msg", [], {} as any, { onToken: vi.fn() });
        expect((runChatTurn as any).mock.calls[3][0].stream).toBe(false);
    });

    it("forwards onToken/onToolCallStart/onToolCallComplete/signal to runner", async () => {
        const cbs = {
            onToken: vi.fn(),
            onToolCallStart: vi.fn(),
            onToolCallComplete: vi.fn(),
            signal: new AbortController().signal,
        };
        await streamChatWithWorkspace("msg", [], {} as any, cbs);

        const passed = (runChatTurn as any).mock.calls[0][1];
        expect(passed.onToken).toBe(cbs.onToken);
        expect(passed.onToolCallStart).toBe(cbs.onToolCallStart);
        expect(passed.onToolCallComplete).toBe(cbs.onToolCallComplete);
        expect(passed.signal).toBe(cbs.signal);
    });
});
