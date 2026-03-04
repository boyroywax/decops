import { describe, it, expect, vi, beforeEach } from "vitest";
import { runJob, type JobResult } from "@/services/jobs/executor";
import { registry } from "@/services/commands/registry";
import type { CommandContext } from "@/services/commands/types";
import type { JobDefinition } from "@/types/jobs";

// ── Helpers ────────────────────────────────────────

/** Build a minimal CommandContext for testing */
function makeContext(overrides?: Partial<CommandContext>): CommandContext {
  return {
    workspace: {
      agents: [], channels: [], groups: [], messages: [],
      setAgents: vi.fn(), setChannels: vi.fn(), setGroups: vi.fn(), setMessages: vi.fn(),
      addLog: vi.fn(),
    },
    auth: { user: null },
    jobs: {
      addArtifact: vi.fn(), removeArtifact: vi.fn(), importArtifact: vi.fn(),
      updateArtifact: vi.fn(), allArtifacts: [],
      addJob: vi.fn(), removeJob: vi.fn(), pauseQueue: vi.fn(), resumeQueue: vi.fn(),
      isPaused: false, getQueue: () => [], getCatalog: () => [],
      saveDefinition: vi.fn(), deleteDefinition: vi.fn(), clearJobs: vi.fn(),
    },
    storage: {},
    addDeliverable: vi.fn(),
    ecosystem: {
      ecosystem: null, setEcosystem: vi.fn(), activeNetworkId: null, setActiveNetworkId: vi.fn(),
      ecosystems: [], bridges: [], bridgeMessages: [],
      setEcosystems: vi.fn(), setBridges: vi.fn(), setBridgeMessages: vi.fn(),
      setActiveBridges: vi.fn(), createBridge: vi.fn(), removeBridge: vi.fn(),
      saveCurrentNetwork: vi.fn(), loadNetwork: vi.fn(), dissolveNetwork: vi.fn(),
    },
    system: {
      setApiKey: vi.fn(), setModel: vi.fn(),
      getModelForCommand: () => "test-model",
      getModelForAgent: () => "test-model",
    },
    architect: { generateNetwork: vi.fn(), deployNetwork: vi.fn() },
    automations: { runAutomation: vi.fn(), runs: [] },
    studio: null,
    ...overrides,
  } as unknown as CommandContext;
}

/** Build a minimal job definition */
function makeJobDef(overrides?: Partial<JobDefinition>): JobDefinition {
  const now = Date.now();
  return {
    id: "test-job-1",
    name: "Test Job",
    description: "A test job",
    mode: "serial",
    steps: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────

describe("runJob (headless executor)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns success for a job with zero steps", async () => {
    const result = await runJob(makeJobDef(), makeContext());
    expect(result.success).toBe(true);
    expect(result.stepResults).toEqual([]);
    expect(result.summary).toContain("0 steps");
  });

  describe("serial mode", () => {
    it("executes steps sequentially and returns results", async () => {
      vi.spyOn(registry, "execute").mockResolvedValueOnce("step-1-result")
        .mockResolvedValueOnce("step-2-result");

      const def = makeJobDef({
        steps: [
          { id: "s1", commandId: "cmd_a", args: { x: 1 } },
          { id: "s2", commandId: "cmd_b", args: { y: 2 } },
        ],
      });

      const result = await runJob(def, makeContext());
      expect(result.success).toBe(true);
      expect(result.stepResults).toHaveLength(2);
      expect(result.stepResults[0]).toMatchObject({ stepId: "s1", status: "completed" });
      expect(result.stepResults[1]).toMatchObject({ stepId: "s2", status: "completed" });
      expect(registry.execute).toHaveBeenCalledTimes(2);
    });

    it("stops on first failure and returns failed result", async () => {
      vi.spyOn(registry, "execute")
        .mockResolvedValueOnce("ok")
        .mockRejectedValueOnce(new Error("step 2 broke"));

      const def = makeJobDef({
        steps: [
          { id: "s1", commandId: "cmd_a", args: {} },
          { id: "s2", commandId: "cmd_b", args: {} },
          { id: "s3", commandId: "cmd_c", args: {} },
        ],
      });

      const result = await runJob(def, makeContext());
      expect(result.success).toBe(false);
      expect(result.stepResults).toHaveLength(2);
      expect(result.stepResults[1]).toMatchObject({ stepId: "s2", status: "failed" });
      expect(result.error).toContain("step 2 broke");
    });

    it("skips steps with unmet conditions", async () => {
      vi.spyOn(registry, "execute").mockResolvedValue("done");

      const def = makeJobDef({
        steps: [
          { id: "s1", commandId: "cmd_a", args: {} },
          { id: "s2", commandId: "cmd_b", args: {}, condition: "false" },
          { id: "s3", commandId: "cmd_c", args: {} },
        ],
      });

      const result = await runJob(def, makeContext());
      expect(result.success).toBe(true);
      expect(result.stepResults).toHaveLength(3);
      expect(result.stepResults[1]).toMatchObject({ stepId: "s2", status: "skipped" });
      expect(registry.execute).toHaveBeenCalledTimes(2); // s1 and s3 only
    });

    it("applies output mappings to shared storage", async () => {
      vi.spyOn(registry, "execute")
        .mockResolvedValueOnce({ data: "value-A" })
        .mockResolvedValueOnce("final");

      const def = makeJobDef({
        steps: [
          {
            id: "s1", commandId: "cmd_a", args: {},
            outputMappings: [{ outputKey: "data", target: "storage", targetKey: "myData" }],
          },
          { id: "s2", commandId: "cmd_b", args: {} },
        ],
      });

      const result = await runJob(def, makeContext());
      expect(result.success).toBe(true);
      expect(result.storage.myData).toBe("value-A");
    });

    it("resolves $storage refs in step args", async () => {
      const executeSpy = vi.spyOn(registry, "execute")
        .mockResolvedValueOnce("data-from-step-1")
        .mockResolvedValueOnce("ok");

      const def = makeJobDef({
        storageDefaults: { greeting: "hello" },
        steps: [
          { id: "s1", commandId: "cmd_a", args: {} },
          { id: "s2", commandId: "cmd_b", args: { msg: "$storage.greeting" } },
        ],
      });

      const result = await runJob(def, makeContext());
      expect(result.success).toBe(true);
      // Check that the second call received the resolved arg
      expect(executeSpy.mock.calls[1][1]).toEqual({ msg: "hello" });
    });

    it("calls onStepUpdate callback", async () => {
      vi.spyOn(registry, "execute").mockResolvedValue("ok");
      const onStepUpdate = vi.fn();

      const def = makeJobDef({
        steps: [{ id: "s1", commandId: "cmd_a", args: {} }],
      });

      await runJob(def, makeContext(), { addLog: vi.fn(), onStepUpdate });
      expect(onStepUpdate).toHaveBeenCalledWith("s1", "running");
      expect(onStepUpdate).toHaveBeenCalledWith("s1", "completed", expect.any(String));
    });

    it("continues on failure when onFailure.continueOnFailure is true", async () => {
      vi.spyOn(registry, "execute")
        .mockRejectedValueOnce(new Error("oops"))
        .mockResolvedValueOnce("ok");

      const def = makeJobDef({
        steps: [
          {
            id: "s1", commandId: "cmd_a", args: {},
            onFailure: { continueOnFailure: true, log: "continuing despite error" },
          },
          { id: "s2", commandId: "cmd_b", args: {} },
        ],
      });

      const result = await runJob(def, makeContext());
      expect(result.success).toBe(true);
      expect(result.stepResults).toHaveLength(2);
    });

    it("halts on success when onSuccess.haltAfterSuccess is true", async () => {
      vi.spyOn(registry, "execute")
        .mockResolvedValueOnce("done")
        .mockResolvedValueOnce("should-not-run");

      const def = makeJobDef({
        steps: [
          {
            id: "s1", commandId: "cmd_a", args: {},
            onSuccess: { haltAfterSuccess: true, log: "halting" },
          },
          { id: "s2", commandId: "cmd_b", args: {} },
        ],
      });

      const result = await runJob(def, makeContext());
      expect(result.success).toBe(true);
      expect(result.stepResults).toHaveLength(1);
      expect(registry.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe("parallel mode", () => {
    it("executes all steps simultaneously", async () => {
      vi.spyOn(registry, "execute")
        .mockResolvedValueOnce("r1")
        .mockResolvedValueOnce("r2")
        .mockResolvedValueOnce("r3");

      const def = makeJobDef({
        mode: "parallel",
        steps: [
          { id: "s1", commandId: "cmd_a", args: {} },
          { id: "s2", commandId: "cmd_b", args: {} },
          { id: "s3", commandId: "cmd_c", args: {} },
        ],
      });

      const result = await runJob(def, makeContext());
      expect(result.success).toBe(true);
      expect(result.stepResults).toHaveLength(3);
      expect(result.stepResults.every(r => r.status === "completed")).toBe(true);
    });

    it("marks individual failures but completes others", async () => {
      vi.spyOn(registry, "execute")
        .mockResolvedValueOnce("ok")
        .mockRejectedValueOnce(new Error("fail-2"))
        .mockResolvedValueOnce("ok");

      const def = makeJobDef({
        mode: "parallel",
        steps: [
          { id: "s1", commandId: "cmd_a", args: {} },
          { id: "s2", commandId: "cmd_b", args: {} },
          { id: "s3", commandId: "cmd_c", args: {} },
        ],
      });

      const result = await runJob(def, makeContext());
      expect(result.success).toBe(false);
      expect(result.stepResults.filter(r => r.status === "completed")).toHaveLength(2);
      expect(result.stepResults.filter(r => r.status === "failed")).toHaveLength(1);
    });
  });

  describe("mixed mode", () => {
    it("runs serial steps and parallel groups in correct order", async () => {
      const callOrder: string[] = [];
      vi.spyOn(registry, "execute").mockImplementation(async (cmdId: string) => {
        callOrder.push(cmdId);
        return `result-${cmdId}`;
      });

      const def = makeJobDef({
        mode: "mixed",
        steps: [
          { id: "s1", commandId: "cmd_setup", args: {} },
          { id: "s2", commandId: "cmd_parallel_a", args: {} },
          { id: "s3", commandId: "cmd_parallel_b", args: {} },
          { id: "s4", commandId: "cmd_finalize", args: {} },
        ],
        parallelGroups: [
          { id: "g1", label: "Parallel group", stepIds: ["s2", "s3"] },
        ],
      });

      const result = await runJob(def, makeContext());
      expect(result.success).toBe(true);
      expect(result.stepResults).toHaveLength(4);
      // cmd_setup must run before cmd_parallel_a/b, and cmd_finalize after
      expect(callOrder.indexOf("cmd_setup")).toBeLessThan(callOrder.indexOf("cmd_parallel_a"));
      expect(callOrder.indexOf("cmd_setup")).toBeLessThan(callOrder.indexOf("cmd_parallel_b"));
      expect(callOrder.indexOf("cmd_finalize")).toBeGreaterThan(callOrder.indexOf("cmd_parallel_a"));
      expect(callOrder.indexOf("cmd_finalize")).toBeGreaterThan(callOrder.indexOf("cmd_parallel_b"));
    });
  });

  describe("input overrides", () => {
    it("overrides input defaults with provided values", async () => {
      const executeSpy = vi.spyOn(registry, "execute").mockResolvedValueOnce("ok");

      const def = makeJobDef({
        inputDefaults: [{ name: "agent", type: "agent", entityId: "default-id" } as any],
        steps: [{ id: "s1", commandId: "cmd_a", args: { agentId: "$input.agent" } }],
      });

      const result = await runJob(def, makeContext(), undefined, { agent: "override-id" });
      expect(result.success).toBe(true);
      expect(executeSpy.mock.calls[0][1]).toEqual({ agentId: "override-id" });
    });
  });

  describe("storage initialization", () => {
    it("merges storageDefaults with context storage", async () => {
      const executeSpy = vi.spyOn(registry, "execute").mockResolvedValue("ok");

      const def = makeJobDef({
        storageDefaults: { fromDef: "def-value" },
        steps: [{ id: "s1", commandId: "cmd_a", args: { a: "$storage.fromDef", b: "$storage.fromCtx" } }],
      });

      const ctx = makeContext();
      ctx.storage.fromCtx = "ctx-value";

      const result = await runJob(def, ctx);
      expect(result.success).toBe(true);
      expect(executeSpy.mock.calls[0][1]).toEqual({ a: "def-value", b: "ctx-value" });
    });
  });
});
