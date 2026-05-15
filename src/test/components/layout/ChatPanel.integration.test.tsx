/**
 * Integration tests for the ChatPanel submit pipeline [§2.2].
 *
 * Covers what previously had ZERO test coverage — the React component that
 * accepts user input, parses slash commands, routes @mentions, and streams
 * LLM responses into the conversation. Mocks the underlying LLM service
 * and ambient contexts so we can exercise the ChatPanel's wiring without
 * a real browser, real network, or real auth.
 *
 * Covered behaviours:
 *  - free-text submit: user message rendered → streamChatWithWorkspace
 *    invoked → assistant response rendered
 *  - slash-command (unknown): assistant emits the "Unknown command" hint
 *    without calling the LLM
 *  - slash-command (known, no required args): command is queued as a job
 *    via jobs.addJob (the canonical CLI → job path)
 *  - send button is disabled when the input is empty
 *  - clicking the send button triggers the same path as Enter
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

// ── Module mocks ────────────────────────────────────────────
// Mock heavy ambient hooks so we don't need to mount the full provider tree.

const streamChatWithWorkspaceMock = vi.fn();
const addJobMock = vi.fn((_job: unknown) => ({ id: "job-test-1" }));

vi.mock("@/services/ai", async () => {
    const actual = await vi.importActual<typeof import("@/services/ai")>("@/services/ai");
    return {
        ...actual,
        streamChatWithWorkspace: (...args: unknown[]) => streamChatWithWorkspaceMock(...args),
        chatWithWorkspace: vi.fn(async () => ({ text: "noop", toolCalls: [] })),
        chatWithAgent: vi.fn(async () => ({ text: "noop", toolCalls: [] })),
        getChatModel: () => "test-model",
    };
});

vi.mock("@/context/LLMContext", () => ({
    useLLM: () => ({ apiKey: "test-key", model: "test-model", setApiKey: vi.fn(), setModel: vi.fn() }),
}));

vi.mock("@/context/AuthContext", () => ({
    useAuth: () => ({ user: { id: "u1", name: "Test User", email: "t@example.com" }, isAuthenticated: true }),
}));

vi.mock("@/context/JobsContext", () => ({
    useJobsContext: () => ({
        addJob: addJobMock,
        jobs: [],
        addArtifact: vi.fn(),
        removeArtifact: vi.fn(),
        importArtifact: vi.fn(),
        updateArtifact: vi.fn(),
        allArtifacts: [],
        removeJob: vi.fn(),
        toggleQueuePause: vi.fn(),
        isPaused: false,
        savedJobs: [],
        saveJob: vi.fn(),
        deleteJob: vi.fn(),
    }),
}));

vi.mock("@/context/WorkspaceContext", () => ({
    useWorkspaceContext: () => ({
        agents: [], channels: [], groups: [], messages: [],
        setAgents: vi.fn(), setChannels: vi.fn(), setGroups: vi.fn(), setMessages: vi.fn(),
        activeChannel: null, setActiveChannel: vi.fn(),
        activeChannels: new Set(), setActiveChannels: vi.fn(),
    }),
}));

vi.mock("@/hooks/useEcosystem", () => ({
    useEcosystem: () => ({
        ecosystem: null,
        setEcosystem: vi.fn(),
        activeNetworkId: null,
        setActiveNetworkId: vi.fn(),
        networks: [], bridges: [], bridgeMessages: [],
        setNetworks: vi.fn(), setBridges: vi.fn(), setBridgeMessages: vi.fn(),
        setActiveBridges: vi.fn(),
        createBridge: vi.fn(), removeBridge: vi.fn(), dissolveNetwork: vi.fn(),
    }),
}));

vi.mock("@/toolkits/architect", () => ({
    useArchitectContext: () => null,
}));

vi.mock("@/toolkits/studio", () => ({
    useStudioContext: () => ({ api: null, register: vi.fn(), unregister: vi.fn() }),
}));

vi.mock("@/toolkits/editor", () => ({
    useEditorContext: () => ({ api: null, proposeEdit: vi.fn() }),
}));

vi.mock("@/context/AutomationsContext", () => ({
    useAutomations: () => ({ runAutomation: vi.fn(), runs: [] }),
}));

vi.mock("@/hooks/useWorkspaceManager", () => ({
    useWorkspaceManager: () => ({ activeWorkspaceId: "ws-test", workspaces: [] }),
}));

// Stub commandRegistry — provide one known command for the queued-as-job path.
vi.mock("@/services/commands/registry", () => ({
    registry: {
        get: (id: string) => {
            if (id === "ping_agent") {
                return {
                    id: "ping_agent",
                    description: "Ping an agent",
                    args: {}, // no args required
                };
            }
            return undefined;
        },
        execute: vi.fn(),
    },
}));

import { ChatPanel } from "@/components/layout/ChatPanel";
import type { WorkspaceContext } from "@/services/ai";

// ── Helpers ─────────────────────────────────────────────────

function renderChatPanel(overrides?: { addLog?: (m: string) => void }) {
    const props = {
        context: {
            agents: [], channels: [], groups: [], messages: [],
            networks: [], bridges: [], jobs: [],
        } as unknown as WorkspaceContext,
        onClose: vi.fn(),
        addLog: overrides?.addLog ?? vi.fn(),
        height: 400,
        setHeight: vi.fn(),
        isExpanded: false,
        onToggleExpand: vi.fn(),
    };
    return render(<ChatPanel {...props} />);
}

// ── Tests ───────────────────────────────────────────────────

describe("ChatPanel — integration [§2.2]", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        // Default mock: assistant echoes a fixed response, no tool calls.
        streamChatWithWorkspaceMock.mockResolvedValue({ text: "echo from mock LLM", toolCalls: [] });
    });

    it("renders the input + send button with stable test IDs", () => {
        renderChatPanel();
        expect(screen.getByTestId("chat-panel-input")).toBeInTheDocument();
        expect(screen.getByTestId("chat-panel-send")).toBeInTheDocument();
        expect(screen.getByTestId("chat-panel-messages")).toBeInTheDocument();
    });

    it("disables the send button when the input is empty", () => {
        renderChatPanel();
        const sendBtn = screen.getByTestId("chat-panel-send") as HTMLButtonElement;
        expect(sendBtn.disabled).toBe(true);
    });

    it("enables the send button once the user types something", () => {
        renderChatPanel();
        const input = screen.getByTestId("chat-panel-input") as HTMLInputElement;
        fireEvent.change(input, { target: { value: "hello world" } });
        const sendBtn = screen.getByTestId("chat-panel-send") as HTMLButtonElement;
        expect(sendBtn.disabled).toBe(false);
    });

    it("submits free text via Enter: invokes streamChatWithWorkspace and renders the assistant reply", async () => {
        renderChatPanel();
        const input = screen.getByTestId("chat-panel-input") as HTMLInputElement;

        fireEvent.change(input, { target: { value: "hello assistant" } });
        fireEvent.keyDown(input, { key: "Enter" });

        // User message immediately rendered
        await waitFor(() => {
            expect(screen.getByText("hello assistant")).toBeInTheDocument();
        });

        // streamChatWithWorkspace was called with the user text
        await waitFor(() => {
            expect(streamChatWithWorkspaceMock).toHaveBeenCalledTimes(1);
        });
        const firstArg = streamChatWithWorkspaceMock.mock.calls[0][0];
        expect(firstArg).toBe("hello assistant");

        // Assistant reply eventually rendered
        await waitFor(() => {
            expect(screen.getByText("echo from mock LLM")).toBeInTheDocument();
        });
    });

    it("submits via the send button as well as Enter", async () => {
        renderChatPanel();
        const input = screen.getByTestId("chat-panel-input") as HTMLInputElement;
        const sendBtn = screen.getByTestId("chat-panel-send") as HTMLButtonElement;

        fireEvent.change(input, { target: { value: "click path" } });
        fireEvent.click(sendBtn);

        await waitFor(() => {
            expect(streamChatWithWorkspaceMock).toHaveBeenCalledTimes(1);
        });
    });

    it("handles an unknown slash command without invoking the LLM", async () => {
        renderChatPanel();
        const input = screen.getByTestId("chat-panel-input") as HTMLInputElement;

        fireEvent.change(input, { target: { value: "/totally_not_a_command" } });
        fireEvent.keyDown(input, { key: "Enter" });

        await waitFor(() => {
            expect(screen.getByText(/Unknown command/)).toBeInTheDocument();
        });

        expect(streamChatWithWorkspaceMock).not.toHaveBeenCalled();
        expect(addJobMock).not.toHaveBeenCalled();
    });

    it("queues a known slash command as a job (no required args path)", async () => {
        renderChatPanel();
        const input = screen.getByTestId("chat-panel-input") as HTMLInputElement;

        fireEvent.change(input, { target: { value: "/ping_agent" } });
        fireEvent.keyDown(input, { key: "Enter" });

        await waitFor(() => {
            expect(addJobMock).toHaveBeenCalledTimes(1);
        });

        const jobArg = addJobMock.mock.calls[0][0] as unknown as { type: string; steps: Array<{ commandId: string }> };
        expect(jobArg.type).toBe("ping_agent");
        expect(jobArg.steps[0].commandId).toBe("ping_agent");

        // Should NOT have invoked the LLM
        expect(streamChatWithWorkspaceMock).not.toHaveBeenCalled();

        // Conversation should mention the queued job
        await waitFor(() => {
            expect(screen.getByText(/queued as a job/)).toBeInTheDocument();
        });
    });

    it("invokes addLog after a successful free-text submit", async () => {
        const addLog = vi.fn();
        renderChatPanel({ addLog });
        const input = screen.getByTestId("chat-panel-input") as HTMLInputElement;

        fireEvent.change(input, { target: { value: "logged message" } });
        fireEvent.keyDown(input, { key: "Enter" });

        await waitFor(() => {
            expect(addLog).toHaveBeenCalled();
        });
        const calls = addLog.mock.calls.map(c => c[0] as string);
        expect(calls.some(c => c.includes("Chat:"))).toBe(true);
    });

    it("does not submit when input is whitespace-only", async () => {
        renderChatPanel();
        const input = screen.getByTestId("chat-panel-input") as HTMLInputElement;

        await act(async () => {
            fireEvent.change(input, { target: { value: "   " } });
            fireEvent.keyDown(input, { key: "Enter" });
        });

        expect(streamChatWithWorkspaceMock).not.toHaveBeenCalled();
        expect(addJobMock).not.toHaveBeenCalled();
    });
});
