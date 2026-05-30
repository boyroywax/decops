import {
  evaluateBehaviorTraceTurn,
  type BehaviorScenario,
  type BehaviorScenarioKind,
  type BehaviorTraceTurn,
  type BehaviorTraceTurnEval,
} from "./behaviorEvalHarness";

export interface BehaviorTraceConversation {
  id?: string;
  title?: string;
  messages: BehaviorTraceTurn[];
}

export interface BehaviorTraceTurnScore {
  conversationId: string;
  conversationTitle?: string;
  turnIndex: number;
  scenario: BehaviorScenario;
  evaluation: BehaviorTraceTurnEval;
}

export interface BehaviorScenarioSummary {
  kind: BehaviorScenarioKind;
  total: number;
  passed: number;
  passRate: number;
  averageScore: number;
}

export interface BehaviorTraceBatchResult {
  totalAssistantTurns: number;
  scoredTurns: number;
  skippedTurns: number;
  passRate: number;
  averageScore: number;
  perScenario: Record<BehaviorScenarioKind, BehaviorScenarioSummary>;
  scored: BehaviorTraceTurnScore[];
}

const STEP_HINTS = ["step", "steps", "serial", "parallel", "fan-out", "fan-in"];
const RAG_COMMANDS = ["workspace_rag_status", "search_workspace_rag", "index_workspace_rag"];
const MUTATING_COMMANDS = ["queue_new_job", "create_job", "create_agent", "create_network", "create_group"];

function scenarioTemplate(kind: BehaviorScenarioKind): BehaviorScenario {
  return {
    id: `trace-${kind}`,
    kind,
    description: `Trace-evaluated ${kind}`,
  };
}

function includesAny(text: string, values: string[]): boolean {
  const lower = text.toLowerCase();
  return values.some((v) => lower.includes(v.toLowerCase()));
}

function hasCommand(commandNames: string[], commandId: string): boolean {
  return commandNames.some((name) => name.toLowerCase() === commandId.toLowerCase());
}

function countCommands(commandNames: string[], commandIds: string[]): number {
  const normalized = new Set(commandIds.map((id) => id.toLowerCase()));
  return commandNames.filter((name) => normalized.has(name.toLowerCase())).length;
}

function extractCommandNames(turn: BehaviorTraceTurn): string[] {
  return (turn.toolCalls || []).map((tc) => tc.name).filter(Boolean);
}

export function inferBehaviorScenarioKind(turn: BehaviorTraceTurn): BehaviorScenarioKind | null {
  const content = turn.content || "";
  const commandNames = extractCommandNames(turn);

  if (commandNames.some((name) => RAG_COMMANDS.includes(name.toLowerCase())) || includesAny(content, RAG_COMMANDS)) {
    return "historical-rag-query";
  }

  const hasQueue = hasCommand(commandNames, "queue_new_job") || includesAny(content, ["queue_new_job"]);
  const mutatingCount = countCommands(commandNames, MUTATING_COMMANDS);
  const hasStepHints = includesAny(content, STEP_HINTS);
  if (hasQueue || mutatingCount >= 2 || (mutatingCount >= 1 && hasStepHints)) {
    return "multi-step-workflow";
  }

  const hasCreateJob = hasCommand(commandNames, "create_job") || includesAny(content, ["create_job"]);
  if (hasCreateJob && !hasQueue) {
    return "atomic-read";
  }

  return null;
}

export function parseBehaviorTraceConversations(input: unknown): BehaviorTraceConversation[] {
  const root = input as { conversations?: unknown } | unknown[];
  const rawConversations = Array.isArray(root)
    ? root
    : Array.isArray((root as { conversations?: unknown })?.conversations)
      ? (root as { conversations: unknown[] }).conversations
      : null;

  if (!rawConversations) {
    throw new Error("Invalid trace payload. Expected an array of conversations or { conversations: [...] }.");
  }

  const conversations: BehaviorTraceConversation[] = [];
  for (const rawConversation of rawConversations) {
    if (!rawConversation || typeof rawConversation !== "object") continue;

    const maybeConversation = rawConversation as {
      id?: unknown;
      title?: unknown;
      messages?: unknown;
    };

    if (!Array.isArray(maybeConversation.messages)) continue;

    const messages = maybeConversation.messages
      .filter((msg): msg is BehaviorTraceTurn => !!msg && typeof msg === "object" && "content" in (msg as object))
      .map((msg) => {
        const obj = msg as {
          role?: unknown;
          content?: unknown;
          toolCalls?: unknown;
        };
        const role: BehaviorTraceTurn["role"] = obj.role === "user" || obj.role === "assistant"
          ? obj.role
          : undefined;
        return {
          role,
          content: typeof obj.content === "string" ? obj.content : "",
          toolCalls: Array.isArray(obj.toolCalls)
            ? obj.toolCalls
                .filter((tc): tc is { name?: unknown } => !!tc && typeof tc === "object")
                .map((tc) => ({ name: typeof tc.name === "string" ? tc.name : "" }))
                .filter((tc) => tc.name.length > 0)
            : undefined,
        };
      });

    conversations.push({
      id: typeof maybeConversation.id === "string" ? maybeConversation.id : undefined,
      title: typeof maybeConversation.title === "string" ? maybeConversation.title : undefined,
      messages,
    });
  }

  return conversations;
}

export function evaluateBehaviorTraceBatch(
  conversations: BehaviorTraceConversation[],
  threshold = 0.85,
): BehaviorTraceBatchResult {
  const scored: BehaviorTraceTurnScore[] = [];

  let totalAssistantTurns = 0;

  for (const conversation of conversations) {
    const conversationId = conversation.id || "unknown-conversation";

    conversation.messages.forEach((turn, turnIndex) => {
      if (turn.role === "user") return;
      totalAssistantTurns += 1;

      const scenarioKind = inferBehaviorScenarioKind(turn);
      if (!scenarioKind) return;

      const scenario = {
        ...scenarioTemplate(scenarioKind),
        id: `${conversationId}:${turnIndex}:${scenarioKind}`,
      };

      scored.push({
        conversationId,
        conversationTitle: conversation.title,
        turnIndex,
        scenario,
        evaluation: evaluateBehaviorTraceTurn(turn, scenario, threshold),
      });
    });
  }

  const scoredTurns = scored.length;
  const skippedTurns = Math.max(0, totalAssistantTurns - scoredTurns);
  const passedCount = scored.filter((item) => item.evaluation.result.passed).length;
  const totalScore = scored.reduce((sum, item) => sum + item.evaluation.result.score, 0);

  const kinds: BehaviorScenarioKind[] = ["multi-step-workflow", "historical-rag-query", "atomic-read"];
  const perScenario = Object.fromEntries(
    kinds.map((kind) => {
      const items = scored.filter((x) => x.scenario.kind === kind);
      const passed = items.filter((x) => x.evaluation.result.passed).length;
      const scoreSum = items.reduce((sum, item) => sum + item.evaluation.result.score, 0);
      const summary: BehaviorScenarioSummary = {
        kind,
        total: items.length,
        passed,
        passRate: items.length > 0 ? passed / items.length : 0,
        averageScore: items.length > 0 ? scoreSum / items.length : 0,
      };
      return [kind, summary];
    }),
  ) as Record<BehaviorScenarioKind, BehaviorScenarioSummary>;

  return {
    totalAssistantTurns,
    scoredTurns,
    skippedTurns,
    passRate: scoredTurns > 0 ? passedCount / scoredTurns : 0,
    averageScore: scoredTurns > 0 ? totalScore / scoredTurns : 0,
    perScenario,
    scored,
  };
}
