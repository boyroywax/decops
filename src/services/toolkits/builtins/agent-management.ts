/**
 * Agent Management toolkit module.
 *
 * Facets: metadata, commands, collections, configuration, metrics,
 *         logging, notifications, rbac, tasks, tests, docs, activity
 */

import type { ToolkitModule } from "../types";
import { createAgentCommand, pingAgentCommand } from "@/services/commands/definitions/agent";
import { deleteAgentCommand, updateAgentPromptCommand } from "@/services/commands/definitions/modification";
import { listAgentsCommand } from "@/services/commands/definitions/query";
import { bulkDeleteCommand } from "@/services/commands/definitions/maintenance";
import {
  enableToolkitCommand,
  disableToolkitCommand,
  listAgentToolkitsCommand,
  setAgentToolkitsCommand,
} from "@/services/commands/definitions/toolkit";

export const agentManagementModule: ToolkitModule = {
  manifest: {
    id: "agent-management",
    name: "Agent Management",
    description:
      "Create, configure, monitor, and remove AI agents. Includes health checks, prompt editing, and bulk operations.",
    icon: "Bot",
    color: "#00e5a0",
    gradient: ["#00e5a0", "#34d399"],
    category: "agents",
    status: "available",
    builtIn: true,
    tags: ["agent", "workspace", "health", "modification", "toolkit", "bulk"],
    labels: { tier: "core", domain: "agents" },
    version: "1.0.0",
    author: { name: "decops", url: "https://decops.io" },
    license: "MIT",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
  commands: [
    createAgentCommand,
    pingAgentCommand,
    deleteAgentCommand,
    updateAgentPromptCommand,
    listAgentsCommand,
    enableToolkitCommand,
    disableToolkitCommand,
    listAgentToolkitsCommand,
    setAgentToolkitsCommand,
    bulkDeleteCommand,
  ],
  tools: [],

  // ── Collections ────────────────────────────────

  collections: [
    {
      id: "agents",
      name: "Agents",
      description: "All AI agents in the current workspace.",
      schema: [
        { name: "id", type: "string", required: true, unique: true, indexed: true },
        { name: "name", type: "string", required: true },
        { name: "role", type: "enum", required: true, enumValues: ["researcher", "builder", "curator", "validator", "orchestrator", "moderator"] },
        { name: "prompt", type: "string", required: true },
        { name: "status", type: "enum", enumValues: ["active", "idle", "offline"] },
        { name: "createdAt", type: "date" },
      ],
      primaryKey: "id",
    },
  ],

  // ── Configuration ──────────────────────────────

  configuration: {
    fields: [
      { key: "defaultRole", label: "Default Role", description: "Role assigned to new agents when none is specified", type: "select", defaultValue: "researcher", options: [
        { label: "Researcher", value: "researcher" },
        { label: "Builder", value: "builder" },
        { label: "Curator", value: "curator" },
        { label: "Validator", value: "validator" },
        { label: "Orchestrator", value: "orchestrator" },
      ]},
      { key: "autoPortrait", label: "Auto-Generate Portrait", description: "Automatically generate an AI portrait when creating an agent", type: "boolean", defaultValue: false },
    ],
  },

  // ── Logging ────────────────────────────────────

  logging: {
    config: { minLevel: "info", maxEntries: 500 },
    channels: [
      { id: "agents.lifecycle", name: "Agent Lifecycle", description: "Agent creation, deletion, and role changes" },
      { id: "agents.health", name: "Agent Health", description: "Ping results and health check events" },
    ],
  },

  // ── Notifications ──────────────────────────────

  notifications: {
    templates: [
      { id: "agent_created", name: "Agent Created", description: "Notify when a new agent is created", channel: "in-app", priority: "normal", event: "agent.created", template: "Agent '{{agentName}}' has been created with role {{role}}." },
      { id: "agent_offline", name: "Agent Offline", description: "Alert when an agent goes offline", channel: "in-app", priority: "high", event: "agent.offline", template: "Agent '{{agentName}}' is offline." },
    ],
    channels: ["in-app"],
  },

  // ── Metrics ────────────────────────────────────

  metrics: {
    definitions: [
      { name: "toolkit.agents.total", description: "Total agents in workspace", type: "gauge" },
      { name: "toolkit.agents.created", description: "Agents created (cumulative)", type: "counter" },
    ],
    collect: () => ({ "toolkit.agents.total": 0, "toolkit.agents.created": 0 }),
  },

  // ── RBAC ───────────────────────────────────────

  rbac: {
    permissions: [
      { id: "agents.create", name: "Create Agents", description: "Create new agents", resource: "agent", actions: ["create"] },
      { id: "agents.delete", name: "Delete Agents", description: "Delete agents", resource: "agent", actions: ["delete"] },
      { id: "agents.edit", name: "Edit Agents", description: "Update agent prompts and configuration", resource: "agent", actions: ["update"] },
      { id: "agents.view", name: "View Agents", description: "View agent list and details", resource: "agent", actions: ["read"] },
    ],
    roles: [
      { id: "agent-admin", name: "Agent Admin", description: "Full agent management access", permissions: ["agents.create", "agents.delete", "agents.edit", "agents.view"] },
      { id: "agent-viewer", name: "Agent Viewer", description: "Read-only agent access", permissions: ["agents.view"] },
    ],
    defaultRole: "agent-admin",
  },

  // ── Tasks ──────────────────────────────────────

  tasks: [
    {
      id: "agent_health_check",
      name: "Agent Health Check",
      description: "Ping all agents and verify they are responsive.",
      priority: "medium",
      assignableToAgents: false,
      assignableToUsers: true,
    },
  ],

  // ── Tests ──────────────────────────────────────

  tests: {
    tests: [
      { id: "test_create_agent", name: "Create Agent", description: "Verify agent creation command", type: "unit", commandId: "create_agent" },
      { id: "test_ping_agent", name: "Ping Agent", description: "Verify agent ping returns healthy", type: "unit", commandId: "ping_agent" },
      { id: "test_delete_agent", name: "Delete Agent", description: "Verify agent deletion", type: "unit", commandId: "delete_agent" },
    ],
  },

  // ── Documentation ──────────────────────────────

  docs: {
    documents: [
      { id: "agents-readme", title: "Agent Management Overview", type: "readme", content: "# Agent Management\n\nCreate, configure, monitor, and remove AI agents.", order: 1 },
    ],
    readme: "# Agent Management Kit\n\nManage the full lifecycle of AI agents in your workspace.",
  },

  activity: { enabled: true },
};
