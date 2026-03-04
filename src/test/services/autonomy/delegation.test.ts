import { describe, it, expect, vi, beforeEach } from "vitest";
import { findDelegationTarget, buildDelegationRequest, delegationEvent, escalationEvent } from "@/services/autonomy/delegation";
import type { Agent, Network } from "@/types";
import type { AgentTask, DelegationTarget } from "@/types/autonomy";

// Mock capability module
vi.mock("../../../services/autonomy/capability", () => ({
  rankAgentsForGoal: vi.fn((agents, goal, excludeIds = []) => {
    const filtered = agents.filter((a: any) => !excludeIds.includes(a.id));
    return filtered.map((a: any) => ({
      agentId: a.id,
      agentName: a.name,
      role: a.role,
      skills: [],
      allowedCommands: [],
      relevanceScore: a.id === "best-agent" ? 0.9 : 0.3,
    })).sort((a: any, b: any) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));
  }),
  findBestGroupMember: vi.fn((memberIds, agents, goal, excludeIds = []) => {
    const members = agents
      .filter((a: any) => memberIds.includes(a.id) && !excludeIds.includes(a.id));
    if (members.length === 0) return null;
    return {
      agentId: members[0].id,
      agentName: members[0].name,
      role: members[0].role,
      skills: [],
      allowedCommands: [],
      relevanceScore: 0.5,
    };
  }),
}));

function makeAgent(id: string, name: string, role = "researcher", networkId?: string): Agent {
  return {
    id,
    name,
    title: undefined,
    role: role as any,
    prompt: `I am ${name}`,
    did: `did:peer:${id}`,
    keys: { pub: "0x...", priv: "••••" },
    createdAt: new Date().toISOString(),
    status: "active",
    networkId,
    aieos: { version: "1.1.0", identity: { name, entityType: "agent" } } as any,
  };
}

function makeGroup(id: string, members: string[]): any {
  return { id, name: `Group ${id}`, governance: "majority", members };
}

function makeNetwork(id: string, name: string): Network {
  return { id, name, did: `did:network:${id}`, color: "#333", agents: [], channels: [], groups: [], messages: [], createdAt: "" };
}

describe("delegation", () => {
  const agents = [
    makeAgent("agent-self", "Self Agent", "builder", "net-1"),
    makeAgent("agent-peer", "Peer Agent", "researcher", "net-1"),
    makeAgent("best-agent", "Best Agent", "orchestrator", "net-1"),
    makeAgent("other-net", "Other Net Agent", "builder", "net-2"),
  ];

  const groups = [
    makeGroup("g1", ["agent-self", "agent-peer", "best-agent"]),
  ];

  const networks = [
    makeNetwork("net-1", "Network One"),
    makeNetwork("net-2", "Network Two"),
  ];

  const selfAgent = agents[0];

  describe("findDelegationTarget", () => {
    it("returns null for self level", () => {
      const result = findDelegationTarget(
        "self", selfAgent, "build something", agents, groups, networks,
      );
      expect(result).toBeNull();
    });

    it("finds group member at group level", () => {
      const result = findDelegationTarget(
        "group", selfAgent, "research data", agents, groups, networks,
      );
      expect(result).not.toBeNull();
      expect(result!.type).toBe("agent");
      // Should find a peer from the group (excluding self)
      expect(result!.targetId).not.toBe("agent-self");
    });

    it("finds agent at network level", () => {
      const result = findDelegationTarget(
        "network", selfAgent, "research data", agents, groups, networks,
      );
      expect(result).not.toBeNull();
    });

    it("finds agent at ecosystem level", () => {
      const result = findDelegationTarget(
        "ecosystem", selfAgent, "something", agents, groups, networks,
      );
      expect(result).not.toBeNull();
    });

    it("excludes specified agent IDs", () => {
      const result = findDelegationTarget(
        "group", selfAgent, "something", agents, groups, networks,
        ["agent-peer", "best-agent"],
      );
      // All group members (except self, which is always excluded) are excluded
      // So should fall back to group target or null
      if (result) {
        expect(result.targetId).not.toBe("agent-peer");
        expect(result.targetId).not.toBe("best-agent");
      }
    });
  });

  describe("buildDelegationRequest", () => {
    it("creates a well-formed delegation request", () => {
      const task: AgentTask = {
        id: "task-1",
        goal: "Research market trends",
        createdBy: "agent-self",
        assigneeId: "agent-self",
        escalationLevel: "group",
        history: [],
        status: "executing",
        childTaskIds: [],
        config: {
          maxRounds: 12, maxEscalations: 3, allowSubTasks: true,
          allowJobCreation: true, allowAgentCreation: true,
          autoExecuteConsensus: false, maxConcurrentSubTasks: 4,
          taskTimeoutMs: 300000,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const target: DelegationTarget = {
        type: "agent",
        targetId: "agent-peer",
        reasoning: "Best match for research",
      };

      const req = buildDelegationRequest(task, target);
      expect(req.fromAgentId).toBe("agent-self");
      expect(req.target).toBe(target);
      expect(req.subGoal).toBe("Research market trends");
      expect(req.taskId).toBe("task-1");
    });
  });

  describe("delegationEvent", () => {
    it("creates a delegation event", () => {
      const target: DelegationTarget = {
        type: "agent",
        targetId: "agent-2",
        reasoning: "To better handle research",
      };
      const event = delegationEvent("agent-1", target, "sub-task-1");
      expect(event.kind).toBe("delegated");
      expect(event.agentId).toBe("agent-1");
      expect(event.detail.targetId).toBe("agent-2");
      expect(event.detail.subTaskId).toBe("sub-task-1");
      expect(event.timestamp).toBeDefined();
    });
  });

  describe("escalationEvent", () => {
    it("creates an escalation event", () => {
      const event = escalationEvent("agent-1", "self", "group", "Cannot complete alone");
      expect(event.kind).toBe("escalated");
      expect(event.agentId).toBe("agent-1");
      expect(event.detail.fromLevel).toBe("self");
      expect(event.detail.toLevel).toBe("group");
      expect(event.detail.reason).toBe("Cannot complete alone");
    });
  });
});
