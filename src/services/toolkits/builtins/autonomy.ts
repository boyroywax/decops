/**
 * Autonomy & Governance toolkit module.
 */

import type { ToolkitModule } from "../types";
import { autonomyCommands } from "@/services/commands/definitions/autonomy";
import { groupDecideCommand } from "@/services/commands/definitions/governance";

export const autonomyModule: ToolkitModule = {
  manifest: {
    id: "autonomy",
    name: "Autonomy & Governance",
    description:
      "Assign, delegate, and escalate tasks. Run group ideation, propose agents, and facilitate AI-powered group decisions.",
    icon: "Zap",
    color: "#f97316",
    gradient: ["#f97316", "#fb923c"],
    category: "ai",
    status: "available",
    builtIn: true,
    tags: [
      "autonomy",
      "task",
      "delegation",
      "escalation",
      "ideation",
      "consensus",
      "governance",
      "decision",
    ],
    labels: { tier: "core", domain: "ai" },
    version: "1.0.0",
    author: { name: "decops", url: "https://decops.io" },
    license: "MIT",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
  commands: [...autonomyCommands, groupDecideCommand],
  // Curated direct LLM tools — the orchestration hot path. Long-tail
  // task internals (escalate_task, propose_agent, execute_proposal) stay
  // registry-only.
  tools: [
    {
      id: "autonomy.delegateTask",
      name: "Delegate Task",
      description: "Hand off an autonomous goal to a capable agent with full context.",
      commandId: "delegate_task",
    },
    {
      id: "autonomy.assignTask",
      name: "Assign Task",
      description: "Assign an autonomous task to a specific agent and start execution.",
      commandId: "assign_task",
    },
    {
      id: "autonomy.taskStatus",
      name: "Task Status",
      description: "Inspect the current status / history of an autonomous task.",
      commandId: "task_status",
    },
    {
      id: "autonomy.listTasks",
      name: "List Tasks",
      description: "List autonomous tasks in the workspace.",
      commandId: "list_tasks",
    },
    {
      id: "autonomy.groupDecide",
      name: "Group Decide",
      description: "Run a consensus-building decision process among a group of agents.",
      commandId: "group_decide",
    },
  ],

  tasks: [
    {
      id: "autonomy_delegate_task",
      name: "Delegate Task",
      description: "Assign a task with full context to a capable agent.",
      priority: "high",
      assignableToAgents: true,
      assignableToUsers: true,
      checklist: [
        { id: "select_agent", label: "Select target agent", required: true },
        { id: "provide_context", label: "Provide task context", required: true },
        { id: "set_deadline", label: "Set deadline", required: false },
      ],
    },
    {
      id: "autonomy_group_decision",
      name: "Facilitate Group Decision",
      description: "Run a consensus-building process among agents.",
      priority: "medium",
      assignableToAgents: true,
      assignableToUsers: true,
    },
  ],

  automations: [
    {
      id: "autonomy_auto_escalate",
      name: "Auto-Escalate Stalled Tasks",
      description: "Escalate tasks that have been in-progress beyond the timeout.",
      trigger: { type: "schedule", cron: "*/5 * * * *" },
      actions: [{ type: "command", target: "escalate_task" }],
      enabled: false,
    },
  ],

  logging: {
    config: { minLevel: "info", maxEntries: 500 },
    channels: [
      { id: "autonomy.decisions", name: "Decision Log", description: "Group decision outcomes and votes" },
      { id: "autonomy.delegations", name: "Delegation Log", description: "Task delegation and escalation events" },
    ],
  },

  notifications: {
    templates: [
      { id: "task_delegated", name: "Task Delegated", description: "Notify when a task is delegated", channel: "in-app", priority: "normal", event: "task.delegated", template: "Task '{{taskName}}' delegated to {{agent}}." },
      { id: "task_escalated", name: "Task Escalated", description: "Alert on task escalation", channel: "in-app", priority: "high", event: "task.escalated", template: "Task '{{taskName}}' has been escalated." },
    ],
    channels: ["in-app"],
  },

  metrics: {
    definitions: [
      { name: "toolkit.autonomy.tasks_active", description: "Tasks currently in progress", type: "gauge" },
      { name: "toolkit.autonomy.tasks_completed", description: "Tasks completed (cumulative)", type: "counter" },
      { name: "toolkit.autonomy.delegations", description: "Task delegations (cumulative)", type: "counter" },
    ],
    collect: () => ({ "toolkit.autonomy.tasks_active": 0, "toolkit.autonomy.tasks_completed": 0, "toolkit.autonomy.delegations": 0 }),
  },

  rbac: {
    permissions: [
      { id: "autonomy.delegate", name: "Delegate Tasks", description: "Delegate tasks to agents", resource: "task", actions: ["create", "update"] },
      { id: "autonomy.decide", name: "Group Decisions", description: "Initiate group decisions", resource: "decision", actions: ["create", "execute"] },
      { id: "autonomy.view", name: "View Tasks", description: "View task status", resource: "task", actions: ["read"] },
    ],
    roles: [
      { id: "autonomy-admin", name: "Autonomy Admin", description: "Full autonomy access", permissions: ["autonomy.delegate", "autonomy.decide", "autonomy.view"] },
    ],
    defaultRole: "autonomy-admin",
  },

  docs: {
    documents: [
      { id: "autonomy-readme", title: "Autonomy & Governance", type: "readme", content: "# Autonomy & Governance\n\nTask delegation, escalation, and group decision-making.", order: 1 },
    ],
    readme: "# Autonomy Kit\n\nEnables AI-powered task delegation, escalation, and consensus-building.",
  },

  activity: { enabled: true },
};
