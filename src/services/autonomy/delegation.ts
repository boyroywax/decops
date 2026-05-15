/**
 * Task delegation — routes tasks between agents, groups, networks, and the ecosystem.
 *
 * Delegation flow:
 * 1. Agent determines it can't complete a task (from planner)
 * 2. Selects best target: peer agent → group → network → ecosystem
 * 3. Creates a sub-task assigned to that target
 * 4. Target agent plans and executes (recursive)
 * 5. Results flow back up the chain
 */

import type { Agent, Group, Network } from "@/types";
import type {
  AgentTask,
  DelegationRequest,
  DelegationResponse,
  DelegationTarget,
  TaskEvent,
  EscalationLevel,
} from "@/types/autonomy";
import { rankAgentsForGoal, findBestGroupMember } from "./capability";

/**
 * Find the best delegation target for a task at the current escalation level.
 *
 * @param level - Current escalation level
 * @param agent - The agent looking to delegate
 * @param goal - Task goal
 * @param agents - All agents in the workspace
 * @param groups - All groups
 * @param networks - All networks
 * @param excludeIds - Agent IDs to exclude (already tried)
 */
export function findDelegationTarget(
  level: EscalationLevel,
  agent: Agent,
  goal: string,
  agents: Agent[],
  groups: Group[],
  networks: Network[],
  excludeIds: string[] = [],
): DelegationTarget | null {
  const exclude = [...excludeIds, agent.id];

  switch (level) {
    case "self":
      // Already at self level, can't delegate to self
      return null;

    case "group": {
      // Find the agent's group(s) and look for best member
      const agentGroups = groups.filter((g: Group) =>
        g.members?.includes(agent.id),
      );
      for (const group of agentGroups) {
        const best = findBestGroupMember(group.members, agents, goal, exclude);
        if (best && (best.relevanceScore ?? 0) > 0.1) {
          return {
            type: "agent",
            targetId: best.agentId,
            reasoning: `Delegating within group "${group.name}" to ${best.agentName} (${best.role}) — relevance: ${((best.relevanceScore ?? 0) * 100).toFixed(0)}%`,
          };
        }
      }

      // If no good individual match, delegate to the group itself
      if (agentGroups.length > 0) {
        return {
          type: "group",
          targetId: agentGroups[0].id,
          reasoning: `No individual group member is a strong match. Escalating to group "${agentGroups[0].name}" for collective deliberation.`,
        };
      }
      return null;
    }

    case "network": {
      // Find agents across the current network
      const agentNetwork = networks.find(n =>
        n.agents?.some(a => a.id === agent.id),
      );
      if (agentNetwork) {
        const networkAgents = agentNetwork.agents || [];
        const ranked = rankAgentsForGoal(networkAgents, goal, exclude);
        if (ranked.length > 0 && (ranked[0].relevanceScore ?? 0) > 0.05) {
          return {
            type: "agent",
            targetId: ranked[0].agentId,
            reasoning: `Found ${ranked[0].agentName} (${ranked[0].role}) in network "${agentNetwork.name}" — relevance: ${((ranked[0].relevanceScore ?? 0) * 100).toFixed(0)}%`,
          };
        }
      }

      // Fall back to any network agent
      const allNetworkAgents = networks.flatMap(n => n.agents || []);
      const ranked = rankAgentsForGoal(allNetworkAgents, goal, exclude);
      if (ranked.length > 0 && (ranked[0].relevanceScore ?? 0) > 0.05) {
        const targetNetwork = networks.find(n =>
          n.agents?.some(a => a.id === ranked[0].agentId),
        );
        return {
          type: "agent",
          targetId: ranked[0].agentId,
          reasoning: `Cross-network delegation to ${ranked[0].agentName} (${ranked[0].role}) in "${targetNetwork?.name ?? "unknown"}" network — relevance: ${((ranked[0].relevanceScore ?? 0) * 100).toFixed(0)}%`,
        };
      }

      // Delegate to network level
      if (networks.length > 0) {
        const targetNet = networks.find(n => n.agents?.some(a => a.id === agent.id)) || networks[0];
        return {
          type: "network",
          targetId: targetNet.id,
          reasoning: `No well-matched agent found. Escalating to network "${targetNet.name}" for broader capability search.`,
        };
      }
      return null;
    }

    case "ecosystem": {
      // At ecosystem level — search ALL agents across ALL networks
      const allAgents = [
        ...agents,
        ...networks.flatMap(n => n.agents || []),
      ];
      // Deduplicate by ID
      const seen = new Set<string>();
      const unique = allAgents.filter(a => {
        if (seen.has(a.id)) return false;
        seen.add(a.id);
        return true;
      });
      const ranked = rankAgentsForGoal(unique, goal, exclude);
      if (ranked.length > 0 && (ranked[0].relevanceScore ?? 0) > 0.05) {
        return {
          type: "agent",
          targetId: ranked[0].agentId,
          reasoning: `Ecosystem-wide search found ${ranked[0].agentName} (${ranked[0].role}) — relevance: ${((ranked[0].relevanceScore ?? 0) * 100).toFixed(0)}%`,
        };
      }

      // At ceiling — return ecosystem-level target
      return {
        type: "ecosystem",
        targetId: "ecosystem",
        reasoning: "No suitable agent found across the entire ecosystem. Group ideation may be needed to create new capabilities.",
      };
    }

    default:
      return null;
  }
}

/**
 * Build a delegation request from a task and target.
 */
export function buildDelegationRequest(
  task: AgentTask,
  target: DelegationTarget,
  subGoal?: string,
  additionalContext?: string,
): DelegationRequest {
  return {
    taskId: task.id,
    fromAgentId: task.assigneeId,
    target,
    subGoal: subGoal || task.goal,
    context: [
      `Original goal: ${task.goal}`,
      task.constraints?.length ? `Constraints: ${task.constraints.join("; ")}` : "",
      additionalContext || "",
      `Escalation level: ${task.escalationLevel}`,
      `History: ${task.history.length} events so far`,
    ].filter(Boolean).join("\n"),
  };
}

/**
 * Create a delegation event for the task history.
 */
export function delegationEvent(
  agentId: string,
  target: DelegationTarget,
  subTaskId?: string,
): TaskEvent {
  return {
    kind: "delegated",
    timestamp: new Date().toISOString(),
    agentId,
    detail: {
      targetType: target.type,
      targetId: target.targetId,
      reasoning: target.reasoning,
      subTaskId,
    },
  };
}

/**
 * Create an escalation event for the task history.
 */
export function escalationEvent(
  agentId: string,
  fromLevel: EscalationLevel,
  toLevel: EscalationLevel,
  reason: string,
): TaskEvent {
  return {
    kind: "escalated",
    timestamp: new Date().toISOString(),
    agentId,
    detail: { fromLevel, toLevel, reason },
  };
}
