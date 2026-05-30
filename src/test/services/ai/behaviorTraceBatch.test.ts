import { describe, expect, it } from "vitest";
import {
  evaluateBehaviorTraceBatch,
  inferBehaviorScenarioKind,
  parseBehaviorTraceConversations,
} from "./behaviorTraceBatch";

describe("Behavior Trace Batch", () => {
  it("infers historical-rag-query from RAG command usage", () => {
    const kind = inferBehaviorScenarioKind({
      role: "assistant",
      content: "Checking workspace history first.",
      toolCalls: [{ name: "workspace_rag_status" }, { name: "search_workspace_rag" }],
    });

    expect(kind).toBe("historical-rag-query");
  });

  it("parses export payload with conversations wrapper", () => {
    const payload = {
      conversations: [
        {
          id: "c1",
          title: "Ops convo",
          messages: [
            { role: "user", content: "hello" },
            {
              role: "assistant",
              content: "I will use create_job.",
              toolCalls: [{ name: "create_job" }],
            },
          ],
        },
      ],
    };

    const conversations = parseBehaviorTraceConversations(payload);
    expect(conversations).toHaveLength(1);
    expect(conversations[0].messages).toHaveLength(2);
    expect(conversations[0].messages[1].toolCalls?.[0].name).toBe("create_job");
  });

  it("scores a mixed conversation batch and tracks skipped turns", () => {
    const conversations = [
      {
        id: "trace-1",
        title: "Trace One",
        messages: [
          { role: "assistant" as const, content: "Plain acknowledgment without commands." },
          {
            role: "assistant" as const,
            content: "Checking history first.",
            toolCalls: [{ name: "workspace_rag_status" }, { name: "search_workspace_rag" }, { name: "queue_new_job" }],
          },
          {
            role: "assistant" as const,
            content: "Run one read with create_job.",
            toolCalls: [{ name: "create_job" }],
          },
        ],
      },
      {
        id: "trace-2",
        messages: [
          {
            role: "assistant" as const,
            content: "Mutate now, search later.",
            toolCalls: [{ name: "queue_new_job" }, { name: "search_workspace_rag" }],
          },
        ],
      },
    ];

    const result = evaluateBehaviorTraceBatch(conversations, 0.9);

    expect(result.totalAssistantTurns).toBe(4);
    expect(result.scoredTurns).toBe(3);
    expect(result.skippedTurns).toBe(1);
    expect(result.perScenario["historical-rag-query"].total).toBe(2);
    expect(result.perScenario["atomic-read"].total).toBe(1);
    expect(result.passRate).toBeGreaterThan(0);
    expect(result.passRate).toBeLessThan(1);
  });

  it("throws for invalid payload shape", () => {
    expect(() => parseBehaviorTraceConversations({ foo: "bar" })).toThrowError(/Invalid trace payload/);
  });
});
