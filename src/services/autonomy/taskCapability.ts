/**
 * Capability-gap handler — proposes/creates specialist agents when planning
 * surfaces required-command shortages.
 *
 * Split from taskEngine.ts per §3.8 of MVP_AUDIT_AND_REFACTOR_PLAN.md.
 */
import type { Agent, Group } from "@/types";
import type { AgentTask, AgentSpec, ConsensusProposal } from "@/types/autonomy";
import type { CommandContext } from "@/services/commands/types";
import { registry } from "@/services/commands/registry";
import { identifyGaps } from "./capability";
import { deliberate, buildAgentProposal } from "./consensus";
import { addEvent } from "./taskStore";

export async function handleCapabilityGaps(
  task: AgentTask,
  gaps: string[],
  groupId: string,
  proposingAgent: Agent,
  agents: Agent[],
  groups: Group[],
  context: CommandContext,
): Promise<boolean> {
  const group = groups.find((g) => g.id === groupId);
  if (!group) return false;

  // Check what commands are missing
  const requiredCommands = gaps
    .map(g => g.match(/\b[a-z_]+\b/g))
    .flat()
    .filter(Boolean) as string[];

  const { missingCommands, recommendations } = identifyGaps(agents, requiredCommands);

  if (recommendations.length === 0) return false;

  // Build a proposal for creating a new agent
  const spec: AgentSpec = {
    name: `${group.name}-specialist-${Date.now().toString(36)}`,
    role: extractRoleFromRecommendation(recommendations[0]),
    prompt: `You are a specialist agent created to address capability gaps in the "${group.name}" group. Your primary focus: ${gaps.join(", ")}`,
    justification: `Capability gaps identified during autonomous task execution: ${gaps.join("; ")}. Recommendations: ${recommendations.join("; ")}`,
    groupId,
  };

  const proposal = {
    ...buildAgentProposal(proposingAgent.id, groupId, spec),
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };

  addEvent(task, {
    kind: "agent_proposed",
    timestamp: new Date().toISOString(),
    agentId: proposingAgent.id,
    detail: { proposalId: proposal.id, spec },
  });

  context.workspace.addLog(
    `💡 [${proposingAgent.name}] Proposing new agent "${spec.name}" (${spec.role}) to fill capability gap`,
  );

  // Run deliberation if group has members
  const memberAgents = group.members
    .map((mid: string) => agents.find((a: Agent) => a.id === mid))
    .filter(Boolean) as Agent[];

  if (memberAgents.length >= 2) {
    const deliberated = await deliberate(
      proposal as ConsensusProposal,
      memberAgents,
      group.governance,
      group.threshold,
      group.modelId,
    );

    addEvent(task, {
      kind: "consensus_reached",
      timestamp: new Date().toISOString(),
      agentId: proposingAgent.id,
      detail: {
        proposalId: proposal.id,
        outcome: deliberated.outcome,
        positions: deliberated.positions.map(p => ({
          agent: p.agentName,
          vote: p.vote,
        })),
      },
    });

    if (!deliberated.outcome?.passed) {
      context.workspace.addLog(
        `❌ Group "${group.name}" rejected agent proposal: ${deliberated.outcome?.decision}`,
      );
      return false;
    }

    context.workspace.addLog(
      `✅ Group "${group.name}" approved new agent: ${deliberated.outcome?.decision}`,
    );
  }

  // Auto-execute if configured (or if group is too small for deliberation)
  if (task.config.autoExecuteConsensus || memberAgents.length < 2) {
    try {
      await registry.execute("create_agent", {
        name: spec.name,
        role: spec.role,
        prompt: spec.prompt,
        title: spec.title,
      }, context);

      addEvent(task, {
        kind: "agent_created",
        timestamp: new Date().toISOString(),
        agentId: proposingAgent.id,
        detail: { agentName: spec.name, role: spec.role },
      });

      context.workspace.addLog(`🆕 Created agent "${spec.name}" (${spec.role})`);

      // If the new agent should be in the group, add it
      if (spec.groupId) {
        const newAgent = context.storage[`agent_${spec.name}`];
        if (newAgent) {
          try {
            await registry.execute("toggle_group_member", {
              groupId: spec.groupId,
              agentId: newAgent,
            }, context);
          } catch { /* best effort */ }
        }
      }

      return true;
    } catch (err) {
      context.workspace.addLog(
        `⚠️ Failed to create agent: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  // Proposal created but awaiting human approval
  context.workspace.addLog(
    `📋 Agent proposal "${spec.name}" created — awaiting human approval`,
  );

  // Store proposal for human review
  context.storage[`proposal_${proposal.id}`] = proposal;
  return false;
}

function extractRoleFromRecommendation(rec: string): string {
  const lower = rec.toLowerCase();
  if (lower.includes("researcher")) return "researcher";
  if (lower.includes("builder")) return "builder";
  if (lower.includes("curator")) return "curator";
  if (lower.includes("validator")) return "validator";
  if (lower.includes("orchestrator")) return "orchestrator";
  return "builder"; // default role
}
