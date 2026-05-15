/**
 * Task planner — uses AI to analyze a goal, assess agent capabilities,
 * and produce an ordered action plan or delegation recommendation.
 *
 * The planner is aware of both:
 *   - Individual commands (atomic units of work)
 *   - Saved job definitions (multi-step pipelines)
 *
 * It can produce PlannedActions of type "command" or "job" so the task
 * engine can dispatch appropriately.
 */

import type { Agent } from "@/types";
import type {
  TaskPlan,
  PlannedAction,
  DelegationTarget,
  AgentCapability,
} from "@/types/autonomy";
import type { JobDefinition } from "@/types/jobs";
import { registry } from "@/services/commands/registry";
import { getCommandIdsForAgent } from "@/services/commands/tools";
import { getAgentModel } from "@/services/ai/models";
import { getModelProvider, buildProviderRequest, parseProviderResponse } from "@/services/ai/providers";
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
 * - gaps: identified capability shortcomings
 */
export async function generatePlan(
  agent: Agent,
  goal: string,
  constraints: string[],
  peerAgents: Agent[],
  storageSnapshot: Record<string, unknown>,
  modelOverride?: string,
  jobCatalog?: JobDefinition[],
): Promise<TaskPlan> {
  const model = modelOverride || getAgentModel(agent.id, agent.recommendedModel);
  const cap = assessAgent(agent);

  // Build command catalog for the agent (only commands it can execute)
  const allCommands = registry.getAll();
  const toolkitCommandIds = getCommandIdsForAgent(agent);
  const availableCommands = allCommands
    .filter(cmd =>
      cmd.rbac.includes(agent.role) &&
      !cmd.hidden &&
      // If agent has toolkit bindings, restrict to toolkit-scoped commands
      (!toolkitCommandIds || toolkitCommandIds.has(cmd.id)),
    )
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
        enabledToolkits: peerCap.enabledToolkits || [],
        prompt_excerpt: a.prompt ? a.prompt.substring(0, 200) : undefined,
      };
    });

  // Current storage state (abbreviated)
  const storageKeys = Object.keys(storageSnapshot).filter(k => !k.startsWith("_"));

  const systemPrompt = buildPlannerSystemPrompt(agent, cap, availableCommands, peers, storageKeys, jobCatalog || []);
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

interface PlannerCommandArg {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  enum?: readonly string[] | string[];
  default?: unknown;
}

interface PlannerCommandSummary {
  id: string;
  description: string;
  args: PlannerCommandArg[];
  tags: string[];
}

interface PlannerPeerSummary {
  id: string;
  name: string;
  role: string;
  title?: string;
  skills: string[];
  enabledToolkits: string[];
  prompt_excerpt?: string;
}

function buildPlannerSystemPrompt(
  agent: Agent,
  cap: AgentCapability,
  commands: PlannerCommandSummary[],
  peers: PlannerPeerSummary[],
  storageKeys: string[],
  jobCatalog: JobDefinition[],
): string {
  return [
    `You are "${agent.name}", a ${cap.role} agent in an autonomous decentralized mesh workspace.`,
    agent.prompt ? `\nYour core directive:\n${agent.prompt}` : "",
    `\nYou are being asked to PLAN how to accomplish a task. You must analyze the goal and produce a structured plan.`,
    `\n## Your capabilities`,
    `Role: ${cap.role}`,
    `Skills: ${cap.skills.length > 0 ? cap.skills.join(", ") : "general"}`,
    cap.enabledToolkits && cap.enabledToolkits.length > 0
      ? `Enabled toolkits: ${cap.enabledToolkits.join(", ")} (you can only use commands from these toolkits)`
      : `Toolkits: unrestricted (all RBAC-permitted commands available)`,
    `\n## Available commands (${commands.length}):`,
    commands.map(c => `- **${c.id}**: ${c.description}\n  Args: ${c.args.map(a => `${a.name}(${a.type}${a.required ? "*" : ""})`).join(", ")}`).join("\n"),
    jobCatalog.length > 0 ? [
      `\n## Available job pipelines (${jobCatalog.length}):`,
      `Jobs are multi-step pipelines made of commands. You can reference these by ID instead of listing individual commands.`,
      jobCatalog.map(j => `- **${j.id}**: "${j.name}" — ${j.description} (${j.steps.length} steps, ${j.mode} mode)`).join("\n"),
    ].join("\n") : "",
    peers.length > 0 ? [
      `\n## Peer agents you can delegate to (${peers.length}):`,
      peers.map(p => {
        let desc = `- **${p.name}** (${p.role}${p.title ? `, ${p.title}` : ""}): ${p.skills.length > 0 ? p.skills.join(", ") : "general purpose"}`;
        if (p.enabledToolkits && p.enabledToolkits.length > 0) {
          desc += ` [toolkits: ${p.enabledToolkits.join(", ")}]`;
        }
        if (p.prompt_excerpt) desc += ` — "${p.prompt_excerpt}"`;
        return desc;
      }).join("\n"),
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
    `      "type": "command",`,
    `      "commandId": "command_id_here",`,
    `      "args": { "argName": "value" },`,
    `      "reasoning": "Why this action"`,
    `    },`,
    `    {`,
    `      "order": 2,`,
    `      "type": "job",`,
    `      "commandId": "",`,
    `      "jobDefinitionId": "job-pipeline-id",`,
    `      "jobInputs": { "inputName": "entityId" },`,
    `      "args": {},`,
    `      "reasoning": "Why this job pipeline"`,
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
    `1. If you can accomplish the goal using your available commands or jobs, set canSelfComplete=true and list the actions.`,
    `2. Use type="command" for individual commands and type="job" for multi-step job pipelines from the catalog.`,
    `3. Use $storage.keyName references to pass data between steps.`,
    `4. If you cannot complete the task, set canSelfComplete=false and specify a delegationTarget (pick the most relevant peer).`,
    `5. If no peer is suitable either, set delegationTarget.type to "group" or "network" to escalate.`,
    `6. Always explain your reasoning. Be concise but thorough.`,
    `7. Order actions by dependency — earlier steps should produce data that later steps consume.`,
    `8. Mark optional/best-effort actions with "optional": true.`,
    `9. Prefer using existing job pipelines over composing individual commands when a suitable pipeline exists.`,
    `10. When delegating, prefer peers whose enabled toolkits include the commands needed for the task. If no peer has the right toolkits, note this as a gap.`,
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
  let json: Record<string, unknown>;
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
  const rawActions = (json.actions as Array<Record<string, unknown>> | undefined) || [];
  const actions: PlannedAction[] = rawActions.map((a, i) => ({
    order: (a.order as number | undefined) ?? i + 1,
    type: (a.type as PlannedAction["type"]) || "command",
    commandId: (a.commandId as string) || (a.command_id as string) || "",
    args: (a.args as Record<string, unknown>) || {},
    reasoning: (a.reasoning as string) || "",
    optional: (a.optional as boolean) || false,
    jobDefinitionId: (a.jobDefinitionId as string) || (a.job_definition_id as string) || undefined,
    jobDefinition: (a.jobDefinition as PlannedAction["jobDefinition"]) || undefined,
    jobInputs: (a.jobInputs as Record<string, string>) || (a.job_inputs as Record<string, string>) || undefined,
  }));

  // Parse delegation target
  let delegationTarget: DelegationTarget | undefined;
  const rawDt = (json.delegationTarget || json.delegation_target) as Record<string, unknown> | undefined;
  if (rawDt) {
    delegationTarget = {
      type: (rawDt.type as DelegationTarget["type"]) || "agent",
      targetId: (rawDt.targetId as string) || (rawDt.target_id as string) || "",
      reasoning: (rawDt.reasoning as string) || "",
    };
  }

  return {
    analysis: (json.analysis as string) || "",
    canSelfComplete: (json.canSelfComplete as boolean) ?? (json.can_self_complete as boolean) ?? false,
    actions,
    delegationTarget,
    gaps: (json.gaps as string[]) || [],
  };
}
