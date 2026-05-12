import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCommandContext } from "@/hooks/useCommandContext";

// useCommandContext consumes useAutomations() which requires a JobsProvider
// ancestor in production. Stub the hook directly so this unit test stays
// focused on the live-getter behaviour we care about.
vi.mock("@/context/AutomationsContext", () => ({
    useAutomations: () => ({ runAutomation: vi.fn(), runs: [] }),
}));

/** Minimal workspace stub — only fields read by useCommandContext are populated. */
function makeWorkspace(overrides: Record<string, any> = {}) {
    return {
        agents: [],
        channels: [],
        groups: [],
        messages: [],
        setAgents: vi.fn(),
        setChannels: vi.fn(),
        setGroups: vi.fn(),
        setMessages: vi.fn(),
        activeChannel: null,
        setActiveChannel: vi.fn(),
        setActiveChannels: vi.fn(),
        ...overrides,
    } as any;
}

function makeJobs() {
    return {
        addArtifact: vi.fn(),
        removeArtifact: vi.fn(),
        importArtifact: vi.fn(),
        updateArtifact: vi.fn(),
        allArtifacts: [],
        addJob: vi.fn(),
        removeJob: vi.fn(),
        toggleQueuePause: vi.fn(),
        isPaused: false,
        jobs: [],
        savedJobs: [],
        saveJob: vi.fn(),
        deleteJob: vi.fn(),
    };
}

function makeEcosystem() {
    return {
        ecosystem: null,
        setEcosystem: vi.fn(),
        activeNetworkId: null,
        setActiveNetworkId: vi.fn(),
        networks: [],
        bridges: [],
        bridgeMessages: [],
        setNetworks: vi.fn(),
        setBridges: vi.fn(),
        setBridgeMessages: vi.fn(),
        setActiveBridges: vi.fn(),
        createBridge: vi.fn(),
        removeBridge: vi.fn(),
        dissolveNetwork: vi.fn(),
    };
}

const wrapper = undefined;

describe("useCommandContext: live-state getters (Phase 1.3)", () => {
    it("exposes getAgents/getChannels/getGroups/getMessages on context.workspace", () => {
        const { result } = renderHook(
            () => useCommandContext({
                workspace: makeWorkspace(),
                user: null,
                jobs: makeJobs(),
                ecosystem: makeEcosystem(),
                architect: { generateNetwork: vi.fn(), deployNetwork: vi.fn() },
                addLog: vi.fn(),
            }),
            { wrapper },
        );

        expect(typeof result.current.workspace.getAgents).toBe("function");
        expect(typeof result.current.workspace.getChannels).toBe("function");
        expect(typeof result.current.workspace.getGroups).toBe("function");
        expect(typeof result.current.workspace.getMessages).toBe("function");
    });

    it("getters initially return the same data as the snapshot arrays", () => {
        const ws = makeWorkspace({
            agents: [{ id: "a1", name: "Alice" }],
            messages: [{ id: "m1", content: "hi" }],
        });
        const { result } = renderHook(
            () => useCommandContext({
                workspace: ws,
                user: null,
                jobs: makeJobs(),
                ecosystem: makeEcosystem(),
                architect: { generateNetwork: vi.fn(), deployNetwork: vi.fn() },
                addLog: vi.fn(),
            }),
            { wrapper },
        );

        expect(result.current.workspace.getAgents!()).toEqual([{ id: "a1", name: "Alice" }]);
        expect(result.current.workspace.getMessages!()).toEqual([{ id: "m1", content: "hi" }]);
    });

    it("getAgents() returns LIVE state after workspace.agents updates", () => {
        // The core invariant: an async execute() that captured the context
        // earlier should still see fresh agents via the getter even when
        // the snapshot field on the same context object is stale.
        let workspace = makeWorkspace({ agents: [{ id: "a1", name: "Alice" }] });
        const { result, rerender } = renderHook(
            ({ ws }) => useCommandContext({
                workspace: ws,
                user: null,
                jobs: makeJobs(),
                ecosystem: makeEcosystem(),
                architect: { generateNetwork: vi.fn(), deployNetwork: vi.fn() },
                addLog: vi.fn(),
            }),
            { wrapper, initialProps: { ws: workspace } },
        );

        // Capture the FIRST context (simulates a long-running async execute)
        const capturedCtx = result.current;
        expect(capturedCtx.workspace.getAgents!()).toHaveLength(1);

        // Workspace updates — new agent added
        act(() => {
            workspace = makeWorkspace({
                agents: [
                    { id: "a1", name: "Alice" },
                    { id: "a2", name: "Bob" },
                ],
            });
            rerender({ ws: workspace });
        });

        // The CAPTURED context's getter must now see the new agent
        expect(capturedCtx.workspace.getAgents!()).toHaveLength(2);
        expect(capturedCtx.workspace.getAgents!()[1].name).toBe("Bob");
    });

    it("getMessages() returns LIVE state for stale-context message history", () => {
        let workspace = makeWorkspace({ messages: [{ id: "m1", content: "hello" }] });
        const { result, rerender } = renderHook(
            ({ ws }) => useCommandContext({
                workspace: ws,
                user: null,
                jobs: makeJobs(),
                ecosystem: makeEcosystem(),
                architect: { generateNetwork: vi.fn(), deployNetwork: vi.fn() },
                addLog: vi.fn(),
            }),
            { wrapper, initialProps: { ws: workspace } },
        );
        const capturedCtx = result.current;

        act(() => {
            workspace = makeWorkspace({
                messages: [
                    { id: "m1", content: "hello" },
                    { id: "m2", content: "world" },
                ],
            });
            rerender({ ws: workspace });
        });

        expect(capturedCtx.workspace.getMessages!()).toHaveLength(2);
        // Snapshot field on the captured context is still the old array —
        // documents WHY the getter is needed.
        expect(capturedCtx.workspace.messages).toHaveLength(1);
    });
});
