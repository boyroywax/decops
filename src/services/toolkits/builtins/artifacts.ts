/**
 * Artifacts toolkit module.
 */

import type { ToolkitModule } from "../types";
import {
  createArtifactCommand,
  editArtifactCommand,
  tagArtifactCommand,
  deleteArtifactCommand,
  listArtifactsCommand,
  searchArtifactsCommand,
  exportArtifactCommand,
} from "@/services/commands/definitions/artifact";

export const artifactsModule: ToolkitModule = {
  manifest: {
    id: "artifacts",
    name: "Artifacts",
    description:
      "Create, edit, tag, delete, list, and search text-based artifacts (Markdown, Code, JSON, Plain Text).",
    icon: "FileText",
    color: "#60a5fa",
    gradient: ["#60a5fa", "#93c5fd"],
    category: "data",
    status: "available",
    builtIn: true,
    tags: ["artifact", "content", "create", "edit", "query", "search", "export"],
    labels: { tier: "core", domain: "data" },
    version: "1.0.0",
    author: { name: "decops", url: "https://decops.io" },
    license: "MIT",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
  commands: [
    createArtifactCommand,
    editArtifactCommand,
    tagArtifactCommand,
    deleteArtifactCommand,
    listArtifactsCommand,
    searchArtifactsCommand,
    exportArtifactCommand,
  ],
  // Curated direct LLM tools — content authoring + discovery. Delete /
  // export / tag stay reachable via create_job.
  tools: [
    {
      id: "artifacts.create",
      name: "Create Artifact",
      description: "Create a text artifact (markdown, code, JSON, plain text).",
      commandId: "create_artifact",
    },
    {
      id: "artifacts.edit",
      name: "Edit Artifact",
      description: "Edit the content of an existing artifact.",
      commandId: "edit_artifact",
    },
    {
      id: "artifacts.list",
      name: "List Artifacts",
      description: "List artifacts in the workspace, optionally filtered.",
      commandId: "list_artifacts",
    },
    {
      id: "artifacts.search",
      name: "Search Artifacts",
      description: "Full-text search across artifacts.",
      commandId: "search_artifacts",
    },
  ],

  collections: [
    {
      id: "artifacts",
      name: "Artifacts",
      description: "Text-based artifacts stored in the workspace.",
      schema: [
        { name: "id", type: "string", required: true, unique: true, indexed: true },
        { name: "title", type: "string", required: true },
        { name: "content", type: "string", required: true },
        { name: "format", type: "enum", enumValues: ["markdown", "code", "json", "text"], required: true },
        { name: "tags", type: "array" },
        { name: "createdAt", type: "date" },
        { name: "updatedAt", type: "date" },
      ],
      primaryKey: "id",
      indexes: [{ fields: ["format"], name: "idx_format" }],
    },
  ],

  logging: {
    config: { minLevel: "info", maxEntries: 500 },
    channels: [
      { id: "artifacts.crud", name: "Artifact CRUD", description: "Create, update, delete events on artifacts" },
    ],
  },

  notifications: {
    templates: [
      { id: "artifact_created", name: "Artifact Created", description: "Notify when an artifact is created", channel: "in-app", priority: "low", event: "artifact.created", template: "Artifact '{{title}}' created ({{format}})." },
    ],
    channels: ["in-app"],
  },

  metrics: {
    definitions: [
      { name: "toolkit.artifacts.total", description: "Total artifacts in workspace", type: "gauge" },
      { name: "toolkit.artifacts.created", description: "Artifacts created (cumulative)", type: "counter" },
    ],
    collect: () => ({ "toolkit.artifacts.total": 0, "toolkit.artifacts.created": 0 }),
  },

  rbac: {
    permissions: [
      { id: "artifacts.create", name: "Create Artifacts", description: "Create new artifacts", resource: "artifact", actions: ["create"] },
      { id: "artifacts.edit", name: "Edit Artifacts", description: "Edit existing artifacts", resource: "artifact", actions: ["update"] },
      { id: "artifacts.delete", name: "Delete Artifacts", description: "Delete artifacts", resource: "artifact", actions: ["delete"] },
      { id: "artifacts.view", name: "View Artifacts", description: "List and search artifacts", resource: "artifact", actions: ["read"] },
    ],
    roles: [
      { id: "artifacts-admin", name: "Artifacts Admin", description: "Full artifact management", permissions: ["artifacts.create", "artifacts.edit", "artifacts.delete", "artifacts.view"] },
      { id: "artifacts-viewer", name: "Artifacts Viewer", description: "Read-only artifact access", permissions: ["artifacts.view"] },
    ],
    defaultRole: "artifacts-admin",
  },

  tests: {
    tests: [
      { id: "test_create_artifact", name: "Create Artifact", description: "Verify artifact creation", type: "unit", commandId: "create_artifact" },
      { id: "test_search_artifacts", name: "Search Artifacts", description: "Verify artifact search", type: "unit", commandId: "search_artifacts" },
    ],
  },

  docs: {
    documents: [
      { id: "artifacts-readme", title: "Artifacts Overview", type: "readme", content: "# Artifacts\n\nCreate, edit, tag, and search text-based artifacts.", order: 1 },
    ],
    readme: "# Artifacts Kit\n\nManage text-based content artifacts (Markdown, Code, JSON, Plain Text).",
  },

  activity: { enabled: true },
};
