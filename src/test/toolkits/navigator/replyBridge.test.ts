import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { addJobMock, workspaceContextMock } = vi.hoisted(() => ({
  addJobMock: vi.fn(),
  workspaceContextMock: {
    agents: [],
    messages: [],
  },
}));

vi.mock("@/context/JobsContext", () => ({
  useJobsContext: () => ({
    addJob: addJobMock,
    jobs: [],
  }),
}));

vi.mock("@/context/WorkspaceContext", () => ({
  useWorkspaceContext: () => workspaceContextMock,
}));

import { navigatorService } from "@/toolkits/navigator/service";
import { getNextExecutionGroup, startNavigatorSubgoalExecution, useNavigatorExecutionBridge } from "@/toolkits/navigator/replyBridge";

const STORAGE_KEY = "decops.navigator.state.v1";

describe("startNavigatorSubgoalExecution", () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    navigatorService.reset();
    addJobMock.mockReset();
  });

  it("dispatches direct sub-goals with await_response=true", () => {
    const goal = navigatorService.createGoal({ prompt: "Goal prompt", title: "Goal" });
    const [subgoal] = navigatorService.addSubgoals(goal.id, [{
      title: "Do direct work",
      instruction: "Direct instruction",
      assignedAgentId: "agent-123",
    }]);

    const addJob = vi.fn((job: unknown) => {
      const request = job as { request?: unknown };
      return { id: "job-direct", request: request.request };
    });

    const result = startNavigatorSubgoalExecution(
      goal.id,
      subgoal,
      { addJob } as unknown as ReturnType<typeof import("@/context/JobsContext").useJobsContext>,
    );

    expect(result).toEqual({ jobId: "job-direct", dispatch: "agent" });
    expect(addJob).toHaveBeenCalledTimes(1);
    const payload = addJob.mock.calls[0]?.[0] as { request: Record<string, unknown> };
    expect(payload.request.await_response).toBe(true);

    const updated = navigatorService.getGoal(goal.id)?.subgoals.find((s) => s.id === subgoal.id);
    expect(updated?.status).toBe("executing");
    expect(updated?.jobIds).toContain("job-direct");
  });

  it("dispatches huddle sub-goals with await_responses=true", () => {
    const goal = navigatorService.createGoal({ prompt: "Goal prompt", title: "Goal" });
    const [subgoal] = navigatorService.addSubgoals(goal.id, [{
      title: "Run huddle",
      instruction: "Huddle instruction",
    }]);
    const huddle = navigatorService.registerHuddle({
      goalId: goal.id,
      subgoalId: subgoal.id,
      groupId: "group-42",
      members: ["a1", "a2"],
      networkIds: [],
    });

    const current = navigatorService.getGoal(goal.id)?.subgoals.find((s) => s.id === subgoal.id);
    expect(current?.huddleId).toBe(huddle.id);

    const addJob = vi.fn((job: unknown) => {
      const request = job as { request?: unknown };
      return { id: "job-huddle", request: request.request };
    });

    const result = startNavigatorSubgoalExecution(
      goal.id,
      current!,
      { addJob } as unknown as ReturnType<typeof import("@/context/JobsContext").useJobsContext>,
    );

    expect(result).toEqual({ jobId: "job-huddle", dispatch: "huddle" });
    expect(addJob).toHaveBeenCalledTimes(1);
    const payload = addJob.mock.calls[0]?.[0] as { request: Record<string, unknown> };
    expect(payload.request.await_responses).toBe(true);

    const updated = navigatorService.getGoal(goal.id)?.subgoals.find((s) => s.id === subgoal.id);
    expect(updated?.status).toBe("executing");
    expect(updated?.jobIds).toContain("job-huddle");
  });

  it("returns execution groups in ordered batches (parallel first, then sequential)", () => {
    const goal = navigatorService.createGoal({ prompt: "Goal prompt", title: "Goal" });
    const created = navigatorService.addSubgoals(goal.id, [
      {
        title: "Step 1A",
        instruction: "Run 1A",
        assignedAgentId: "agent-a",
        order: 1,
      },
      {
        title: "Step 1B",
        instruction: "Run 1B",
        assignedAgentId: "agent-b",
        order: 1,
      },
      {
        title: "Step 2",
        instruction: "Run 2",
        assignedAgentId: "agent-c",
        order: 2,
      },
    ]);

    let currentGoal = navigatorService.getGoal(goal.id)!;
    let firstGroup = getNextExecutionGroup(currentGoal);
    expect(firstGroup.map((subgoal) => subgoal.title).sort()).toEqual(["Step 1A", "Step 1B"]);

    navigatorService.controlSubgoal(goal.id, created[0].id, {
      status: "completed",
      actor: "navigator",
      note: "test-complete",
    });

    currentGoal = navigatorService.getGoal(goal.id)!;
    firstGroup = getNextExecutionGroup(currentGoal);
    expect(firstGroup.map((subgoal) => subgoal.title).sort()).toEqual(["Step 1A", "Step 1B"]);

    navigatorService.controlSubgoal(goal.id, created[1].id, {
      status: "completed",
      actor: "navigator",
      note: "test-complete",
    });

    currentGoal = navigatorService.getGoal(goal.id)!;
    const secondGroup = getNextExecutionGroup(currentGoal);
    expect(secondGroup.map((subgoal) => subgoal.title)).toEqual(["Step 2"]);
  });

  it("does not start the next execution order while the current order is still executing", async () => {
    const goal = navigatorService.createGoal({ prompt: "Goal prompt", title: "Goal" });
    const created = navigatorService.addSubgoals(goal.id, [
      {
        title: "Step 1",
        instruction: "Run 1",
        assignedAgentId: "agent-a",
        order: 1,
      },
      {
        title: "Step 2",
        instruction: "Run 2",
        assignedAgentId: "agent-b",
        order: 2,
      },
    ]);

    navigatorService.controlSubgoal(goal.id, created[0].id, {
      status: "executing",
      appendJobId: "job-step-1",
      actor: "navigator",
      note: "step 1 already running",
    });
    navigatorService.updateGoal(goal.id, { autoRun: true, status: "executing" });

    renderHook(() => useNavigatorExecutionBridge());

    await waitFor(() => {
      expect(addJobMock).not.toHaveBeenCalled();
    });

    const stepTwo = navigatorService.getGoal(goal.id)?.subgoals.find((subgoal) => subgoal.id === created[1].id);
    expect(stepTwo?.status).toBe("assigned");
  });

  it("starts the next execution order after the current order completes", async () => {
    addJobMock.mockImplementation((job: { request: Record<string, unknown> }) => ({
      id: "job-step-2",
      request: job.request,
    }));

    const goal = navigatorService.createGoal({ prompt: "Goal prompt", title: "Goal" });
    const created = navigatorService.addSubgoals(goal.id, [
      {
        title: "Step 1",
        instruction: "Run 1",
        assignedAgentId: "agent-a",
        order: 1,
      },
      {
        title: "Step 2",
        instruction: "Run 2",
        assignedAgentId: "agent-b",
        order: 2,
      },
    ]);

    navigatorService.controlSubgoal(goal.id, created[0].id, {
      status: "executing",
      appendJobId: "job-step-1",
      actor: "navigator",
      note: "step 1 already running",
    });
    navigatorService.updateGoal(goal.id, { autoRun: true, status: "executing" });

    renderHook(() => useNavigatorExecutionBridge());

    act(() => {
      navigatorService.controlSubgoal(goal.id, created[0].id, {
        status: "completed",
        actor: "navigator",
        note: "step 1 finished",
      });
    });

    await waitFor(() => {
      expect(addJobMock).toHaveBeenCalledTimes(1);
    });

    const payload = addJobMock.mock.calls[0]?.[0] as { request: Record<string, unknown> };
    expect(payload.request.await_response).toBe(true);
    expect(payload.request.to_agent_id).toBe("agent-b");

    const stepTwo = navigatorService.getGoal(goal.id)?.subgoals.find((subgoal) => subgoal.id === created[1].id);
    expect(stepTwo?.status).toBe("executing");
    expect(stepTwo?.jobIds).toContain("job-step-2");
  });
});
