import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { enableToolkitCommand, disableToolkitCommand, setAgentToolkitsCommand } from "@/services/commands/definitions/toolkit";
import { collectiveMemoryCommands } from "@/services/commands/definitions/collective-memory";
import { initializeRegistry } from "@/services/commands/init";
import type { Agent } from "@/types";

function makeContext(initialAgents: Agent[]) {
  let agents = [...initialAgents];

  const workspace = {
    agents,
    getAgents: () => agents,
    setAgents: (updater: (prev: Agent[]) => Agent[]) => {
      agents = updater(agents);
      workspace.agents = agents;
    },
    addLog: vi.fn(),
  };

  return {
    context: {
      workspace,
      storage: {},
    } as any,
    getAgents: () => agents,
  };
}

describe("toolkit + memory mode semantics", () => {
  beforeAll(() => {
    initializeRegistry();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("disable_toolkit on collective-memory enables dark mode", async () => {
    const { context, getAgents } = makeContext([
      {
        id: "a1",
        name: "Agent 1",
        role: "researcher",
        prompt: "x",
        did: "did:ex:a1",
        keys: { publicKey: "p", privateKey: "s" },
        createdAt: new Date().toISOString(),
        status: "active",
        isDarkAgent: false,
        toolkits: [{ toolkitId: "collective-memory", enabledAt: new Date().toISOString() }],
      } as unknown as Agent,
    ]);

    const result = await disableToolkitCommand.execute(
      { agentId: "a1", toolkitId: "collective-memory" },
      context,
    );

    expect(result).toMatchObject({ status: "dark_mode_enabled" });
    expect(getAgents()[0].isDarkAgent).toBe(true);
    expect(getAgents()[0].toolkits?.some((t) => t.toolkitId === "collective-memory")).toBe(false);
  });

  it("enable_toolkit on collective-memory clears dark mode", async () => {
    const { context, getAgents } = makeContext([
      {
        id: "a2",
        name: "Agent 2",
        role: "researcher",
        prompt: "x",
        did: "did:ex:a2",
        keys: { publicKey: "p", privateKey: "s" },
        createdAt: new Date().toISOString(),
        status: "active",
        isDarkAgent: true,
        toolkits: [],
      } as unknown as Agent,
    ]);

    const result = await enableToolkitCommand.execute(
      { agentId: "a2", toolkitId: "collective-memory" },
      context,
    );

    expect(result).toMatchObject({ status: "enabled" });
    expect(getAgents()[0].isDarkAgent).toBe(false);
    expect(getAgents()[0].toolkits?.some((t) => t.toolkitId === "collective-memory")).toBe(true);
  });

  it("set_agent_toolkits derives dark mode from collective-memory inclusion", async () => {
    const { context, getAgents } = makeContext([
      {
        id: "a3",
        name: "Agent 3",
        role: "researcher",
        prompt: "x",
        did: "did:ex:a3",
        keys: { publicKey: "p", privateKey: "s" },
        createdAt: new Date().toISOString(),
        status: "active",
        isDarkAgent: false,
        toolkits: [{ toolkitId: "collective-memory", enabledAt: new Date().toISOString() }],
      } as unknown as Agent,
    ]);

    await setAgentToolkitsCommand.execute(
      { agentId: "a3", toolkitIds: ["jobs"] },
      context,
    );
    expect(getAgents()[0].isDarkAgent).toBe(true);

    await setAgentToolkitsCommand.execute(
      { agentId: "a3", toolkitIds: ["jobs", "collective-memory"] },
      context,
    );
    expect(getAgents()[0].isDarkAgent).toBe(false);
  });

  it("set_agent_memory_mode toggles dark/collective and toolkit binding", async () => {
    const setModeCommand = collectiveMemoryCommands.find((c) => c.id === "set_agent_memory_mode");
    expect(setModeCommand).toBeDefined();

    const { context, getAgents } = makeContext([
      {
        id: "a4",
        name: "Agent 4",
        role: "researcher",
        prompt: "x",
        did: "did:ex:a4",
        keys: { publicKey: "p", privateKey: "s" },
        createdAt: new Date().toISOString(),
        status: "active",
        isDarkAgent: true,
        toolkits: [{ toolkitId: "jobs", enabledAt: new Date().toISOString() }],
      } as unknown as Agent,
    ]);

    const toCollective = await setModeCommand!.execute(
      { agentId: "a4", mode: "collective" },
      context,
    );
    expect(toCollective).toMatchObject({ mode: "collective", isDarkAgent: false });
    expect(getAgents()[0].toolkits?.some((t) => t.toolkitId === "collective-memory")).toBe(true);

    const toDark = await setModeCommand!.execute(
      { agentId: "a4", mode: "dark" },
      context,
    );
    expect(toDark).toMatchObject({ mode: "dark", isDarkAgent: true });
    expect(getAgents()[0].toolkits?.some((t) => t.toolkitId === "collective-memory")).toBe(false);
  });
});
