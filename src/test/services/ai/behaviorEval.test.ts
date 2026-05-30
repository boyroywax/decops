import { describe, expect, it } from "vitest";
import {
  evaluateBehaviorPlan,
  evaluateBehaviorTraceConversation,
  evaluateBehaviorTraceTurn,
  type BehaviorScenario,
} from "./behaviorEvalHarness";

const multiStepScenario: BehaviorScenario = {
  id: "workflow-team-bootstrap",
  kind: "multi-step-workflow",
  description: "Set up a team with multiple dependent operations.",
};

const historicalRagScenario: BehaviorScenario = {
  id: "historical-topology-question",
  kind: "historical-rag-query",
  description: "Answer a historical question before proposing changes.",
};

const atomicReadScenario: BehaviorScenario = {
  id: "single-read-check",
  kind: "atomic-read",
  description: "Run a simple one-shot read command.",
};

describe("Behavior Eval Harness", () => {
  it("passes high-quality multi-step plan that uses queue_new_job and step structure", () => {
    const output = [
      "Plan:",
      "1) list_available_commands for needed ids.",
      "2) queue_new_job with serial steps:",
      "   - create_network",
      "   - create_agent",
      "   - create_group",
      "3) add a parallel fan-out section for onboarding messages.",
      "4) fan-in into a final artifact step.",
    ].join("\n");

    const result = evaluateBehaviorPlan(output, multiStepScenario, 0.9);
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.9);
  });

  it("fails weak multi-step plan that only uses create_job with no structure", () => {
    const output = [
      "I will run create_job(create_network) and then maybe do another create_job later.",
      "No need for steps.",
    ].join("\n");

    const result = evaluateBehaviorPlan(output, multiStepScenario, 0.9);
    expect(result.passed).toBe(false);
    expect(result.score).toBeLessThan(0.9);
  });

  it("passes historical query plan that checks RAG freshness before mutation", () => {
    const output = [
      "1) workspace_rag_status",
      "2) if stale/dirty, index_workspace_rag",
      "3) search_workspace_rag for prior topology decisions",
      "4) only then queue_new_job for requested topology updates",
    ].join("\n");

    const result = evaluateBehaviorPlan(output, historicalRagScenario, 0.9);
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.9);
  });

  it("fails historical query plan that mutates before RAG checks", () => {
    const output = [
      "1) create_job(create_network)",
      "2) queue_new_job for migration",
      "3) maybe search_workspace_rag if needed",
    ].join("\n");

    const result = evaluateBehaviorPlan(output, historicalRagScenario, 0.9);
    expect(result.passed).toBe(false);
    expect(result.score).toBeLessThan(0.9);
  });

  it("passes atomic read plan that uses create_job and avoids queue_new_job", () => {
    const output = "Use create_job(list_agents, { networkId: 'n1' }) and return results.";

    const result = evaluateBehaviorPlan(output, atomicReadScenario, 0.9);
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.9);
  });

  it("passes historical trace turn when tool call ordering is RAG-first", () => {
    const traceTurn = {
      role: "assistant" as const,
      content: "Checking historical context and freshness before any changes.",
      toolCalls: [
        { name: "workspace_rag_status" },
        { name: "search_workspace_rag" },
        { name: "queue_new_job" },
      ],
    };

    const result = evaluateBehaviorTraceTurn(traceTurn, historicalRagScenario, 0.9);
    expect(result.result.passed).toBe(true);
    expect(result.commandSequence).toEqual([
      "workspace_rag_status",
      "search_workspace_rag",
      "queue_new_job",
    ]);
  });

  it("fails historical trace turn when mutation precedes RAG checks", () => {
    const traceTurn = {
      role: "assistant" as const,
      content: "Applying updates first and checking history later.",
      toolCalls: [
        { name: "queue_new_job" },
        { name: "search_workspace_rag" },
      ],
    };

    const result = evaluateBehaviorTraceTurn(traceTurn, historicalRagScenario, 0.9);
    expect(result.result.passed).toBe(false);
    expect(result.result.score).toBeLessThan(0.9);
  });

  it("evaluates only assistant turns from a conversation trace", () => {
    const conversationTrace = [
      { role: "user" as const, content: "What changed last week?" },
      {
        role: "assistant" as const,
        content: "I will inspect workspace memory first.",
        toolCalls: [{ name: "workspace_rag_status" }, { name: "search_workspace_rag" }],
      },
      {
        role: "assistant" as const,
        content: "Now I can apply updates.",
        toolCalls: [{ name: "queue_new_job" }],
      },
    ];

    const results = evaluateBehaviorTraceConversation(conversationTrace, historicalRagScenario, 0.7);
    expect(results).toHaveLength(2);
    expect(results[0].result.passed).toBe(true);
    expect(results[1].result.passed).toBe(false);
  });
});
