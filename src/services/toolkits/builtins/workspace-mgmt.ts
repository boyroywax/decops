/**
 * Workspaces toolkit module.
 */

import type { ToolkitModule } from "../types";
import {
  createWorkspaceCommand,
  switchWorkspaceCommand,
  deleteWorkspaceCommand,
  duplicateWorkspaceCommand,
  editWorkspaceCommand,
  exportWorkspaceCommand,
} from "@/services/commands/definitions/workspace";
import {
  setApiKeyCommand,
  selectAiModelCommand,
} from "@/services/commands/definitions/system";

export const workspaceMgmtModule: ToolkitModule = {
  manifest: {
    id: "workspace-mgmt",
    name: "Workspaces",
    description:
      "Create, switch, duplicate, edit, and delete workspaces. Configure API keys and select AI models.",
    icon: "FolderOpen",
    color: "#f59e0b",
    gradient: ["#f59e0b", "#fbbf24"],
    category: "system",
    status: "available",
    builtIn: true,
    tags: ["workspace", "system", "config", "security", "export"],
    labels: { tier: "core", domain: "system" },
    version: "1.0.0",
    author: { name: "decops", url: "https://decops.io" },
    license: "MIT",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
  commands: [
    createWorkspaceCommand,
    switchWorkspaceCommand,
    deleteWorkspaceCommand,
    duplicateWorkspaceCommand,
    editWorkspaceCommand,
    exportWorkspaceCommand,
    setApiKeyCommand,
    selectAiModelCommand,
  ],
  // No curated direct LLM tools — workspace lifecycle ops are
  // user-initiated. Agents that genuinely need them can still reach the
  // safe ones (create / switch / export) via create_job. Sensitive ops
  // (set_api_key, select_ai_model, reset_workspace) are already in
  // SYSTEM_RESERVED / EXCLUDED and cannot be invoked through create_job.
  tools: [],

  collections: [
    {
      id: "workspaces",
      name: "Workspaces",
      description: "All workspaces managed by the platform.",
      schema: [
        { name: "id", type: "string", required: true, unique: true, indexed: true },
        { name: "name", type: "string", required: true },
        { name: "description", type: "string" },
        { name: "createdAt", type: "date" },
        { name: "updatedAt", type: "date" },
      ],
      primaryKey: "id",
    },
  ],

  logging: {
    config: { minLevel: "info", maxEntries: 300 },
    channels: [
      { id: "workspace.lifecycle", name: "Workspace Lifecycle", description: "Create, switch, delete, and duplicate events" },
      { id: "workspace.config", name: "Config Changes", description: "API key and model selection changes" },
    ],
  },

  notifications: {
    templates: [
      { id: "workspace_created", name: "Workspace Created", description: "Notify when a workspace is created", channel: "in-app", priority: "normal", event: "workspace.created", template: "Workspace '{{name}}' has been created." },
      { id: "workspace_switched", name: "Workspace Switched", description: "Notify on workspace switch", channel: "in-app", priority: "low", event: "workspace.switched", template: "Switched to workspace '{{name}}'." },
    ],
    channels: ["in-app"],
  },

  rbac: {
    permissions: [
      { id: "workspace.create", name: "Create Workspaces", description: "Create new workspaces", resource: "workspace", actions: ["create"] },
      { id: "workspace.delete", name: "Delete Workspaces", description: "Delete workspaces", resource: "workspace", actions: ["delete"] },
      { id: "workspace.config", name: "Configure Workspace", description: "Set API keys and models", resource: "workspace", actions: ["update"] },
      { id: "workspace.view", name: "View Workspaces", description: "View workspace list", resource: "workspace", actions: ["read"] },
    ],
    roles: [
      { id: "workspace-admin", name: "Workspace Admin", description: "Full workspace access", permissions: ["workspace.create", "workspace.delete", "workspace.config", "workspace.view"] },
      { id: "workspace-user", name: "Workspace User", description: "Use and view workspaces", permissions: ["workspace.view"] },
    ],
    defaultRole: "workspace-admin",
  },

  configuration: {
    fields: [
      { key: "autoSave", label: "Auto-Save", description: "Auto-persist workspace state on every change", type: "boolean", defaultValue: true },
    ],
  },

  tests: {
    tests: [
      { id: "test_create_workspace", name: "Create Workspace", description: "Verify workspace creation", type: "unit", commandId: "create_workspace" },
      { id: "test_switch_workspace", name: "Switch Workspace", description: "Verify workspace switching", type: "unit", commandId: "switch_workspace" },
    ],
  },

  docs: {
    documents: [
      { id: "workspace-readme", title: "Workspaces Overview", type: "readme", content: "# Workspaces\n\nCreate, switch, and manage isolated workspaces.", order: 1 },
    ],
    readme: "# Workspaces Kit\n\nManage workspaces, API keys, and AI model selection.",
  },

  activity: { enabled: true },
};
