/**
 * Group consensus engine — facilitates real AI-powered deliberation between
 * group members on proposals, including agent creation, workflow design,
 * and ecosystem restructuring.
 *
 * Flow:
 * 1. A proposal is created (from an agent or the task engine)
 * 2. Each group member's AI persona deliberates independently
 * 3. Votes are tallied under the group's governance model
 * 4. If passed, the proposal can be auto-executed or queued for human approval
 */

import type { Agent } from "../../types";
import type {
  ConsensusProposal,
  MemberPosition,
  ConsensusOutcome,
  ProposalKind,
  AgentSpec,
  WorkflowSpec,
  EcosystemChangeSpec,
} from "../../types/autonomy";
import { getGroupModel, getAgentModel } from "../ai/models";
import { buildProviderRequest, parseProviderResponse } from "../ai/providers";

/**
 * Run a full deliberation round for a proposal.
 *
 * Each member agent independently evaluates the proposal using their
 * persona (system prompt, role, AIEOS identity) and casts a vote.
 * The outcome is determined by the group's governance model.
 */
export async function deliberate(
  proposal: ConsensusProposal,
  memberAgents: Agent[],
  governance: string,
  threshold: number,
  groupModelId?: string,
): Promise<ConsensusProposal> {
  const model = getGroupModel(proposal.groupId, groupModelId);

  // Deliberate each member in parallel
  const positionPromises = memberAgents.map(agent =>
    deliberateMember(agent, proposal, model),
  );
  const positions = await Promise.all(positionPromises);

  // Tally votes under governance rules
  const outcome = tallyVotes(positions, governance, threshold, memberAgents.length);

  return {
    ...proposal,
    positions,
    outcome,
  };
}

/**
 * Get a single member agent's position on a proposal.
 */
async function deliberateMember(
  agent: Agent,
  proposal: ConsensusProposal,
  model: string,
): Promise<MemberPosition> {
  const systemPrompt = [
    `You are "${agent.name}", a ${agent.role} agent in a decentralized mesh workspace.`,
    agent.prompt ? `\nYour core directive:\n${agent.prompt}` : "",
    `\nYou are being asked to evaluate a proposal in your group.`,
    `Consider it from the perspective of your role and expertise.`,
    `\n## Response format`,
    `Respond with a JSON object (no markdown fences):`,
    `{`,
    `  "vote": "approve" | "reject" | "abstain",`,
    `  "reasoning": "Your detailed reasoning (2-4 sentences)",`,
    `  "amendments": ["Optional suggested changes to improve the proposal"]`,
    `}`,
  ].filter(Boolean).join("\n");

  const userMessage = [
    `## Proposal: ${proposal.title}`,
    `Kind: ${proposal.kind}`,
    `\n${proposal.description}`,
    `\n### Specification:`,
    JSON.stringify(proposal.spec, null, 2),
    `\nProposed by: ${proposal.proposedBy}`,
    `\nPlease evaluate this proposal and cast your vote.`,
  ].join("\n");

  try {
    const req = buildProviderRequest(model, systemPrompt, [{ role: "user", content: userMessage }], 1024);
    const response = await fetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      return fallbackPosition(agent, "API request failed");
    }

    const data = await response.json();
    const text = parseProviderResponse(model, data);

    return parsePositionResponse(agent, text);
  } catch (err) {
    return fallbackPosition(agent, err instanceof Error ? err.message : "Unknown error");
  }
}

function parsePositionResponse(agent: Agent, text: string): MemberPosition {
  try {
    const cleaned = text.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "").trim();
    let json: any;
    try {
      json = JSON.parse(cleaned);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      json = match ? JSON.parse(match[0]) : null;
    }

    if (json) {
      return {
        agentId: agent.id,
        agentName: agent.name,
        vote: ["approve", "reject", "abstain"].includes(json.vote) ? json.vote : "abstain",
        reasoning: json.reasoning || "No reasoning provided",
        amendments: json.amendments || undefined,
      };
    }
  } catch { /* fall through */ }

  // Try to infer vote from natural language
  const lower = text.toLowerCase();
  let vote: "approve" | "reject" | "abstain" = "abstain";
  if (/\bapprove\b|\byes\b|\bagree\b|\bsupport\b/.test(lower)) vote = "approve";
  else if (/\breject\b|\bno\b|\bdisagree\b|\boppose\b/.test(lower)) vote = "reject";

  return {
    agentId: agent.id,
    agentName: agent.name,
    vote,
    reasoning: text.substring(0, 500),
  };
}

function fallbackPosition(agent: Agent, error: string): MemberPosition {
  return {
    agentId: agent.id,
    agentName: agent.name,
    vote: "abstain",
    reasoning: `[Deliberation error: ${error}]`,
  };
}

/**
 * Tally votes under a governance model.
 */
export function tallyVotes(
  positions: MemberPosition[],
  governance: string,
  threshold: number,
  totalMembers: number,
): ConsensusOutcome {
  const votesFor = positions.filter(p => p.vote === "approve").length;
  const votesAgainst = positions.filter(p => p.vote === "reject").length;
  const abstentions = positions.filter(p => p.vote === "abstain").length;

  let passed = false;
  let decision = "";

  switch (governance) {
    case "majority":
      passed = votesFor > totalMembers / 2;
      decision = passed
        ? `Approved by majority (${votesFor}/${totalMembers})`
        : `Rejected — insufficient majority (${votesFor}/${totalMembers})`;
      break;

    case "threshold":
      passed = votesFor >= threshold;
      decision = passed
        ? `Approved by threshold (${votesFor}/${threshold} required)`
        : `Rejected — below threshold (${votesFor}/${threshold} required)`;
      break;

    case "delegated": {
      // First voter is the delegate (lead)
      const lead = positions[0];
      passed = lead?.vote === "approve";
      decision = passed
        ? `Approved by delegate ${lead?.agentName}`
        : `Rejected by delegate ${lead?.agentName}`;
      break;
    }

    case "unanimous":
      passed = votesFor === totalMembers && votesAgainst === 0;
      decision = passed
        ? `Unanimously approved (${votesFor}/${totalMembers})`
        : `Not unanimous (${votesFor} for, ${votesAgainst} against, ${abstentions} abstained)`;
      break;

    default:
      passed = votesFor > votesAgainst;
      decision = `${passed ? "Approved" : "Rejected"} (${votesFor} for, ${votesAgainst} against)`;
  }

  // Collect amendment suggestions
  const allAmendments = positions.flatMap(p => p.amendments || []);
  const summary = [
    decision,
    allAmendments.length > 0 ? `\nSuggested amendments: ${allAmendments.join("; ")}` : "",
  ].filter(Boolean).join("");

  return { passed, decision, votesFor, votesAgainst, abstentions, summary };
}

/**
 * Create a new-agent proposal spec from identified capability gaps.
 */
export function buildAgentProposal(
  proposedBy: string,
  groupId: string,
  spec: AgentSpec,
): Omit<ConsensusProposal, "id" | "createdAt"> {
  return {
    kind: "create_agent",
    title: `Create new ${spec.role} agent: ${spec.name}`,
    description: spec.justification,
    proposedBy,
    groupId,
    spec,
    positions: [],
    executed: false,
  };
}

/**
 * Create a workflow proposal from a WorkflowSpec.
 */
export function buildWorkflowProposal(
  proposedBy: string,
  groupId: string,
  spec: WorkflowSpec,
): Omit<ConsensusProposal, "id" | "createdAt"> {
  return {
    kind: "create_workflow",
    title: `New workflow: ${spec.name}`,
    description: spec.description,
    proposedBy,
    groupId,
    spec,
    positions: [],
    executed: false,
  };
}

/**
 * Create an ecosystem change proposal.
 */
export function buildEcosystemProposal(
  proposedBy: string,
  groupId: string,
  spec: EcosystemChangeSpec,
): Omit<ConsensusProposal, "id" | "createdAt"> {
  return {
    kind: "ecosystem_change",
    title: `Ecosystem change: ${spec.changeType}`,
    description: spec.description,
    proposedBy,
    groupId,
    spec,
    positions: [],
    executed: false,
  };
}
