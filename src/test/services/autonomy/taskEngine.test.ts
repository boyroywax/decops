import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTask, getTask, getAllTasks, clearTasks } from "../../../services/autonomy/taskEngine";

// We test only the synchronous, non-AI parts of the task engine:
// task creation, retrieval, clearing.
// The async executeTask requires full AI/command infrastructure.

describe("taskEngine (task store)", () => {
  beforeEach(() => {
    clearTasks();
  });

  describe("createTask", () => {
    it("creates a task with a unique ID", () => {
      const task = createTask("Build a dashboard", "agent-1", "user-1");
      expect(task.id).toBeDefined();
      expect(task.id.length).toBeGreaterThan(0);
      expect(task.goal).toBe("Build a dashboard");
      expect(task.assigneeId).toBe("agent-1");
      expect(task.createdBy).toBe("user-1");
    });

    it("initializes with pending status and self escalation", () => {
      const task = createTask("Test task", "agent-1", "user-1");
      expect(task.status).toBe("pending");
      expect(task.escalationLevel).toBe("self");
    });

    it("records creation in history", () => {
      const task = createTask("Test task", "agent-1", "user-1");
      expect(task.history.length).toBe(1);
      expect(task.history[0].kind).toBe("created");
      expect(task.history[0].agentId).toBe("user-1");
      expect(task.history[0].detail.goal).toBe("Test task");
    });

    it("accepts optional constraints", () => {
      const task = createTask("Task", "a1", "u1", ["must use Python", "no external APIs"]);
      expect(task.constraints).toEqual(["must use Python", "no external APIs"]);
    });

    it("merges custom config with defaults", () => {
      const task = createTask("Task", "a1", "u1", undefined, { maxRounds: 5, maxEscalations: 1 });
      expect(task.config.maxRounds).toBe(5);
      expect(task.config.maxEscalations).toBe(1);
      // defaults preserved
      expect(task.config.allowSubTasks).toBe(true);
      expect(task.config.taskTimeoutMs).toBe(5 * 60 * 1000);
    });

    it("tracks parentTaskId for sub-tasks", () => {
      const parent = createTask("Parent task", "a1", "u1");
      const child = createTask("Child task", "a2", "a1", undefined, undefined, parent.id);
      expect(child.parentTaskId).toBe(parent.id);
    });

    it("creates unique IDs for multiple tasks", () => {
      const t1 = createTask("Task 1", "a1", "u1");
      const t2 = createTask("Task 2", "a2", "u1");
      expect(t1.id).not.toBe(t2.id);
    });
  });

  describe("getTask", () => {
    it("retrieves a created task by ID", () => {
      const task = createTask("Find me", "a1", "u1");
      const retrieved = getTask(task.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.goal).toBe("Find me");
    });

    it("returns undefined for unknown ID", () => {
      expect(getTask("nonexistent")).toBeUndefined();
    });
  });

  describe("getAllTasks", () => {
    it("returns all created tasks", () => {
      createTask("Task A", "a1", "u1");
      createTask("Task B", "a2", "u1");
      createTask("Task C", "a3", "u1");
      const all = getAllTasks();
      expect(all.length).toBe(3);
    });

    it("returns empty array when no tasks", () => {
      expect(getAllTasks()).toEqual([]);
    });
  });

  describe("clearTasks", () => {
    it("removes all tasks", () => {
      createTask("Task 1", "a1", "u1");
      createTask("Task 2", "a2", "u1");
      expect(getAllTasks().length).toBe(2);

      clearTasks();
      expect(getAllTasks()).toEqual([]);
    });
  });
});
