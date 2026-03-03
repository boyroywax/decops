/**
 * Task planner — uses AI to analyze a goal, assess agent capabilities,
 * and produce an ordered action plan or delegation recommendation.
 */

import type { Agent } from "../../types";
import type {
  TaskPlan,
  PlannedAction,
  DelegationTarget,
  AgentCapability,
} from "../../types/autonomy";
import { registry } from "../commands/registry";
import { getAgentModel } from "../ai/models";
import { getModelProvider, buildProviderRequest, parseProviderResponse } from "../ai/providers";
import { assessAgent, rankAgentsForGoal } from "./capability";

/**
 * Ask the assigned agent to analyze the goal and produce a TaskPlan.
 *
 * The AI is given:
 * - The agent's own identity, role, and directive
 * - The list of commands it can execute (with argument schemas)
 * - A roster of peer agents it could delegate to
 * - The goal + constraints
 *
 * It returns a structured TaskPlan with:
 * - analysis: understanding of the goal
 * - canSelfComplete: whether it can handle this alone
 * - actions: ordered list of commands to execute
 * - delegationTarget: if it can't self-complete, who to delegate to
 * - gaps: any identified capability shortcomings
 */
export async function generatePlan(
  agent: Agent,
  goal: string,
  constraints: string[],
  peerAgents: Agent[],
  storageSnapshot: Record<string, any>,
  modelOverride?: string,
): Promise<TaskPlan> {
  const model = modelOverride || getAgentModel(agent.id, agent.recommendedModel);
  const cap = assessAgent(agent);

  // Build command catalog for the agent (only commands it can execute)
  const allCommands = registry.getAll();
  const availableCommands = allCommands
    .filter(cmd => cmd.rbac.includes(agent.role as any) && !cmd.hidden)
    .map(cmd => ({
      id: cmd.id,
      description: cmd.description,
      args: Object.entries(cmd.args).map(([name, arg]) => ({
        name,
        type: arg.type,
        required: arg.required !== false,
        description: arg.description,
        ...(arg.enum ? { enum: arg.enum } : {}),
        ...(arg.defaultValue !== undefined ? { default: arg.defaultValue } : {}),
      })),
      tags: cmd.tags,
    }));

  // Build peer roster
  const peers = peerAgents
    .filter(a => a.id !== agent.id)
    .map(a => {
      const peerCap = assessAgent(a);
      return {
        id: a.id,
        name: a.name,
        role: peerCap.role,
        title: a.title || undefined,
        skills: peerCap.skills,
        prompt_excerpt: a.prompt ? a.prompt.substring(0, 200) : undefined,
      };
    });

  // Current storage state (abbreviated)
  const storageKeys = Object.keys(storageSnapshot).filter(k => !k.startsWith("_"));

  const systemPrompt = buildPlannerSystemPrompt(agent, cap, availableCommands, peers, storageKeys);
  const userMessage = buildPlannerUserMessage(goal, constraints);

  const messages = [{ role: "user" as const, content: userMessage }];

  try {
    const req = buildProviderRequest(model, systemPrompt, messages, 4096);
    const response = await fetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error?.message || `Planning API request failed (${response.status})`);
    }

    const data = await response.json();
    const text = parseProviderResponse(model, data);

    return parsePlanResponse(text, peerAgents);
  } catch (err) {
    // Fallback: return a minimal plan that acknowledges failure
    return {
      analysis: `Planning failed: ${err instanceof Error ? err.message : String(err)}`,
      canSelfComplete: false,
      actions: [],
      gaps: ["Planning system unavailable — manual intervention required"],
    };
  }
}

// ── System prompt ──────────────────────────────────

function buildPlannerSystemPrompt(
  agent: Agent,
  cap: AgentCapability,
  commands: any[],
  peers: any[],
  storageKeys: string[],
): string {
  return [
    `You are "${agent.name}", a ${cap.role} agent in an autonomous decentralized mesh workspace.`,
    agent.prompt ? `\nYour core directive:\n${agent.prompt}` : "",
    `\nYou are being asked to PLAN how to accomplish a task. You must analyze the goal and produce a structured plan.`,
    `\n## Your capabilities`,
    `Role: ${cap.role}`,
    `Skills: ${cap.skills.length > 0 ? cap.skills.join(", ") : "general"}`,
    `\n## Available commands (${commands.length}):`,
    commands.map(c => `- **${c.id}**: ${c.description}\n  Args: ${c.args.map((a: any) => `${a.name}(${a.type}${a.required ? "*" : ""})`).join(", ")}`).join("\n"),
    peers.length > 0 ? [
      `\n## Peer agents you can delegate to (${peers.length}):`,
      peers.map(p => `- **${p.name}** (${p.role}${p.title ? `, ${p.title}` : ""}): ${p.skills.length > 0 ? p.skills.join(", ") : "general purpose"}${p.prompt_excerpt ? ` — "${p.prompt_excerpt}"` : ""}`).join("\n"),
    ].join("\n") : "",
    storageKeys.length > 0 ? `\n## Shared storage keys available: ${storageKeys.join(", ")}` : "",
    `\n## Response format`,
    `Respond with a JSON object (no markdown fences) matching this schema:`,
    `{`,
    `  "analysis": "Your understanding of the goal and what's needed",`,
    `  "canSelfComplete": true/false,`,
    `  "actions": [`,
    `    {`,
    `      "order": 1,`,
    `      "commandId": "command_id_here",`,
    `      "args": { "argName": "value" },`,
    `      "reasoning": "Why this action"`,
    `    }`,
    `  ],`,
    `  "delegationTarget": {  // only if canSelfComplete is false`,
    `    "type": "agent",`,
    `    "targetId": "agent-uuid-or-name",`,
    `    "reasoning": "Why delegate to this entity"`,
    `  },`,
    `  "gaps": ["Any capability shortcomings identified"]`,
    `}`,
    `\n## Rules`,
    `1. If you can accomplish the goal using your available commands, set canSelfComplete=true and list the actions.`,
    `2. Use $storage.keyName references to pass data between steps.`,
    `3. If you cannot complete the task, set canSelfComplete=false and specify a delegationTarget (pick the most relevant peer).`,
    `4. If no peer is suitable either, set delegationTarget.type to "group" or "network" to escalate.`,
    `5. Always explain your reasoning. Be concise but thorough.`,
    `6. Order actions by dependency — earlier steps should produce data that later steps consume.`,
    `7. Mark optional/best-effort actions with "optional": true.`,
  ].filter(Boolean).join("\n");
}

function buildPlannerUserMessage(goal: string, constraints: string[]): string {
  let msg = `## Task\n${goal}`;
  if (constraints.length > 0) {
    msg += `\n\n## Constraints\n${constraints.map((c, i) => `${i + 1}. ${c}`).join("\n")}`;
  }
  return msg;
}

// ── Response parser ────────────────────────────────

function parsePlanResponse(text: string, peerAgents: Agent[]): TaskPlan {
  // Try to extract JSON from the response
  let json: any;
  try {
    // Strip markdown code fences if present
    const cleaned = text.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "").trim();
    json = JSON.parse(cleaned);
  } catch {
    // Try to find JSON object in the text
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        json = JSON.parse(match[0]);
      } catch {
        // Give up on JSON parsing
        return {
          analysis: text,
          canSelfComplete: false,
          actions: [],
          gaps: ["Could not parse planning response as structured plan"],
        };
      }
    } else {
      return {
        analysis: text,
        canSelfComplete: false,
        actions: [],
        gaps: ["Planning response was not structured JSON"],
      };
    }
  }

  // Parse actions
  const actions: PlannedAction[] = (json.actions || []).map((a: any, i: number) => ({
    order: a.order ?? i + 1,
    commandId: a.commandId || a.command_id || "",
    args: a.args || {},
    reasoning: a.reasoning || "",
    optional: a.optional || false,
  }));

  // Parse delegation target
  let delegationTarget: DelegationTarget | undefined;
  if (json.delegationTarget || json.delegation_target) {
    const dt = json.delegationTarget || json.delegation_target;
    delegationTarget = {
      type: dt.type || "agent",
      targetId: dt.targetId || dt.target_id || "",
      reasoning: dt.reasoning || "",
    };
  }

  return {
    analysis: json.analysis || "",
    canSelfComplete: json.canSelfComplete ?? json.can_self_complete ?? false,
    actions,
    delegationTarget,
    gaps: json.gaps || [],
  };
}
