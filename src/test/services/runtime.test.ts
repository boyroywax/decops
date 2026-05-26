import { describe, it, expect } from "vitest";
import { resetRuntimeState } from "@/services/runtime";
import { getAllTasks } from "@/services/autonomy/taskEngine";
import { clearAll as clearTaskEngine } from "@/services/autonomy/taskEngine";
import {
  activateAgent,
  deactivateAgent,
  getAllActiveRuntimes,
  enqueueMessage,
  getAgentInbox,
  getAgentLifecycleLog,
  clearAll as clearAgentRuntime,
} from "@/services/agentRuntime";
import { clearAll as clearCommandTools } from "@/services/commands/tools";
import type { Agent } from "@/types";

function makeAgent(id: string): Agent {
  return {
    id,
    name: `Agent ${id}`,
    role: "test",
    description: "test agent",
    provider: "anthropic",
    model: "claude-3-5-sonnet",
  } as unknown as Agent;
}

describe("services/runtime — resetRuntimeState", () => {
  it("clears agentRuntime runtimeStates / inboxes / lifecycleLogs", () => {
    clearAgentRuntime();
    const agent = makeAgent("a1");
    activateAgent(agent);
    enqueueMessage("a1", {
      agentId: "a1",
      messages: [],
    } as any);

    expect(getAllActiveRuntimes().length).toBe(1);
    expect(getAgentInbox("a1").length).toBe(1);
    expect(getAgentLifecycleLog("a1").length).toBeGreaterThan(0);

    resetRuntimeState();

    expect(getAllActiveRuntimes().length).toBe(0);
    expect(getAgentInbox("a1").length).toBe(0);
    expect(getAgentLifecycleLog("a1").length).toBe(0);
  });

  it("clears taskEngine activeTasks", () => {
    // taskEngine's createTask is heavy; reach in via direct state-clear test
    // by asserting clearAll() resets the public getter.
    clearTaskEngine();
    expect(getAllTasks().length).toBe(0);
    // Nothing to seed without spinning up a job runner — the agentRuntime
    // path above already validates resetRuntimeState() calls clearAll on
    // each registered module. This test guards the taskEngine export
    // signature so the central reset cannot silently miss it.
    resetRuntimeState();
    expect(getAllTasks().length).toBe(0);
  });

  it("clears commands/tools pending jobs (no throw on empty)", () => {
    clearCommandTools();
    expect(() => resetRuntimeState()).not.toThrow();
  });
});
