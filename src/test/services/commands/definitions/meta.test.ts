/**
 * Tests for the meta command surface (create_job, list_available_commands,
 * get_command_schema, list_toolkits) and the curated default tool set.
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  createJobCommand,
  listAvailableCommandsCommand,
  getCommandSchemaCommand,
  listToolkitsCommand,
  queryWorkspaceCommand,
} from "@/services/commands/definitions/meta";
import { registry } from "@/services/commands/registry";
import { getAllTools, getToolsForAgent, getUnmigratedToolkitsForAgentTools } from "@/services/commands/tools";
import { initializeRegistry } from "@/services/commands/init";
import type { Agent } from "@/types";
import type { CommandContext } from "@/services/commands/types";

beforeAll(() => {
  // Ensure all built-in toolkit commands (including meta) are registered.
  initializeRegistry();
});

function makeContext(addJob: (j: unknown) => unknown): CommandContext {
  // Cast through unknown — we only exercise the slice each meta command touches.
  return {
    workspace: {
      agents: [], channels: [], groups: [], messages: [],
      setAgents: () => {}, setChannels: () => {},
      setGroups: () => {}, setMessages: () => {},
      addLog: () => {},
    },
    auth: { user: null },
    jobs: {
      addJob: addJob as CommandContext["jobs"]["addJob"],
    } as unknown as CommandContext["jobs"],
    storage: {},
    addDeliverable: () => {},
    ecosystem: {} as CommandContext["ecosystem"],
    system: {} as CommandContext["system"],
  } as unknown as CommandContext;
}

describe("meta commands", () => {
  describe("create_job", () => {
    it("queues the named command and returns the spawned jobId", async () => {
      const calls: Array<Record<string, unknown>> = [];
      const ctx = makeContext((j) => {
        calls.push(j as Record<string, unknown>);
        return { id: "job-123", type: (j as Record<string, unknown>).type, status: "queued" };
      });

      const result = await createJobCommand.execute(
        { commandId: "list_agents", args: { limit: 5 } },
        ctx,
      );

      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({ type: "list_agents", request: { limit: 5 } });
      expect(result).toMatchObject({ jobId: "job-123", queued: true });
    });

    it("rejects unknown commandIds with a discovery hint", async () => {
      const ctx = makeContext(() => ({ id: "x" }));
      await expect(
        createJobCommand.execute({ commandId: "does_not_exist", args: {} }, ctx),
      ).rejects.toThrow(/Unknown commandId/);
    });

    it("refuses recursive create_job invocations", async () => {
      const ctx = makeContext(() => ({ id: "x" }));
      await expect(
        createJobCommand.execute({ commandId: "create_job", args: {} }, ctx),
      ).rejects.toThrow(/not allowed/);
    });

    it("refuses system-reserved commands", async () => {
      const ctx = makeContext(() => ({ id: "x" }));
      await expect(
        createJobCommand.execute({ commandId: "set_api_key", args: {} }, ctx),
      ).rejects.toThrow(/not allowed/);
    });
  });

  describe("list_available_commands", () => {
    it("returns a non-empty array including registered commands", async () => {
      const ctx = makeContext(() => ({ id: "x" }));
      const out = (await listAvailableCommandsCommand.execute({}, ctx)) as {
        count: number;
        commands: Array<{ id: string }>;
      };
      expect(out.count).toBeGreaterThan(0);
      expect(out.commands.some((c) => c.id === "list_agents")).toBe(true);
      // Hidden / reserved commands are filtered out
      expect(out.commands.some((c) => c.id === "set_api_key")).toBe(false);
    });

    it("filters by toolkitId", async () => {
      const ctx = makeContext(() => ({ id: "x" }));
      const out = (await listAvailableCommandsCommand.execute(
        { toolkitId: "jobs" },
        ctx,
      )) as { commands: Array<{ id: string }> };
      expect(out.commands.every((c) => c.id !== "list_agents")).toBe(true);
      // create_job is intentionally excluded to prevent recursion; queue_new_job stays.
      expect(out.commands.some((c) => c.id === "queue_new_job")).toBe(true);
      expect(out.commands.some((c) => c.id === "create_job")).toBe(false);
    });
  });

  describe("get_command_schema", () => {
    it("returns the args schema for a known command", async () => {
      const ctx = makeContext(() => ({ id: "x" }));
      const out = (await getCommandSchemaCommand.execute(
        { commandId: "create_job" },
        ctx,
      )) as { id: string; args: Array<{ name: string }> };
      expect(out.id).toBe("create_job");
      expect(out.args.map((a) => a.name)).toContain("commandId");
    });
  });

  describe("list_toolkits", () => {
    it("returns every registered toolkit", async () => {
      const ctx = makeContext(() => ({ id: "x" }));
      const out = (await listToolkitsCommand.execute({}, ctx)) as {
        count: number;
        toolkits: Array<{ id: string }>;
      };
      expect(out.count).toBeGreaterThan(0);
      expect(out.toolkits.some((t) => t.id === "jobs")).toBe(true);
    });
  });

  describe("query_workspace", () => {
    function makeRichContext(): CommandContext {
      const base = makeContext(() => ({ id: "x" }));
      const agents = [
        { id: "a1", name: "A1", role: "researcher", status: "active" },
        { id: "a2", name: "A2", role: "builder", status: "active" },
      ];
      const channels = [{ id: "c1", from: "a1", to: "a2", type: "p2p", offset: 0, createdAt: "" }];
      const groups = [{ id: "g1", name: "G1", members: ["a1", "a2"] }];
      const messages = Array.from({ length: 30 }, (_, i) => ({ id: `m${i}`, body: `msg ${i}` }));
      const queue = [
        { id: "j1", type: "list_agents", status: "completed", createdAt: 1, completedAt: 2 },
        { id: "j2", type: "list_agents", status: "running", createdAt: 3 },
        { id: "j3", type: "send_message", status: "queued", createdAt: 4 },
      ];
      const networks = [{ id: "n1", name: "N1", members: ["a1"] }];
      const bridges = [
        { id: "b1", fromNetworkId: "n1", toNetworkId: "n2", fromAgentId: "a1", toAgentId: "a2", type: "p2p", offset: 0, createdAt: "" },
      ];
      return {
        ...base,
        workspace: { ...base.workspace, agents, channels, groups, messages } as unknown as CommandContext["workspace"],
        jobs: {
          ...(base.jobs as object),
          getQueue: () => queue,
          getCatalog: () => [],
          allArtifacts: [],
          isPaused: false,
        } as unknown as CommandContext["jobs"],
        ecosystem: { networks, bridges, activeNetworkId: "n1" } as unknown as CommandContext["ecosystem"],
      } as CommandContext;
    }

    it("returns a summary section with rolled-up counts by default", async () => {
      const ctx = makeRichContext();
      const out = (await queryWorkspaceCommand.execute({}, ctx)) as Record<string, Record<string, unknown>>;
      expect(out.summary).toMatchObject({
        agentCount: 2,
        channelCount: 1,
        groupCount: 1,
        messageCount: 30,
        queueDepth: 3,
        runningJobs: 1,
        networkCount: 1,
        bridgeCount: 1,
        activeNetworkId: "n1",
        queuePaused: false,
      });
    });

    it("honors the sections filter", async () => {
      const ctx = makeRichContext();
      const out = (await queryWorkspaceCommand.execute({ sections: ["agents", "jobs"] }, ctx)) as Record<string, unknown>;
      expect(out.agents).toBeDefined();
      expect(out.jobs).toBeDefined();
      expect(out.summary).toBeUndefined();
      expect(out.channels).toBeUndefined();
    });

    it("respects messageLimit", async () => {
      const ctx = makeRichContext();
      const out = (await queryWorkspaceCommand.execute(
        { sections: ["messages"], messageLimit: 5 },
        ctx,
      )) as { messages: { total: number; returned: number; items: unknown[] } };
      expect(out.messages.total).toBe(30);
      expect(out.messages.returned).toBe(5);
      expect(out.messages.items).toHaveLength(5);
    });

    it("rolls up jobs by status and type", async () => {
      const ctx = makeRichContext();
      const out = (await queryWorkspaceCommand.execute({ sections: ["jobs"] }, ctx)) as {
        jobs: { byStatus: Record<string, number>; byType: Record<string, number> };
      };
      expect(out.jobs.byStatus).toMatchObject({ completed: 1, running: 1, queued: 1 });
      expect(out.jobs.byType).toMatchObject({ list_agents: 2, send_message: 1 });
    });

    it("returns a stack section with all five IPFS-stack services", async () => {
      const ctx = makeRichContext();
      const out = (await queryWorkspaceCommand.execute({ sections: ["stack"] }, ctx)) as {
        stack: Record<string, { count: number; nodes: unknown[] }>;
      };
      expect(out.stack).toBeDefined();
      // Every service exposed — even when zero nodes are configured the
      // shape is present so agents can rely on a stable schema.
      for (const key of ["libp2p", "helia", "kubo", "orbitdb", "orbitdbServer"]) {
        expect(out.stack[key], `missing stack.${key}`).toBeDefined();
        expect(typeof out.stack[key].count).toBe("number");
        expect(Array.isArray(out.stack[key].nodes)).toBe(true);
      }
    });

    it("includes a stack rollup in the summary section", async () => {
      const ctx = makeRichContext();
      const out = (await queryWorkspaceCommand.execute({ sections: ["summary"] }, ctx)) as {
        summary: { stack: Record<string, number> };
      };
      expect(out.summary.stack).toBeDefined();
      expect(typeof out.summary.stack.libp2pNodes).toBe("number");
      expect(typeof out.summary.stack.heliaNodes).toBe("number");
      expect(typeof out.summary.stack.kuboNodes).toBe("number");
      expect(typeof out.summary.stack.orbitdbNodes).toBe("number");
      expect(typeof out.summary.stack.orbitdbServerNodes).toBe("number");
    });
  });
});

describe("default agent tool surface", () => {
  it("getAllTools() returns a small curated set well under the 128-tool cap", () => {
    const tools = getAllTools();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.length).toBeLessThan(20);

    const names = new Set(tools.map((t) => t.name));
    expect(names.has("create_job")).toBe(true);
    expect(names.has("list_available_commands")).toBe(true);
    expect(names.has("get_command_schema")).toBe(true);
    expect(names.has("list_toolkits")).toBe(true);
  });

  it("getToolsForAgent(no bindings) returns just the curated default set", () => {
    const agent = { id: "a1", toolkits: [] } as unknown as Agent;
    const tools = getToolsForAgent(agent);
    const names = new Set(tools.map((t) => t.name));
    expect(names.has("create_job")).toBe(true);
    // Should NOT include arbitrary toolkit commands when no bindings exist
    expect(tools.length).toBeLessThan(20);
  });

  it("getToolsForAgent(with bindings) adds the toolkit's commands on top of defaults", () => {
    const agent = {
      id: "a2",
      toolkits: [{ toolkitId: "jobs", enabledAt: new Date().toISOString() }],
    } as unknown as Agent;
    const tools = getToolsForAgent(agent);
    const names = new Set(tools.map((t) => t.name));
    expect(names.has("create_job")).toBe(true); // default
    expect(names.has("queue_new_job")).toBe(true); // from jobs toolkit
  });

  it("getToolsForAgent honors the curated tools[] subset, not the full commands[]", () => {
    // The jobs toolkit's `commands` array includes pause_queue / resume_queue /
    // save_job_definition etc., but its curated `tools[]` exposes only the
    // hot-path subset. Long-tail commands must stay registry-only.
    const agent = {
      id: "a3",
      toolkits: [{ toolkitId: "jobs", enabledAt: new Date().toISOString() }],
    } as unknown as Agent;
    const tools = getToolsForAgent(agent);
    const names = new Set(tools.map((t) => t.name));
    expect(names.has("queue_new_job")).toBe(true); // curated → direct tool
    expect(names.has("pause_queue")).toBe(false); // not curated → registry-only
    expect(names.has("save_job_definition")).toBe(false); // not curated
  });

  it("getToolsForAgent on an unmigrated toolkit yields only the default surface", () => {
    // A toolkit with no `tools[].commandId` entries contributes zero direct
    // tools — agents reach its commands via create_job. This keeps us under
    // Anthropic's 128-tool cap as more toolkits are added.
    const unmigrated = getUnmigratedToolkitsForAgentTools();
    if (unmigrated.length === 0) {
      // Every toolkit has been migrated — skip.
      return;
    }
    const agent = {
      id: "a4",
      toolkits: [{ toolkitId: unmigrated[0], enabledAt: new Date().toISOString() }],
    } as unknown as Agent;
    const defaults = new Set(getAllTools().map((t) => t.name));
    const agentTools = getToolsForAgent(agent);
    expect(agentTools.length).toBe(defaults.size);
    for (const t of agentTools) {
      expect(defaults.has(t.name)).toBe(true);
    }
  });

  it("create_job is registered in the global command registry", () => {
    expect(registry.get("create_job")).toBeDefined();
    expect(registry.get("list_available_commands")).toBeDefined();
    expect(registry.get("get_command_schema")).toBeDefined();
    expect(registry.get("list_toolkits")).toBeDefined();
  });
});
