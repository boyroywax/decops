/**
 * Capability assessment — evaluates which agent/group/network can handle a
 * task, based on role, AIEOS skills, allowed commands, and semantic relevance.
 */

import type { Agent, RoleId } from "@/types";
import type { AgentCapability } from "@/types/autonomy";
import { registry } from "@/services/commands/registry";
import { getCommandIdsForAgent } from "@/services/commands/tools";
import { ROLES } from "@/constants";

/** Extract capabilities for a single agent */
export function assessAgent(agent: Agent): AgentCapability {
  const role = ROLES.find(r => r.id === agent.role);

  // Skills from AIEOS entity spec
  const skills: string[] = [];
  if (agent.aieos?.capabilities?.skills) {
    for (const skill of agent.aieos.capabilities.skills) {
      if (skill.name) skills.push(skill.name);
    }
  }

  // Commands gated by RBAC role
  const allCommands = registry.getAll();
  let allowedCommands = allCommands
    .filter(cmd => cmd.rbac.includes(agent.role))
    .map(cmd => cmd.id);

  // If agent has toolkit bindings, further restrict to toolkit-scoped commands
  const toolkitCommands = getCommandIdsForAgent(agent);
  if (toolkitCommands) {
    allowedCommands = allowedCommands.filter(cmdId => toolkitCommands.has(cmdId));
  }

  // Track which toolkits are enabled
  const enabledToolkits = (agent.toolkits || []).map(b => b.toolkitId);

  return {
    agentId: agent.id,
    agentName: agent.name,
    role: role?.label ?? agent.role,
    skills,
    allowedCommands,
    enabledToolkits,
  };
}

/** Assess all agents and return sorted by relevance to a goal */
export function rankAgentsForGoal(
  agents: Agent[],
  goal: string,
  excludeIds: string[] = [],
): AgentCapability[] {
  const lowerGoal = goal.toLowerCase();
  const capabilities = agents
    .filter(a => !excludeIds.includes(a.id))
    .map(agent => {
      const cap = assessAgent(agent);

      // Simple keyword relevance scoring
      let score = 0;

      // Role match
      if (lowerGoal.includes(cap.role.toLowerCase())) score += 0.3;

      // Skill match
      for (const skill of cap.skills) {
        if (lowerGoal.includes(skill.toLowerCase())) score += 0.2;
      }

      // Prompt match (agent's directive may reference relevant domains)
      if (agent.prompt) {
        const promptWords = agent.prompt.toLowerCase().split(/\s+/);
        const goalWords = lowerGoal.split(/\s+/);
        const overlap = goalWords.filter(w => w.length > 3 && promptWords.includes(w)).length;
        score += Math.min(overlap * 0.05, 0.3);
      }

      // Title match
      if (agent.title && lowerGoal.includes(agent.title.toLowerCase())) {
        score += 0.15;
      }

      // Orchestrators get a small boost for coordination tasks
      if (agent.role === "orchestrator" && /coordinate|organize|manage|plan|delegate/.test(lowerGoal)) {
        score += 0.15;
      }

      // Toolkit match — agents with toolkits that match goal keywords score higher
      if (cap.enabledToolkits && cap.enabledToolkits.length > 0) {
        for (const tkId of cap.enabledToolkits) {
          if (lowerGoal.includes(tkId.replace(/-/g, " ").toLowerCase())) score += 0.15;
        }
      }

      cap.relevanceScore = Math.min(score, 1.0);
      return cap;
    });

  return capabilities.sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));
}

/**
 * Find the best agent in a group for a given goal.
 * Returns null if no member agents can be resolved.
 */
export function findBestGroupMember(
  groupMemberIds: string[],
  agents: Agent[],
  goal: string,
  excludeIds: string[] = [],
): AgentCapability | null {
  const members = agents.filter(a => groupMemberIds.includes(a.id));
  const ranked = rankAgentsForGoal(members, goal, excludeIds);
  return ranked.length > 0 ? ranked[0] : null;
}

/**
 * Identify capability gaps — commands or domains that NO agent in the set covers.
 */
export function identifyGaps(
  agents: Agent[],
  requiredCommandIds: string[],
): { missingCommands: string[]; recommendations: string[] } {
  const allCaps = agents.map(a => assessAgent(a));
  const coveredCommands = new Set(allCaps.flatMap(c => c.allowedCommands));

  const missingCommands = requiredCommandIds.filter(id => !coveredCommands.has(id));

  const recommendations: string[] = [];
  if (missingCommands.length > 0) {
    // Determine which roles could fill the gap
    const allCommands = registry.getAll();
    const neededRoles = new Set<RoleId>();
    for (const cmdId of missingCommands) {
      const cmd = allCommands.find(c => c.id === cmdId);
      if (cmd) {
        for (const role of cmd.rbac) neededRoles.add(role);
      }
    }
    for (const role of neededRoles) {
      const existing = agents.filter(a => a.role === role);
      if (existing.length === 0) {
        recommendations.push(
          `Create a ${role} agent to cover: ${missingCommands.filter(id => {
            const cmd = allCommands.find(c => c.id === id);
            return cmd?.rbac.includes(role);
          }).join(", ")}`,
        );
      }
    }
  }

  return { missingCommands, recommendations };
}
