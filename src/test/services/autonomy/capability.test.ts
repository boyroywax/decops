import { describe, it, expect, vi, beforeEach } from "vitest";
import { assessAgent, rankAgentsForGoal, findBestGroupMember, identifyGaps } from "@/services/autonomy/capability";
import type { Agent } from "@/types";

// Mock the registry so tests don't depend on init state
vi.mock("../../../services/commands/registry", () => {
  const mockCommands = [
    { id: "create_agent", rbac: ["orchestrator", "builder"], tags: ["agent"] },
    { id: "send_message", rbac: ["researcher", "builder", "orchestrator", "curator", "validator"], tags: ["messaging"] },
    { id: "prompt_architect", rbac: ["orchestrator"], tags: ["architect"] },
    { id: "create_artifact", rbac: ["builder", "curator"], tags: ["artifact"] },
    { id: "assign_task", rbac: ["orchestrator", "builder", "researcher", "curator", "validator"], tags: ["autonomy"] },
  ];
  return {
    registry: {
      getAll: () => mockCommands,
      get: (id: string) => mockCommands.find(c => c.id === id),
    },
  };
});

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: overrides.id ?? "agent-1",
    name: overrides.name ?? "Test Agent",
    title: overrides.title,
    role: overrides.role ?? "researcher",
    prompt: overrides.prompt ?? "I research things",
    did: "did:peer:abc123...def456",
    keys: { pub: "0xabc...", priv: "••••••abcd" },
    createdAt: new Date().toISOString(),
    status: "active",
    aieos: {
      version: "1.2.0",
      identity: { name: overrides.name ?? "Test Agent", entityType: "agent" },
      capabilities: {
        skills: overrides.aieos?.capabilities?.skills ?? [
          { name: "research", level: "advanced" },
          { name: "analysis", level: "intermediate" },
        ],
      },
      ...(overrides.aieos || {}),
    } as any,
    ...(overrides as any),
  };
}

describe("capability assessment", () => {
  describe("assessAgent", () => {
    it("extracts skills from AIEOS capabilities", () => {
      const agent = makeAgent({
        aieos: {
          capabilities: {
            skills: [
              { name: "code-review", level: "advanced" },
              { name: "testing", level: "intermediate" },
            ],
          },
        } as any,
      });
      const cap = assessAgent(agent);
      expect(cap.skills).toContain("code-review");
      expect(cap.skills).toContain("testing");
    });

    it("returns agentId and agentName", () => {
      const agent = makeAgent({ id: "a-42", name: "Alice" });
      const cap = assessAgent(agent);
      expect(cap.agentId).toBe("a-42");
      expect(cap.agentName).toBe("Alice");
    });

    it("returns allowed commands filtered by RBAC", () => {
      // researcher can do send_message and assign_task
      const agent = makeAgent({ role: "researcher" });
      const cap = assessAgent(agent);
      expect(cap.allowedCommands).toContain("send_message");
      expect(cap.allowedCommands).toContain("assign_task");
      expect(cap.allowedCommands).not.toContain("create_agent"); // orchestrator/builder only
    });

    it("handles agent with no AIEOS capabilities", () => {
      const agent = makeAgent();
      // Clear capabilities
      (agent.aieos as any).capabilities = undefined;
      const cap = assessAgent(agent);
      expect(cap.skills).toEqual([]);
    });

    it("orchestrator gets more commands", () => {
      const agent = makeAgent({ role: "orchestrator" });
      const cap = assessAgent(agent);
      expect(cap.allowedCommands).toContain("create_agent");
      expect(cap.allowedCommands).toContain("prompt_architect");
      expect(cap.allowedCommands).toContain("send_message");
      expect(cap.allowedCommands).toContain("assign_task");
    });
  });

  describe("rankAgentsForGoal", () => {
    it("ranks agents by relevance to a goal", () => {
      const agents = [
        makeAgent({ id: "a1", name: "Data Builder", role: "builder", prompt: "I build data pipelines" }),
        makeAgent({ id: "a2", name: "Research Lead", role: "researcher", prompt: "I research and analyze data" }),
        makeAgent({ id: "a3", name: "Validator", role: "validator", prompt: "I validate deployments" }),
      ];

      const ranked = rankAgentsForGoal(agents, "research and analyze market data");
      expect(ranked.length).toBe(3);
      // The researcher should rank highest for a research goal
      expect(ranked[0].agentId).toBe("a2");
    });

    it("excludes specified agent IDs", () => {
      const agents = [
        makeAgent({ id: "a1", name: "Agent One", role: "researcher" }),
        makeAgent({ id: "a2", name: "Agent Two", role: "builder" }),
      ];

      const ranked = rankAgentsForGoal(agents, "research something", ["a1"]);
      expect(ranked.length).toBe(1);
      expect(ranked[0].agentId).toBe("a2");
    });

    it("returns empty array when all agents excluded", () => {
      const agents = [makeAgent({ id: "a1" })];
      const ranked = rankAgentsForGoal(agents, "anything", ["a1"]);
      expect(ranked).toEqual([]);
    });

    it("boosts orchestrators for coordination tasks", () => {
      const agents = [
        makeAgent({ id: "a1", name: "Worker", role: "builder", prompt: "I write code" }),
        makeAgent({ id: "a2", name: "Manager", role: "orchestrator", prompt: "I coordinate" }),
      ];

      const ranked = rankAgentsForGoal(agents, "coordinate and manage the team workflow");
      expect(ranked[0].agentId).toBe("a2");
    });
  });

  describe("findBestGroupMember", () => {
    it("returns best member from group", () => {
      const agents = [
        makeAgent({ id: "a1", name: "R1", role: "researcher", prompt: "I research data" }),
        makeAgent({ id: "a2", name: "B1", role: "builder", prompt: "I build things" }),
        makeAgent({ id: "a3", name: "Outside", role: "curator", prompt: "Not in group" }),
      ];

      const best = findBestGroupMember(["a1", "a2"], agents, "research data trends");
      expect(best).not.toBeNull();
      expect(best!.agentId).toBe("a1");
    });

    it("returns null when no members found", () => {
      const agents = [makeAgent({ id: "a1" })];
      const best = findBestGroupMember(["nonexistent"], agents, "anything");
      expect(best).toBeNull();
    });
  });

  describe("identifyGaps", () => {
    it("identifies missing commands", () => {
      const agents = [
        makeAgent({ role: "researcher" }), // has send_message, assign_task
      ];

      const result = identifyGaps(agents, ["send_message", "create_agent", "prompt_architect"]);
      expect(result.missingCommands).toContain("create_agent");
      expect(result.missingCommands).toContain("prompt_architect");
      expect(result.missingCommands).not.toContain("send_message");
    });

    it("returns no gaps when all commands covered", () => {
      const agents = [
        makeAgent({ role: "orchestrator" }),
      ];
      const result = identifyGaps(agents, ["create_agent", "send_message", "prompt_architect"]);
      expect(result.missingCommands).toEqual([]);
    });

    it("provides recommendations with role suggestions", () => {
      const agents = [
        makeAgent({ role: "researcher" }),
      ];

      const result = identifyGaps(agents, ["create_agent", "prompt_architect"]);
      expect(result.recommendations.length).toBeGreaterThan(0);
      // Should recommend an orchestrator since those commands need that role
      expect(result.recommendations.some(r => r.includes("orchestrator"))).toBe(true);
    });
  });
});
