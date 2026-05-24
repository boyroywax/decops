import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { executeToolCall, resolveToolJob } from "@/services/commands/tools";
import { registry } from "@/services/commands/registry";
import { queueNewJobCommand } from "@/services/commands/definitions/jobs";
import type { CommandContext, CommandDefinition } from "@/services/commands/types";

function makeContext(jobId: string): CommandContext {
    return {
        workspace: {
            agents: [],
            channels: [],
            groups: [],
            messages: [],
            setAgents: vi.fn(),
            setChannels: vi.fn(),
            setGroups: vi.fn(),
            setMessages: vi.fn(),
            addLog: vi.fn(),
        },
        auth: { user: null },
        jobs: {
            addArtifact: vi.fn(),
            removeArtifact: vi.fn(),
            importArtifact: vi.fn(),
            updateArtifact: vi.fn(),
            allArtifacts: [],
            addJob: vi.fn((job) => {
                setTimeout(() => {
                    resolveToolJob(jobId, { ok: true, jobType: job.type });
                }, 0);
                return { id: jobId, type: job.type, request: job.request } as any;
            }),
            removeJob: vi.fn(),
            pauseQueue: vi.fn(),
            resumeQueue: vi.fn(),
            isPaused: false,
            getQueue: vi.fn(() => []),
            getCatalog: vi.fn(() => []),
            saveDefinition: vi.fn(),
            deleteDefinition: vi.fn(),
            setJobs: vi.fn(),
            setStandaloneArtifacts: vi.fn(),
            clearJobs: vi.fn(),
        },
        storage: {},
        addDeliverable: vi.fn(),
        ecosystem: {
            ecosystem: {} as any,
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
        },
        system: {
            setApiKey: vi.fn(),
            setModel: vi.fn(),
            getModelForCommand: vi.fn(() => "test-model"),
            getModelForAgent: vi.fn(() => "test-model"),
        },
        architect: {
            generateNetwork: vi.fn(),
            deployNetwork: vi.fn(),
        },
        automations: {
            runAutomation: vi.fn(),
            runs: [],
        },
    } as unknown as CommandContext;
}

describe("executeToolCall", () => {
    const originalCommands = new Map<string, CommandDefinition | undefined>();

    beforeEach(() => {
        originalCommands.clear();
    });

    afterEach(() => {
        for (const [id, original] of originalCommands.entries()) {
            if (original) {
                registry.register(original);
            } else {
                registry.unregister(id);
            }
        }
        originalCommands.clear();
    });

    function register(command: CommandDefinition): void {
        if (!originalCommands.has(command.id)) {
            originalCommands.set(command.id, registry.get(command.id));
        }
        registry.register(command);
    }

    it("rewrites operational tool calls into a queued single-step job", async () => {
        const leafExecute = vi.fn().mockResolvedValue({ shouldNotRun: true });
        register(queueNewJobCommand);
        register({
            id: "build_report",
            description: "Build a report",
            args: {
                topic: {
                    name: "topic",
                    type: "string",
                    required: true,
                    description: "Report topic",
                },
            },
            rbac: ["orchestrator"],
            tags: ["automation"],
            output: "Report payload",
            execute: leafExecute,
        });

        const context = makeContext("job-123");
        const resultPromise = executeToolCall(
            "tool-use-1",
            "build_report",
            { topic: "alpha" },
            context,
        );

        const result = await resultPromise;

        expect(context.jobs.addJob).toHaveBeenCalledTimes(1);
        expect(context.jobs.addJob).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "build_report",
                mode: "serial",
                steps: [
                    expect.objectContaining({
                        commandId: "build_report",
                        args: expect.objectContaining({
                            topic: "alpha",
                            _toolUseId: "tool-use-1",
                        }),
                    }),
                ],
                request: expect.objectContaining({
                    topic: "alpha",
                    _toolUseId: "tool-use-1",
                }),
            }),
        );
        expect(leafExecute).not.toHaveBeenCalled();
        expect(result.jobId).toBe("job-123");
        expect(result.result).toEqual({ ok: true, jobType: "build_report" });
    });
});