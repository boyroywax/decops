import { beforeEach, describe, expect, it } from "vitest";
import type { Agent } from "@/types";
import { agentCognitionService } from "@/toolkits/cognition/service";

const STORAGE_KEY = "decops.agent-cognition.profiles.v1";

function makeAgent(toolkits: Agent["toolkits"]): Agent {
  return {
    id: "agent-1",
    name: "Agent One",
    role: "researcher",
    prompt: "Do work",
    did: "did:example:agent-1",
    keys: { pub: "pub", priv: "priv" },
    createdAt: new Date().toISOString(),
    status: "active",
    aieos: {} as Agent["aieos"],
    toolkits,
  };
}

describe("agentCognitionService", () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it("loads default profiles when storage is empty", () => {
    const profiles = agentCognitionService.listProfiles();
    const ids = profiles.map((p) => p.spec.profileId);
    expect(ids).toContain("linear-v1");
    expect(ids).toContain("adaptive-v1");
  });

  it("renders selected profile for an agent binding", () => {
    const agent = makeAgent([
      {
        toolkitId: "agent-cognition",
        enabledAt: new Date().toISOString(),
        config: { profileId: "adaptive-v1" },
      },
    ]);

    const protocol = agentCognitionService.renderProtocolForAgent(agent);
    expect(protocol.profileId).toBe("adaptive-v1");
    expect(protocol.text).toContain("AGENT COGNITION PROTOCOL");
    expect(protocol.text).toContain("Mind-map nodes");
    expect(protocol.text).toContain("Transitions");
    expect(protocol.text).toContain("Never end the turn immediately after a tool call");
  });

  it("falls back to linear profile when binding profile is unknown", () => {
    const agent = makeAgent([
      {
        toolkitId: "agent-cognition",
        enabledAt: new Date().toISOString(),
        config: { profileId: "missing-profile" },
      },
    ]);

    const protocol = agentCognitionService.renderProtocolForAgent(agent);
    expect(protocol.profileId).toBe("linear-v1");
  });
});
