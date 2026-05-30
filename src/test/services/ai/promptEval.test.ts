import { describe, expect, it } from "vitest";
import type { Agent } from "@/types";
import { buildWorkspaceSystemPrompt } from "@/services/ai/prompts";
import { buildAgentChatSystemPrompt } from "@/services/ai/chat";
import { evaluatePrompt, type PromptEvalRule } from "./promptEvalHarness";

function workspaceCtx() {
  return {
    workspaceId: "ws-eval",
    agents: [],
    channels: [],
    groups: [],
    messages: [],
    networks: [],
    bridges: [],
    jobs: [],
  };
}

function baseAgent(): Agent {
  return {
    id: "agent-eval-1",
    name: "Eval Agent",
    role: "orchestrator",
    did: "did:key:z6MkEvalAgent",
    prompt: "Execute structured workflows safely.",
    toolkits: [
      { toolkitId: "jobs", enabledAt: new Date().toISOString() },
      { toolkitId: "workspace-rag", enabledAt: new Date().toISOString() },
      { toolkitId: "collective-memory", enabledAt: new Date().toISOString() },
    ],
  } as Agent;
}

const workspacePromptRules: PromptEvalRule[] = [
  { id: "job-playbook-header", pattern: "JOB EXECUTION PLAYBOOK:", weight: 1, required: true },
  { id: "job-playbook-create-job", pattern: /Use create_job for single operational command execution/i, weight: 1 },
  { id: "job-playbook-queue-new-job", pattern: /queue_new_job/i, weight: 1 },
  { id: "rag-playbook-header", pattern: "WORKSPACE RAG PLAYBOOK:", weight: 1, required: true },
  { id: "rag-playbook-status", pattern: /workspace_rag_status/i, weight: 1 },
  { id: "rag-playbook-index", pattern: /index_workspace_rag/i, weight: 1 },
  { id: "rag-playbook-search", pattern: /search_workspace_rag/i, weight: 1 },
  { id: "toolkit-playbook-header", pattern: "TOOLKIT OPERATOR PLAYBOOK:", weight: 1, required: true },
  { id: "toolkit-playbook-jobs", pattern: /Jobs \(jobs\)/, weight: 1 },
  { id: "toolkit-playbook-rag", pattern: /Workspace RAG \(workspace-rag\)/, weight: 1 },
];

const agentPromptRules: PromptEvalRule[] = [
  { id: "reasoning-protocol", pattern: /You MUST follow the Reasoning Protocol/i, weight: 1, required: true },
  { id: "job-playbook-header", pattern: "JOB EXECUTION PLAYBOOK:", weight: 1, required: true },
  { id: "job-playbook-queue", pattern: /queue_new_job/i, weight: 1 },
  { id: "rag-playbook-header", pattern: "WORKSPACE RAG PLAYBOOK:", weight: 1, required: true },
  { id: "rag-playbook-status", pattern: /workspace_rag_status/i, weight: 1 },
  { id: "toolkit-playbook-header", pattern: "TOOLKIT OPERATOR PLAYBOOK:", weight: 1, required: true },
  { id: "toolkit-playbook-rag", pattern: /Workspace RAG \(workspace-rag\)/, weight: 1 },
  { id: "toolkit-playbook-jobs", pattern: /Jobs \(jobs\)/, weight: 1 },
];

describe("Prompt Eval Harness", () => {
  it("workspace prompt satisfies toolkit/job/RAG rubric", () => {
    const prompt = buildWorkspaceSystemPrompt(workspaceCtx());
    const result = evaluatePrompt(prompt, workspacePromptRules, 0.9);

    expect(result.passed, `Missing rules: ${result.missingRuleIds.join(", ")}`).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.9);
  });

  it("agent prompt satisfies toolkit/job/RAG rubric when workspace-rag is enabled", () => {
    const prompt = buildAgentChatSystemPrompt(baseAgent(), 8);
    const result = evaluatePrompt(prompt, agentPromptRules, 0.9);

    expect(result.passed, `Missing rules: ${result.missingRuleIds.join(", ")}`).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.9);
  });

  it("agent prompt omits workspace-rag playbook when workspace-rag toolkit is not enabled", () => {
    const agent = baseAgent();
    agent.toolkits = (agent.toolkits || []).filter(t => t.toolkitId !== "workspace-rag");

    const prompt = buildAgentChatSystemPrompt(agent, 8);

    expect(prompt).not.toContain("WORKSPACE RAG PLAYBOOK:");
    expect(prompt).not.toMatch(/Workspace RAG \(workspace-rag\)/);
    expect(prompt).toContain("JOB EXECUTION PLAYBOOK:");
  });
});
