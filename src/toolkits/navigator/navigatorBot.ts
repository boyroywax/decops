/**
 * Navigator Bot — chat-delegation profile.
 *
 * Mirrors `orchestratorBot.ts`. Routes prompts about goals, sub-goals,
 * huddles, and cross-agent coordination to this specialised sub-agent.
 *
 * Side-effect import: registers itself with `registerChatDelegation()`
 * when this file is imported.
 */
import { navigatorService } from "./service";
import type {
  NavigatorBotStatus,
  NavigatorBotConfig,
  NavigatorBotRequest,
  NavigatorBotResponse,
  NavigatorBotOperation,
} from "./types";
import { DEFAULT_NAVIGATOR_BOT_CONFIG } from "./types";
import { getSelectedModel } from "@/services/ai/models";
import { getModelProvider } from "@/services/ai/providers";
import { runChatTurn } from "@/services/ai/runner";
import { getAllCommandTools } from "@/services/commands/tools";
import type { CommandContext } from "@/services/commands/types";
import { registerChatDelegation } from "@/services/ai/delegation";

// ── Module state ──

let botStatus: NavigatorBotStatus = "idle";
let botConfig: NavigatorBotConfig = { ...DEFAULT_NAVIGATOR_BOT_CONFIG };
const requestLog: NavigatorBotResponse[] = [];

export function getNavigatorBotStatus(): NavigatorBotStatus { return botStatus; }
export function getNavigatorBotConfig(): NavigatorBotConfig { return { ...botConfig }; }
export function updateNavigatorBotConfig(patch: Partial<NavigatorBotConfig>): void {
  botConfig = { ...botConfig, ...patch };
}
export function getNavigatorBotLog(): NavigatorBotResponse[] { return [...requestLog]; }

// ── Tool filter ──

const NAVIGATOR_COMMAND_IDS = new Set([
  "navigator_submit_prompt",
  "navigator_decompose_goal",
  "navigator_summon_huddle",
  "navigator_start_subgoal",
  "navigator_status",
  "navigator_cancel_goal",
  // Plus a handful of read-only helpers the bot needs to plan well.
  "list_groups",
  "list_messages",
]);

function getNavigatorTools() {
  return getAllCommandTools().filter((t) => NAVIGATOR_COMMAND_IDS.has(t.name));
}

// ── System prompt ──

function buildNavigatorBotSystemPrompt(): string {
  const snap = navigatorService.snapshot();
  const activeGoal = snap.activeGoalId
    ? snap.goals.find((g) => g.id === snap.activeGoalId)
    : undefined;

  const lines: string[] = [];
  lines.push("CURRENT NAVIGATOR STATE:");
  lines.push(`- Active goal: ${activeGoal ? `${activeGoal.title} (${activeGoal.id}, ${activeGoal.status})` : "(none)"}`);
  lines.push(`- Total goals: ${snap.goals.length}, huddles: ${snap.huddles.length}`);
  for (const g of snap.goals.slice(0, 5)) {
    lines.push(`  • ${g.title} [${g.id}] — ${g.status}, ${g.subgoals.length} sub-goal(s)`);
  }

  return `You are the **Navigator Bot**, a specialised sub-agent that turns user prompts into multi-agent goals and routes the work across the ecosystem.

YOUR ROLE:
The main AI assistant delegates to you whenever the user wants something *accomplished* across multiple agents, networks, or huddles — anything that needs planning, sub-goal decomposition, consultation, or cross-network coordination. You do NOT execute work directly. You PLAN it, ROUTE it, and let agents + the jobs subsystem do the work.

THE GOAL LIFECYCLE:
  prompt → goal (draft)
        → sub-goals (planning)
        → assignments (agent direct or huddle consultation)
        → execution (existing jobs subsystem)
        → synthesis → completed

COMMUNICATION:
All inter-agent traffic is wrapped in DIDComm v2 envelopes (thid/pthid threading, X25519 key agreement, Ed25519 signatures). The navigator mints the parent thread id (thid) at goal creation. Huddles inherit it as pthid and mint their own thid. You don't pack envelopes yourself — the runtime does — but you MUST preserve threading by passing the correct goalId / huddleId when calling tools.

CAPABILITIES YOU CONTROL:
═════════════════════════
**Goal management**
- navigator_submit_prompt({ prompt, title? }) — capture a prompt as a Goal. Returns goalId.
- navigator_decompose_goal({ goalId, subgoals: [{ title, instruction, assignedAgentId?, huddleId?, order? }] }) — break the goal into sub-goals. Use \`assignedAgentId\` for direct work, \`huddleId\` for consultation.
- navigator_start_subgoal({ goalId, subgoalId }) — dispatch work for a single sub-goal (queues a send_message job for direct assignments or a broadcast_message job for huddle assignments). Use this once a sub-goal has an assignee and the user has approved execution.
- navigator_cancel_goal({ goalId }) — cancel an in-flight goal.
- navigator_status({ goalId? }) — inspect goals + huddles.

**Huddles (ad-hoc cross-network assemblies)**
- navigator_summon_huddle({ goalId, subgoalId, name, memberAgentIds, topic?, governance? }) — summon members from ANY networks into a new persistent Group (kind="huddle"). The huddle shows up in the groups list and persists for reuse. Use this when a sub-goal needs consensus, multi-perspective input, or coordination across organizational boundaries.

**Inspection**
- list_groups, list_messages — read-only context.

OPERATING RULES:
════════════════
1. Always start by calling navigator_submit_prompt to record the user's request as a Goal — even if you immediately decompose it. The goalId is the anchor for everything that follows.
2. Decompose conservatively: prefer one sub-goal per *distinct* outcome. Don't fan-out unless the work is genuinely independent.
3. ${botConfig.autoSummonHuddles ? "You MAY summon huddles autonomously when consultation is clearly needed." : "Do NOT summon huddles without explicit user approval."}.
4. Pick huddle members deliberately: 2-6 agents drawn from the networks that contain the relevant expertise. Always prefer the smallest huddle that can plausibly decide.
5. Cross-network membership is the *point* of a huddle. If all members would come from one network, use a normal group instead (delegate to the user to create it).
6. ${botConfig.autoQueueJobs ? "When a sub-goal is assigned to an agent, expect the runtime to queue jobs automatically — your job is just the routing." : "Sub-goal execution is NOT auto-queued; surface the plan and let the user trigger work."}.
7. NEVER call libp2p_*, helia_*, orbitdb_*, kubo_*, or orchestrator_* tools directly. Those belong to other sub-agents.
8. When reporting back, ALWAYS state: the goal title + id, the sub-goal count, and (for huddles) the member count and contributing networks.

${lines.join("\n")}

OUTPUT STYLE:
- Be brief. 1-3 sentences confirming what was captured + planned.
- Quote the goalId so the user can refer back.
- For huddles, name the contributing networks ("members drawn from net-A, net-B").
- If a step failed, surface the error verbatim and suggest one remedy.`;
}

// ── Main delegation entrypoint ──

export async function handleNavigatorBotRequest(
  request: NavigatorBotRequest,
  commandContext: CommandContext,
): Promise<NavigatorBotResponse> {
  const startTime = Date.now();
  botStatus = "planning";
  const operations: NavigatorBotOperation[] = [];
  const suggestions: string[] = [];

  try {
    const model = getSelectedModel();
    const provider = getModelProvider(model);
    const systemPrompt = buildNavigatorBotSystemPrompt();
    const tools = (provider === "anthropic" || provider === "openai") ? getNavigatorTools() : [];

    botStatus = "executing";

    const result = await runChatTurn(
      {
        model,
        systemPrompt,
        messages: [{ role: "user", content: request.instruction }],
        tools: tools.length > 0 ? tools : undefined,
        commandContext,
        maxRounds: botConfig.maxRounds,
      },
      {
        onToolCallStart: (name, input) => {
          operations.push({
            command: name,
            args: input,
            description: `Execute ${name}`,
            order: operations.length,
            status: "executing",
          });
        },
        onToolCallComplete: (display) => {
          for (let i = operations.length - 1; i >= 0; i--) {
            if (operations[i].command === display.name && operations[i].status === "executing") {
              operations[i].status = display.error ? "failed" : "completed";
              operations[i].result = display.result;
              operations[i].error = display.error;
              break;
            }
          }
        },
      },
    );
    const finalText = result.text;

    botStatus = "reviewing";
    const post = navigatorService.snapshot();
    const active = post.activeGoalId ? post.goals.find((g) => g.id === post.activeGoalId) : undefined;
    if (active) {
      if (active.status === "draft" && active.subgoals.length === 0) {
        suggestions.push("Goal captured but not decomposed — call navigator_decompose_goal next.");
      } else if (active.status === "blocked") {
        suggestions.push("Goal is blocked — surface the blocker to the user.");
      } else if (active.status === "failed" && active.error) {
        suggestions.push(`Last error: ${active.error}`);
      }
    }

    botStatus = "idle";
    const response: NavigatorBotResponse = {
      requestId: request.id,
      summary: finalText || `Completed ${operations.length} navigator operation(s)`,
      operations,
      suggestions,
      success: true,
      duration_ms: Date.now() - startTime,
    };
    requestLog.push(response);
    return response;
  } catch (err) {
    botStatus = "error";
    const msg = err instanceof Error ? err.message : String(err);
    const response: NavigatorBotResponse = {
      requestId: request.id,
      summary: `Navigator Bot error: ${msg}`,
      operations,
      suggestions,
      success: false,
      error: msg,
      duration_ms: Date.now() - startTime,
    };
    requestLog.push(response);
    setTimeout(() => { botStatus = "idle"; }, 2000);
    return response;
  }
}

// ── Delegation matcher ──

export function shouldDelegateToNavigatorBot(message: string): boolean {
  const m = message.toLowerCase();
  const patterns: RegExp[] = [
    /\bnavigator\b/,
    /\bgoal(s)?\b/,
    /\bsub-?goal(s)?\b/,
    /\bplan\s+(out|across|for)\b/,
    /\bdecompose\b/,
    /\bhuddle\b/,
    /\bconsult\s+(a\s+)?(group|huddle|panel)\b/,
    /\bsummon\s+(a\s+)?(group|huddle|panel|assembly)\b/,
    /\bcross[- ]network\b/,
    /\bcoordinate\s+(across|between)\s+(agents|networks)\b/,
    /\baccomplish\s+/,
    /\bbreak\s+down\s+(this|the)\s+(task|goal|prompt)\b/,
  ];
  return patterns.some((p) => p.test(m));
}

// ── Self-registration ──

registerChatDelegation({
  id: "navigator-bot",
  check: shouldDelegateToNavigatorBot,
  enhance: (systemPrompt) => systemPrompt + "\n\n" + buildNavigatorBotSystemPrompt(),
  maxRounds: 15,
});
