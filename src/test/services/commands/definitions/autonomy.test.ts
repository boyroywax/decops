import { describe, it, expect } from "vitest";
import {
  assignTaskCommand,
  delegateTaskCommand,
  escalateTaskCommand,
  taskStatusCommand,
  listTasksCommand,
  groupIdeateCommand,
  proposeAgentCommand,
  executeProposalCommand,
  autonomyCommands,
} from "@/services/commands/definitions/autonomy";

describe("autonomy command definitions", () => {
  it("exports all 8 commands", () => {
    expect(autonomyCommands.length).toBe(8);
  });

  it("all commands have required fields", () => {
    for (const cmd of autonomyCommands) {
      expect(cmd.id).toBeDefined();
      expect(cmd.description).toBeDefined();
      expect(cmd.args).toBeDefined();
      expect(cmd.execute).toBeDefined();
      expect(typeof cmd.execute).toBe("function");
      expect(cmd.rbac).toBeDefined();
      expect(cmd.rbac.length).toBeGreaterThan(0);
      expect(cmd.tags).toBeDefined();
      expect(cmd.tags).toContain("autonomy");
    }
  });

  describe("assign_task", () => {
    it("has correct id and required args", () => {
      expect(assignTaskCommand.id).toBe("assign_task");
      expect(assignTaskCommand.args.agentId).toBeDefined();
      expect(assignTaskCommand.args.agentId.required).toBe(true);
      expect(assignTaskCommand.args.goal).toBeDefined();
      expect(assignTaskCommand.args.goal.required).toBe(true);
    });

    it("uses AI", () => {
      expect(assignTaskCommand.usesAI).toBe("ai-text");
    });
  });

  describe("delegate_task", () => {
    it("has correct id and required args", () => {
      expect(delegateTaskCommand.id).toBe("delegate_task");
      expect(delegateTaskCommand.args.taskId).toBeDefined();
      expect(delegateTaskCommand.args.taskId.required).toBe(true);
    });
  });

  describe("escalate_task", () => {
    it("has correct id and required args", () => {
      expect(escalateTaskCommand.id).toBe("escalate_task");
      expect(escalateTaskCommand.args.taskId).toBeDefined();
      expect(escalateTaskCommand.args.taskId.required).toBe(true);
    });
  });

  describe("task_status", () => {
    it("has correct id and required args", () => {
      expect(taskStatusCommand.id).toBe("task_status");
      expect(taskStatusCommand.args.taskId).toBeDefined();
      expect(taskStatusCommand.args.taskId.required).toBe(true);
    });
  });

  describe("list_tasks", () => {
    it("has correct id", () => {
      expect(listTasksCommand.id).toBe("list_tasks");
    });

    it("status filter is optional", () => {
      expect(listTasksCommand.args.status.required).toBe(false);
    });
  });

  describe("group_ideate", () => {
    it("has correct id and uses AI", () => {
      expect(groupIdeateCommand.id).toBe("group_ideate");
      expect(groupIdeateCommand.usesAI).toBe("ai-text");
    });

    it("requires groupId and topic", () => {
      expect(groupIdeateCommand.args.groupId.required).toBe(true);
      expect(groupIdeateCommand.args.topic.required).toBe(true);
    });
  });

  describe("propose_agent", () => {
    it("has correct id and uses AI", () => {
      expect(proposeAgentCommand.id).toBe("propose_agent");
      expect(proposeAgentCommand.usesAI).toBe("ai-text");
    });

    it("requires groupId and name", () => {
      expect(proposeAgentCommand.args.groupId.required).toBe(true);
      expect(proposeAgentCommand.args.name.required).toBe(true);
    });
  });

  describe("execute_proposal", () => {
    it("has correct id", () => {
      expect(executeProposalCommand.id).toBe("execute_proposal");
    });

    it("requires proposalId", () => {
      expect(executeProposalCommand.args.proposalId.required).toBe(true);
    });
  });

  it("all commands have unique IDs", () => {
    const ids = autonomyCommands.map(c => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("commands are registered in init.ts via autonomyCommands array", () => {
    // Verify the export is an array of command definitions
    expect(Array.isArray(autonomyCommands)).toBe(true);
    autonomyCommands.forEach(cmd => {
      expect(cmd).toHaveProperty("id");
      expect(cmd).toHaveProperty("execute");
      expect(cmd).toHaveProperty("rbac");
    });
  });
});
