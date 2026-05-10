import { describe, it, expect, vi, beforeEach } from "vitest";
import { chatDuringTask, type TaskChatResult } from "@/services/autonomy/taskChat";
import type { AgentTask } from "@/types/autonomy";
import type { Agent } from "@/types";

// Mock the AI provider modules
vi.mock("@/services/ai/models", () => ({
  getAgentModel: vi.fn(() => "test-model"),
}));

vi.mock("@/services/ai/providers", () => ({
  buildProviderRequest: vi.fn(() => ({
    url: "https://api.test.com/v1/chat",
    headers: { "Content-Type": "application/json" },
    body: {},
  })),
  parseProviderResponse: vi.fn(() => "CONTINUE: The partial results look good, proceed with remaining actions."),
}));

// Mock fetch
const mockFetch = vi.fn();
(globalThis as any).fetch = mockFetch;

function makeTask(overrides?: Partial<AgentTask>): AgentTask {
  return {
    id: "task-1",
    goal: "Build a dashboard",
    createdBy: "user-1",
    assigneeId: "agent-1",
    escalationLevel: "self",
    history: [],
    status: "executing",
    config: {
      maxRounds: 12,
      maxEscalations: 3,
      allowSubTasks: true,
      allowJobCreation: true,
      allowAgentCreation: true,
      autoExecuteConsensus: false,
      maxConcurrentSubTasks: 4,
      taskTimeoutMs: 300000,
      maxReplanAttempts: 2,
      allowMidExecutionChat: true,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    workspaceStorage: {},
    chatHistory: [],
    ...overrides,
  };
}

function makeAgent(overrides?: Partial<Agent>): Agent {
  return {
    id: "agent-1",
    name: "TestAgent",
    role: "builder",
    did: "did:test:agent-1",
    prompt: "You are a test agent",
    ...overrides,
  } as Agent;
}

describe("chatDuringTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: "test" }] }),
    });
  });

  it("appends user and assistant messages to task chatHistory", async () => {
    const task = makeTask();
    const agent = makeAgent();

    const result = await chatDuringTask(task, agent, "What should I do next?");

    expect(result.ok).toBe(true);
    expect(task.chatHistory).toHaveLength(2);
    expect(task.chatHistory![0].role).toBe("user");
    expect(task.chatHistory![0].content).toBe("What should I do next?");
    expect(task.chatHistory![1].role).toBe("assistant");
  });

  it("records ai_chat event in task history", async () => {
    const task = makeTask();
    const agent = makeAgent();

    await chatDuringTask(task, agent, "Help me decide");

    const aiChatEvents = task.history.filter(e => e.kind === "ai_chat");
    expect(aiChatEvents).toHaveLength(1);
    expect(aiChatEvents[0].agentId).toBe("agent-1");
    expect(aiChatEvents[0].detail.messagePreview).toContain("Help me decide");
  });

  it("initializes chatHistory if it was undefined", async () => {
    const task = makeTask({ chatHistory: undefined });
    const agent = makeAgent();

    await chatDuringTask(task, agent, "First message");

    expect(task.chatHistory).toBeDefined();
    expect(task.chatHistory).toHaveLength(2);
  });

  it("returns error result when fetch fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));

    const task = makeTask();
    const agent = makeAgent();

    const result = await chatDuringTask(task, agent, "Test message");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("network error");
    expect(result.response).toBe("");
  });

  it("returns error result when API returns non-ok", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: "Server error" } }),
    });

    const task = makeTask();
    const agent = makeAgent();

    const result = await chatDuringTask(task, agent, "Test message");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Server error");
  });

  it("preserves existing chatHistory across multiple calls", async () => {
    const task = makeTask({
      chatHistory: [
        { role: "user", content: "first question", timestamp: new Date().toISOString() },
        { role: "assistant", content: "first answer", timestamp: new Date().toISOString() },
      ],
    });
    const agent = makeAgent();

    await chatDuringTask(task, agent, "second question");

    expect(task.chatHistory).toHaveLength(4); // 2 existing + 2 new
    expect(task.chatHistory![2].content).toBe("second question");
  });

  it("updates task updatedAt timestamp", async () => {
    const task = makeTask({ updatedAt: "2024-01-01T00:00:00.000Z" });
    const agent = makeAgent();

    await chatDuringTask(task, agent, "Update me");

    expect(task.updatedAt).not.toBe("2024-01-01T00:00:00.000Z");
  });
});
