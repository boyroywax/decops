import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent } from "@/types";
import { initializeRegistry } from "@/services/commands/init";
import {
  cognitionListProfilesCommand,
  cognitionSetAgentProfileCommand,
  cognitionRenderProtocolCommand,
} from "@/toolkits/cognition/commands/cognition";

const STORAGE_KEY = "decops.agent-cognition.profiles.v1";

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

describe("cognition commands", () => {
  beforeAll(() => {
    initializeRegistry();
  });

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    vi.clearAllMocks();
  });

  it("lists default cognition profiles", async () => {
    const result = await cognitionListProfilesCommand.execute({}, { workspace: {}, storage: {} } as any);
    expect(result.count).toBeGreaterThanOrEqual(2);
    expect(result.profiles.some((p: any) => p.profileId === "linear-v1")).toBe(true);
  });

  it("sets agent cognition profile and stores toolkit config", async () => {
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
        toolkits: [],
      } as unknown as Agent,
    ]);

    const result = await cognitionSetAgentProfileCommand.execute(
      { agentId: "a1", profileId: "adaptive-v1" },
      context,
    );

    expect(result).toMatchObject({ profileId: "adaptive-v1", toolkitId: "agent-cognition" });
    const updated = getAgents()[0];
    const binding = updated.toolkits?.find((b) => b.toolkitId === "agent-cognition");
    expect(binding).toBeDefined();
    expect((binding?.config as Record<string, unknown>)?.profileId).toBe("adaptive-v1");
  });

  it("renders protocol text for an explicit profile", async () => {
    const result = await cognitionRenderProtocolCommand.execute(
      { profileId: "linear-v1" },
      { workspace: {}, storage: {} } as any,
    );

    expect(result.profileId).toBe("linear-v1");
    expect(result.text).toContain("AGENT COGNITION PROTOCOL");
  });
});
