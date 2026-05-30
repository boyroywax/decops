# Prompt Evaluation Harness

This harness provides a repeatable rubric test for agent/tooling prompt quality.

## Goals

- Prevent regressions in job-first guidance.
- Ensure Workspace RAG usage guidance remains present.
- Ensure toolkit operator playbook guidance is injected.

## Files

- src/test/services/ai/promptEvalHarness.ts
  - Generic weighted prompt scoring utility.
- src/test/services/ai/promptEval.test.ts
  - Scenario tests for workspace and direct-agent prompts.
- src/test/services/ai/behaviorEvalHarness.ts
  - Second-stage scorer for simulated plans and real assistant trace turns.
- src/test/services/ai/behaviorEval.test.ts
  - Scenario tests that validate expected command ordering and strategy quality for both plan text and trace turns.
- src/test/services/ai/behaviorTraceBatch.ts
  - Batch importer and scorer for persisted conversation traces with scenario inference.
- src/test/services/ai/behaviorTraceBatch.test.ts
  - Tests for trace payload parsing, scenario inference, and batch summary scoring.

## Run

- npm run test:prompt-eval
- npm run test:behavior-eval
- npm run test:behavior-trace-batch
- npm run test:agent-evals

## Rubric Style

Each scenario defines weighted rules:

- required rules: must always be present
- weighted rules: contribute to normalized score
- pass threshold: default 0.9 in current scenarios

The test output reports missing rule IDs when a scenario fails.

## Extending

To add a new scenario:

1. Define prompt under test.
2. Define PromptEvalRule[] rubric (required + weighted).
3. Evaluate with evaluatePrompt and assert score threshold.

Example dimensions to extend:

- multi-step queue_new_job enforcement
- anti-fabrication language presence
- storage fan-out/fan-in guidance presence
- toolkit-specific command safety caveats

## Second-Stage Behavior Evaluation

Prompt quality alone does not prove behavior quality. The behavior harness scores simulated assistant plans against policy rules:

- multi-step workflows should prefer queue_new_job and explicit step structure
- historical queries should check workspace_rag_status and search_workspace_rag before mutation
- atomic reads should prefer create_job and avoid queue_new_job

This stage is designed to evolve into model-output evaluations by feeding captured assistant plans into the same scorer.

The harness now supports evaluating real assistant turn traces with tool call ordering:

- evaluateBehaviorTraceTurn(turn, scenario, threshold)
- evaluateBehaviorTraceConversation(turns, scenario, threshold)

Trace evaluators accept assistant content plus ordered toolCalls and score behavior against the same rubric, which enables offline scoring of persisted conversation turns.

## Batch Trace Evaluation

For exported chat conversation data (the same shape persisted by conversation storage), use:

- parseBehaviorTraceConversations(payload)
  - accepts either a raw array of conversations or { conversations: [...] }
- inferBehaviorScenarioKind(turn)
  - infers one of: multi-step-workflow, historical-rag-query, atomic-read
- evaluateBehaviorTraceBatch(conversations, threshold)
  - returns overall pass rate, average score, per-scenario breakdown, and per-turn scores

Turns that do not map to an evaluation scenario are counted as skipped, so the summary distinguishes coverage from quality.
