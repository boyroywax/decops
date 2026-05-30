export type BehaviorScenarioKind =
  | "multi-step-workflow"
  | "historical-rag-query"
  | "atomic-read";

export interface BehaviorScenario {
  id: string;
  kind: BehaviorScenarioKind;
  description: string;
}

export interface BehaviorCriterion {
  id: string;
  passed: boolean;
  weight: number;
  detail?: string;
}

export interface BehaviorEvalResult {
  score: number;
  passed: boolean;
  threshold: number;
  criteria: BehaviorCriterion[];
}

export interface BehaviorTraceToolCall {
  name: string;
}

export interface BehaviorTraceTurn {
  role?: "user" | "assistant";
  content: string;
  toolCalls?: BehaviorTraceToolCall[];
}

export interface BehaviorTraceTurnEval {
  commandSequence: string[];
  normalizedOutput: string;
  result: BehaviorEvalResult;
}

function getCommandIndex(commandSequence: string[], output: string, commandId: string): number {
  const commandIndex = commandSequence.findIndex((name) => name.toLowerCase() === commandId.toLowerCase());
  if (commandIndex >= 0) return commandIndex;
  return findCommandIndex(output, commandId);
}

function findCommandIndex(output: string, commandId: string): number {
  const lower = output.toLowerCase();
  return lower.indexOf(commandId.toLowerCase());
}

function includesAny(output: string, values: string[]): boolean {
  const lower = output.toLowerCase();
  return values.some((v) => lower.includes(v.toLowerCase()));
}

function evaluateMultiStepWorkflow(output: string, commandSequence: string[]): BehaviorCriterion[] {
  const hasQueueNewJob = getCommandIndex(commandSequence, output, "queue_new_job") >= 0;
  const hasCreateJob = getCommandIndex(commandSequence, output, "create_job") >= 0;
  const mentionsSteps = includesAny(output, ["steps", "serial", "parallel", "fan-out", "fan-in"]);

  return [
    {
      id: "uses-queue-new-job",
      passed: hasQueueNewJob,
      weight: 4,
      detail: "Multi-step workflows should prefer queue_new_job.",
    },
    {
      id: "describes-step-structure",
      passed: mentionsSteps,
      weight: 3,
      detail: "Plan should mention step structure (steps/serial/parallel).",
    },
    {
      id: "does-not-use-create-job-only",
      passed: hasQueueNewJob || !hasCreateJob,
      weight: 2,
      detail: "Using create_job alone for multi-step workflow is discouraged.",
    },
  ];
}

function evaluateHistoricalRagQuery(output: string, commandSequence: string[]): BehaviorCriterion[] {
  const ragStatusIdx = getCommandIndex(commandSequence, output, "workspace_rag_status");
  const ragSearchIdx = getCommandIndex(commandSequence, output, "search_workspace_rag");
  const ragIndexIdx = getCommandIndex(commandSequence, output, "index_workspace_rag");
  const mutatingIndexes = ["create_job", "queue_new_job", "create_agent", "create_network", "create_group"]
    .map((x) => getCommandIndex(commandSequence, output, x))
    .filter((i) => i >= 0);
  const mutatingCommandIdx = mutatingIndexes.length > 0 ? Math.min(...mutatingIndexes) : Number.POSITIVE_INFINITY;

  const hasRagStatus = ragStatusIdx >= 0;
  const hasRagSearch = ragSearchIdx >= 0;
  const ragBeforeMutation =
    !Number.isFinite(mutatingCommandIdx) ||
    ((hasRagStatus && ragStatusIdx < mutatingCommandIdx) && (hasRagSearch && ragSearchIdx < mutatingCommandIdx));
  const hasRefreshStep = ragIndexIdx >= 0 || includesAny(output, ["if stale", "if dirty", "re-index", "reindex"]);

  return [
    {
      id: "checks-rag-status",
      passed: hasRagStatus,
      weight: 3,
      detail: "Historical queries should call workspace_rag_status first.",
    },
    {
      id: "uses-rag-search",
      passed: hasRagSearch,
      weight: 3,
      detail: "Historical queries should use search_workspace_rag.",
    },
    {
      id: "rag-before-mutation",
      passed: ragBeforeMutation,
      weight: 3,
      detail: "RAG checks should occur before mutating commands.",
    },
    {
      id: "handles-stale-index",
      passed: hasRefreshStep,
      weight: 1,
      detail: "Plan should mention handling stale/dirty index (index_workspace_rag).",
    },
  ];
}

function evaluateAtomicRead(output: string): BehaviorCriterion[] {
  const hasCreateJob = findCommandIndex(output, "create_job") >= 0;
  const hasQueueNewJob = findCommandIndex(output, "queue_new_job") >= 0;

  return [
    {
      id: "prefers-create-job",
      passed: hasCreateJob,
      weight: 3,
      detail: "Atomic operations should use create_job for lightweight execution.",
    },
    {
      id: "avoids-queue-new-job",
      passed: !hasQueueNewJob,
      weight: 2,
      detail: "Atomic reads should avoid queue_new_job unless truly needed.",
    },
  ];
}

export function evaluateBehaviorPlan(
  output: string,
  scenario: BehaviorScenario,
  threshold = 0.85,
): BehaviorEvalResult {
  return evaluateBehaviorPlanWithCommands(output, [], scenario, threshold);
}

function evaluateBehaviorPlanWithCommands(
  output: string,
  commandSequence: string[],
  scenario: BehaviorScenario,
  threshold = 0.85,
): BehaviorEvalResult {
  const criteria =
    scenario.kind === "multi-step-workflow"
      ? evaluateMultiStepWorkflow(output, commandSequence)
      : scenario.kind === "historical-rag-query"
        ? evaluateHistoricalRagQuery(output, commandSequence)
        : evaluateAtomicRead(output);

  const maxWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
  const scoreWeight = criteria.reduce((sum, c) => sum + (c.passed ? c.weight : 0), 0);
  const normalized = maxWeight > 0 ? scoreWeight / maxWeight : 0;

  return {
    score: normalized,
    passed: normalized >= threshold,
    threshold,
    criteria,
  };
}

function normalizeTraceTurnOutput(turn: BehaviorTraceTurn): { normalizedOutput: string; commandSequence: string[] } {
  const commandSequence = (turn.toolCalls || []).map(tc => tc.name).filter(Boolean);
  const toolSection = commandSequence.length > 0
    ? `\n\nTool calls (ordered):\n${commandSequence.map((name, idx) => `${idx + 1}) ${name}`).join("\n")}`
    : "";
  return {
    commandSequence,
    normalizedOutput: `${turn.content || ""}${toolSection}`.trim(),
  };
}

export function evaluateBehaviorTraceTurn(
  turn: BehaviorTraceTurn,
  scenario: BehaviorScenario,
  threshold = 0.85,
): BehaviorTraceTurnEval {
  const normalized = normalizeTraceTurnOutput(turn);
  return {
    commandSequence: normalized.commandSequence,
    normalizedOutput: normalized.normalizedOutput,
    result: evaluateBehaviorPlanWithCommands(normalized.normalizedOutput, normalized.commandSequence, scenario, threshold),
  };
}

export function evaluateBehaviorTraceConversation(
  turns: BehaviorTraceTurn[],
  scenario: BehaviorScenario,
  threshold = 0.85,
): BehaviorTraceTurnEval[] {
  return turns
    .filter(turn => turn.role !== "user")
    .map(turn => evaluateBehaviorTraceTurn(turn, scenario, threshold));
}
