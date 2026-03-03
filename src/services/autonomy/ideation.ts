/**
 * Ecosystem ideation planner — AI-powered group ideation sessions where
 * agents collectively brainstorm and propose ecosystem-level improvements.
 *
 * This goes beyond individual task delegation: a group analyzes the workspace
 * holistically and proposes structural changes:
 *  - New agents to fill capability gaps
 *  - New workflows/jobs to automate common patterns
 *  - Network restructuring (new networks, bridges, channel reconfiguration)
 *  - Cross-network collaboration strategies
 */

import type { Agent, Network } from "../../types";
import type {
  ConsensusProposal,
  AgentSpec,
  WorkflowSpec,
  EcosystemChangeSpec,
  ProposalKind,
} from "../../types/autonomy";

import { getGroupModel } from "../ai/models";
import { buildProviderRequest, parseProviderResponse } from "../ai/providers";
import { assessAgent } from "./capability";
import { deliberate } from "./consensus";

export interface IdeationRequest {
  /** The topic or challenge to ideate on */
  topic: string;
  /** Group performing the ideation */
  groupId: string;
  /** Optional focus areas */
  focus?: ("agents" | "workflows" | "networks" | "channels" | "bridges")[];
  /** Max proposals to generate */
  maxProposals?: number;
}

export interface IdeationResult {
  topic: string;
  groupId: string;
  groupName: string;
  /** Generated proposals (with deliberation outcomes) */
  proposals: ConsensusProposal[];
  /** Ecosystem-wide observations */
  observations: string[];
  /** Summary of ideation session */
  summary: string;
}

/**
 * Run a full ideation session.
 *
 * 1. An orchestrator agent analyzes the workspace and generates proposals
 * 2. Each proposal is deliberated by the group
 * 3. Approved proposals can be auto-executed or stored for human review
 */
export async function runIdeationSession(
  request: IdeationRequest,
  agents: Agent[],
  groups: any[],
  networks: Network[],
  ecosystem: any,
  modelId?: string,
): Promise<IdeationResult> {
  const group = groups.find((g: any) => g.id === request.groupId);
  if (!group) throw new Error(`Group "${request.groupId}" not found`);

  const model = modelId || getGroupModel(request.groupId, group.modelId);

  // Resolve member agents
  const memberAgents = group.members
    .map((mid: string) => agents.find((a: Agent) => a.id === mid))
    .filter(Boolean) as Agent[];

  if (memberAgents.length === 0) throw new Error("Group has no resolvable members");

  // Pick the best orchestrator/leader from the group (or first member)
  const orchestrator = memberAgents.find(a => a.role === "orchestrator") || memberAgents[0];

  // ── Step 1: Generate proposals via AI ──
  const rawProposals = await generateIdeationProposals(
    orchestrator,
    request,
    agents,
    groups,
    networks,
    ecosystem,
    model,
    request.maxProposals || 5,
  );

  // ── Step 2: Deliberate each proposal ──
  const deliberatedProposals: ConsensusProposal[] = [];
  for (const raw of rawProposals) {
    const proposal: ConsensusProposal = {
      ...raw,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };

    if (memberAgents.length >= 2) {
      const result = await deliberate(
        proposal,
        memberAgents,
        group.governance,
        group.threshold,
        group.modelId,
      );
      deliberatedProposals.push(result);
    } else {
      // Single-member groups auto-approve
      deliberatedProposals.push({
        ...proposal,
        positions: [{
          agentId: orchestrator.id,
          agentName: orchestrator.name,
          vote: "approve",
          reasoning: "Single-member group — auto-approved",
        }],
        outcome: {
          passed: true,
          decision: "Auto-approved (single member)",
          votesFor: 1,
          votesAgainst: 0,
          abstentions: 0,
          summary: "Auto-approved by single group member",
        },
      });
    }
  }

  const approved = deliberatedProposals.filter(p => p.outcome?.passed);
  const rejected = deliberatedProposals.filter(p => !p.outcome?.passed);

  return {
    topic: request.topic,
    groupId: request.groupId,
    groupName: group.name,
    proposals: deliberatedProposals,
    observations: rawProposals.length > 0
      ? [`Generated ${rawProposals.length} proposals`, `${approved.length} approved, ${rejected.length} rejected`]
      : ["No proposals generated — the workspace may already be well-structured"],
    summary: buildSummary(request.topic, group.name, deliberatedProposals),
  };
}

// ── Proposal generation ────────────────────────────

async function generateIdeationProposals(
  orchestrator: Agent,
  request: IdeationRequest,
  agents: Agent[],
  groups: any[],
  networks: Network[],
  ecosystem: any,
  model: string,
  maxProposals: number,
): Promise<Omit<ConsensusProposal, "id" | "createdAt">[]> {
  const systemPrompt = buildIdeationSystemPrompt(orchestrator, agents, groups, networks, ecosystem, request.focus);
  const userMessage = buildIdeationUserMessage(request, maxProposals);

  try {
    const req = buildProviderRequest(model, systemPrompt, [{ role: "user", content: userMessage }], 4096);
    const response = await fetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(req.body),
    });

    if (!response.ok) return [];

    const data = await response.json();
    const text = parseProviderResponse(model, data);
    return parseIdeationResponse(text, orchestrator.id, request.groupId);
  } catch {
    return [];
  }
}

function buildIdeationSystemPrompt(
  orchestrator: Agent,
  agents: Agent[],
  groups: any[],
  networks: Network[],
  ecosystem: any,
  focus?: string[],
): string {
  // Build workspace snapshot
  const agentSummaries = agents.map(a => {
    const cap = assessAgent(a);
    return `- ${a.name} (${cap.role}): ${cap.skills.join(", ") || "general"} [${cap.allowedCommands.length} commands]`;
  });

  const groupSummaries = groups.map((g: any) =>
    `- ${g.name} (${g.governance}): ${g.members?.length || 0} members`,
  );

  const networkSummaries = networks.map(n =>
    `- ${n.name}: ${n.agents?.length || 0} agents, ${n.channels?.length || 0} channels`,
  );

  return [
    `You are "${orchestrator.name}", serving as the lead ideation facilitator for your group.`,
    orchestrator.prompt ? `\nYour directive:\n${orchestrator.prompt}` : "",
    `\n## Current Workspace State`,
    `\n### Agents (${agents.length}):`,
    agentSummaries.join("\n"),
    `\n### Groups (${groups.length}):`,
    groupSummaries.join("\n"),
    `\n### Networks (${networks.length}):`,
    networkSummaries.join("\n"),
    focus ? `\n## Focus areas: ${focus.join(", ")}` : "",
    `\n## Response format`,
    `Respond with a JSON array of proposal objects (no markdown fences):`,
    `[`,
    `  {`,
    `    "kind": "create_agent" | "create_workflow" | "ecosystem_change" | "task_strategy",`,
    `    "title": "Short proposal title",`,
    `    "description": "Detailed description of the proposal",`,
    `    "spec": { ... }  // see below for spec schemas`,
    `  }`,
    `]`,
    `\n## Spec schemas by kind:`,
    `### create_agent:`,
    `{ "name": "...", "role": "researcher|builder|curator|validator|orchestrator", "prompt": "...", "title": "...", "capabilities": ["..."], "justification": "..." }`,
    `### create_workflow:`,
    `{ "name": "...", "description": "...", "steps": [{"commandId": "...", "args": {...}, "reasoning": "..."}], "deliverables": ["..."] }`,
    `### ecosystem_change:`,
    `{ "changeType": "add_network|add_bridge|restructure_group|add_channel|custom", "description": "...", "entities": {...}, "justification": "..." }`,
    `\n## Guidelines`,
    `1. Analyze the workspace for gaps, inefficiencies, or missing capabilities`,
    `2. Propose concrete, actionable improvements`,
    `3. Each proposal should address a specific need`,
    `4. Consider cross-network collaboration opportunities`,
    `5. Propose new agents only when existing agents can't cover the need`,
  ].filter(Boolean).join("\n");
}

function buildIdeationUserMessage(request: IdeationRequest, maxProposals: number): string {
  return [
    `## Ideation Topic`,
    request.topic,
    `\nGenerate up to ${maxProposals} concrete proposals. Analyze the workspace state and identify improvements.`,
    request.focus ? `\nFocus on: ${request.focus.join(", ")}` : "",
  ].filter(Boolean).join("\n");
}

function parseIdeationResponse(
  text: string,
  proposedBy: string,
  groupId: string,
): Omit<ConsensusProposal, "id" | "createdAt">[] {
  try {
    const cleaned = text.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "").trim();
    let json: any;
    try {
      json = JSON.parse(cleaned);
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      json = match ? JSON.parse(match[0]) : null;
    }

    if (!Array.isArray(json)) return [];

    return json.map((item: any) => ({
      kind: item.kind || "custom",
      title: item.title || "Untitled proposal",
      description: item.description || "",
      proposedBy,
      groupId,
      spec: item.spec || {},
      positions: [],
      executed: false,
    }));
  } catch {
    return [];
  }
}

function buildSummary(topic: string, groupName: string, proposals: ConsensusProposal[]): string {
  const approved = proposals.filter(p => p.outcome?.passed);
  const rejected = proposals.filter(p => !p.outcome?.passed);

  const lines = [
    `Ideation session for "${topic}" by group "${groupName}"`,
    `${proposals.length} proposals generated`,
  ];

  if (approved.length > 0) {
    lines.push(`✅ Approved (${approved.length}):`);
    for (const p of approved) {
      lines.push(`  - ${p.title} (${p.kind})`);
    }
  }

  if (rejected.length > 0) {
    lines.push(`❌ Rejected (${rejected.length}):`);
    for (const p of rejected) {
      lines.push(`  - ${p.title}: ${p.outcome?.decision || "no decision"}`);
    }
  }

  return lines.join("\n");
}
