/**
 * Integration tests for the `useJobExecutor` React hook [§2.1].
 *
 * The pure execution engine (`runJob`) is comprehensively covered in
 * `executor.test.ts`; this suite exercises the React-specific wiring that
 * only `useJobExecutor` provides:
 *
 *   - effect-driven queue processing (queued → running → terminal status)
 *   - CommandContext construction + `registry.execute` invocation
 *   - failure path: rejected execute → `failed` status + log entry
 *   - prompt-input pause path: unresolved prompt input → `awaiting-input` via
 *     `updateJob`, no `updateJobStatus("completed")`
 *   - concurrency cap: MAX_CONCURRENT_JOBS limit enforced by the React effect
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { StudioProvider } from "@/toolkits/studio/StudioContext";
import { useJobExecutor, MAX_CONCURRENT_JOBS } from "@/hooks/useJobExecutor";
import { registry } from "@/services/commands/registry";
import type { Job, EntityInput } from "@/types";
import type { WorkspaceContextType } from "@/context/WorkspaceContext";
import type { UseArchitectReturn } from "@/toolkits/architect/hooks/useArchitect";
import type { UseEcosystemReturn } from "@/hooks/useEcosystem";

// ── Test helpers ──────────────────────────────────

function makeJob(overrides: Partial<Job> & { id: string; type: string }): Job {
    return {
        status: "queued",
        artifacts: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        request: {},
        ...overrides,
    } as Job;
}

interface MockProps {
    jobs: Job[];
    updateJobStatus: ReturnType<typeof vi.fn>;
    updateJob: ReturnType<typeof vi.fn>;
    addNotebookEntry: ReturnType<typeof vi.fn>;
    addLog: ReturnType<typeof vi.fn>;
    addJob: ReturnType<typeof vi.fn>;
    addArtifact: ReturnType<typeof vi.fn>;
}

function makeMockProps(jobs: Job[]): MockProps & Record<string, unknown> {
    const mocks: MockProps = {
        jobs,
        updateJobStatus: vi.fn(),
        updateJob: vi.fn(),
        addNotebookEntry: vi.fn(),
        addLog: vi.fn(),
        addJob: vi.fn(),
        addArtifact: vi.fn(),
    };
    return {
        ...mocks,
        // ── Live queue + job state ──
        removeJob: vi.fn(),
        clearJobs: vi.fn(),
        allArtifacts: [],
        importArtifact: vi.fn(),
        removeArtifact: vi.fn(),
        isPaused: false,
        toggleQueuePause: vi.fn(),
        updateArtifact: vi.fn(),
        // ── Saved-job catalog ──
        savedJobs: [],
        saveJob: vi.fn(),
        deleteJob: vi.fn(),
        // ── Persistence ──
        setJobs: vi.fn(),
        setStandaloneArtifacts: vi.fn(),
        // ── Workspace / user ──
        workspace: {
            agents: [], channels: [], groups: [], messages: [],
            setAgents: vi.fn(), setChannels: vi.fn(), setGroups: vi.fn(), setMessages: vi.fn(),
            activeChannel: null, setActiveChannel: vi.fn(),
            activeChannels: new Set(), setActiveChannels: vi.fn(),
        } as unknown as WorkspaceContextType,
        user: null,
        // ── Architect / ecosystem ──
        architect: {
            generateNetwork: vi.fn(),
            deployNetwork: vi.fn(),
        } as unknown as UseArchitectReturn,
        ecosystem: {
            ecosystem: null,
            setEcosystem: vi.fn(),
            activeNetworkId: null,
            setActiveNetworkId: vi.fn(),
            networks: [], bridges: [], bridgeMessages: [],
            setNetworks: vi.fn(), setBridges: vi.fn(), setBridgeMessages: vi.fn(),
            setActiveBridges: vi.fn(),
            createBridge: vi.fn(), removeBridge: vi.fn(), dissolveNetwork: vi.fn(),
        } as unknown as UseEcosystemReturn,
        // ── Notebook / logging ──
        addDetail: vi.fn(),
        automations: { runAutomation: vi.fn(async () => {}), runs: [] },
        workspaceManager: undefined,
    };
}

const wrapper = ({ children }: { children: ReactNode }) => (
    <StudioProvider>{children}</StudioProvider>
);

// ── Tests ─────────────────────────────────────────

describe("useJobExecutor — React integration [§2.1]", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("transitions a queued job to running, executes the command, then marks it completed", async () => {
        vi.spyOn(registry, "execute").mockResolvedValue("ok-result");
        const job = makeJob({ id: "job-success", type: "cmd_test", request: { foo: "bar" } });
        const props = makeMockProps([job]);

        renderHook(() => useJobExecutor(props as never), { wrapper });

        // First: status transitions to "running"
        await waitFor(() => {
            expect(props.updateJobStatus).toHaveBeenCalledWith("job-success", "running");
        });

        // Then: registry.execute invoked with the job request
        await waitFor(() => {
            expect(registry.execute).toHaveBeenCalledWith("cmd_test", { foo: "bar" }, expect.any(Object));
        });

        // Finally: status transitions to "completed" with the result
        await waitFor(() => {
            expect(props.updateJobStatus).toHaveBeenCalledWith("job-success", "completed", "ok-result");
        });

        // A "Job Started" + "Job Completed" notebook entry should have fired
        const titles = props.addNotebookEntry.mock.calls.map(c => (c[0] as { title: string }).title);
        expect(titles.some(t => t.startsWith("Job Started"))).toBe(true);
        expect(titles.some(t => t.startsWith("Job Completed"))).toBe(true);
    });

    it("marks a job failed when the command rejects", async () => {
        vi.spyOn(registry, "execute").mockRejectedValue(new Error("boom"));
        const job = makeJob({ id: "job-fail", type: "cmd_test", request: {} });
        const props = makeMockProps([job]);

        renderHook(() => useJobExecutor(props as never), { wrapper });

        await waitFor(() => {
            expect(props.updateJobStatus).toHaveBeenCalledWith("job-fail", "failed", "boom");
        });

        const titles = props.addNotebookEntry.mock.calls.map(c => (c[0] as { title: string }).title);
        expect(titles.some(t => t.startsWith("Job Failed"))).toBe(true);
    });

    it("pauses a job to awaiting-input when an unresolved prompt input is present", async () => {
        const executeSpy = vi.spyOn(registry, "execute").mockResolvedValue("never-called");
        const promptInput: EntityInput = {
            name: "username",
            type: "text",
            source: { kind: "prompt", promptText: "Enter your name" },
        } as unknown as EntityInput;

        const job = makeJob({
            id: "job-prompt",
            type: "cmd_test",
            request: { inputDefaults: [promptInput] },
        });
        const props = makeMockProps([job]);

        renderHook(() => useJobExecutor(props as never), { wrapper });

        await waitFor(() => {
            // Hook should put the job into awaiting-input via updateJob
            const awaitingCall = props.updateJob.mock.calls.find(
                c => (c[1] as { status?: string }).status === "awaiting-input",
            );
            expect(awaitingCall).toBeTruthy();
            const patch = awaitingCall![1] as { pendingPrompt?: { inputName: string; promptText: string } };
            expect(patch.pendingPrompt?.inputName).toBe("username");
            expect(patch.pendingPrompt?.promptText).toBe("Enter your name");
        });

        // Should NOT have executed the command nor marked completed/failed
        expect(executeSpy).not.toHaveBeenCalled();
        const statusCalls = props.updateJobStatus.mock.calls.map(c => c[1]);
        expect(statusCalls).not.toContain("completed");
        expect(statusCalls).not.toContain("failed");
    });

    it("respects MAX_CONCURRENT_JOBS — only N jobs run simultaneously", async () => {
        // Block every execute on a pending promise so jobs stay in-flight
        let resolveExecute: ((value: unknown) => void) | undefined;
        const pending = new Promise(res => { resolveExecute = res; });
        vi.spyOn(registry, "execute").mockReturnValue(pending);

        const overflow = MAX_CONCURRENT_JOBS + 2;
        const jobs: Job[] = Array.from({ length: overflow }, (_, i) =>
            makeJob({ id: `job-${i}`, type: "cmd_test" }),
        );
        const props = makeMockProps(jobs);

        renderHook(() => useJobExecutor(props as never), { wrapper });

        await waitFor(() => {
            const runningCalls = props.updateJobStatus.mock.calls.filter(c => c[1] === "running");
            expect(runningCalls.length).toBe(MAX_CONCURRENT_JOBS);
        });

        // Resolve so background promises don't leak past the test
        resolveExecute?.("done");
    });
});
