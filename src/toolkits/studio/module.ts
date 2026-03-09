/**
 * Studio (Visual Job Editor) toolkit module.
 *
 * Facets: metadata, commands, tools, agents, ui, jobs, automations,
 *         tasks, configuration, metrics, logging, notifications,
 *         rbac, tests, docs, activity
 */

import type { ToolkitModule } from "@/services/toolkits/types";
import {
  studioGetStateCommand,
  studioSetJobMetaCommand,
  studioAddStepCommand,
  studioRemoveStepCommand,
  studioSetStepArgsCommand,
  studioAddParallelGroupCommand,
  studioSetStepConditionCommand,
  studioSetInputBindingsCommand,
  studioSetOutputMappingsCommand,
  studioAddDeliverableCommand,
  studioRemoveDeliverableCommand,
  studioAddStorageCommand,
  studioRemoveStorageCommand,
  studioAddInputCommand,
  studioRemoveInputCommand,
  studioUpdateInputCommand,
  studioSaveJobCommand,
  studioRunJobCommand,
  studioLoadJobCommand,
  studioClearCanvasCommand,
  studioCreateJobCommand,
  studioAddTriggerCommand,
  studioRemoveTriggerCommand,
  studioAutoLayoutCommand,
} from "@/toolkits/studio/commands";

export const studioModule: ToolkitModule = {
  manifest: {
    id: "studio",
    name: "Studio",
    description:
      "Build multi-step jobs on the Studio canvas — add steps, deliverables, inputs, storage, triggers, and lifecycle commands.",
    icon: "Clapperboard",
    color: "#8b5cf6",
    gradient: ["#8b5cf6", "#a78bfa"],
    category: "automation",
    status: "available",
    builtIn: true,
    tags: [
      "studio",
      "job",
      "step",
      "deliverable",
      "trigger",
      "automation",
      "bot",
      "layout",
      "sub-agent",
      "canvas",
    ],
    labels: { tier: "core", domain: "automation", hasApp: "true" },
    version: "1.0.0",
    author: { name: "decops", url: "https://decops.io" },
    license: "MIT",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
  commands: [
    studioGetStateCommand,
    studioSetJobMetaCommand,
    studioAddStepCommand,
    studioRemoveStepCommand,
    studioSetStepArgsCommand,
    studioAddParallelGroupCommand,
    studioSetStepConditionCommand,
    studioSetInputBindingsCommand,
    studioSetOutputMappingsCommand,
    studioAddDeliverableCommand,
    studioRemoveDeliverableCommand,
    studioAddStorageCommand,
    studioRemoveStorageCommand,
    studioAddInputCommand,
    studioRemoveInputCommand,
    studioUpdateInputCommand,
    studioSaveJobCommand,
    studioRunJobCommand,
    studioLoadJobCommand,
    studioClearCanvasCommand,
    studioCreateJobCommand,
    studioAddTriggerCommand,
    studioRemoveTriggerCommand,
    studioAutoLayoutCommand,
  ],
  tools: [
    {
      id: "studio_bot_delegate",
      name: "Delegate to Studio Bot",
      description:
        "Send a natural language instruction to the Studio Bot sub-agent. It will plan, execute, and layout studio operations automatically.",
      inputSchema: {
        instruction: {
          type: "string",
          description:
            "Natural language instruction for the Studio Bot (e.g. 'build a 3-step research pipeline')",
          required: true,
        },
      },
    },
    {
      id: "studio_bot_analyze",
      name: "Analyze Canvas Layout",
      description:
        "Run a layout analysis on the current Studio canvas to detect overlaps, orphans, and positioning issues.",
      inputSchema: {},
    },
    {
      id: "studio_bot_auto_layout",
      name: "Auto-Layout Canvas",
      description:
        "Recompute all step positions to fix overlapping/stacking issues.",
      inputSchema: {},
    },
  ],
  agents: [
    {
      id: "studio-bot",
      name: "Studio Bot",
      description:
        "Specialized AI sub-agent for canvas management — handles job creation, layout, workflow design, and data flow wiring.",
      capabilities: [
        "Job creation",
        "Canvas layout",
        "Workflow design",
        "Data flow wiring",
        "Layout analysis",
        "Auto-positioning",
      ],
      status: "active",
      aieos: {
        standard: {
          protocol: "AIEOS",
          version: "1.2.0",
          schema_url: "https://aieos.org/schema/v1.2.0/entity.json",
        },
        metadata: {
          instance_id: "studio-bot-001",
          instance_version: "1.0.0",
          generator: "decops-platform",
          created_at: "2025-01-01T00:00:00Z",
          last_updated: "2025-01-01T00:00:00Z",
          entity_id: "studio-bot",
          alias: "Studio Bot",
        },
        capabilities: {
          skills: [
            {
              name: "job_creation",
              description:
                "Build multi-step job definitions from natural language",
            },
            {
              name: "canvas_layout",
              description:
                "Position and auto-layout nodes on the Studio canvas",
            },
            {
              name: "workflow_design",
              description:
                "Design DAG-based workflows with conditions and bindings",
            },
            {
              name: "data_flow_wiring",
              description:
                "Connect inputs, outputs, and storage between steps",
            },
            {
              name: "layout_analysis",
              description:
                "Detect overlaps, orphans, and positioning issues",
            },
          ],
        },
        identity: {
          names: { first: "Studio", last: "Bot", nickname: "Stu" },
          bio: { gender: "non-binary" },
        },
        psychology: {
          traits: { mbti: "ISTP", temperament: "methodical" },
          moral_compass: {
            core_values: ["clarity", "automation", "craftsmanship"],
          },
        },
        linguistics: {
          text_style: {
            formality_level: 5,
            vocabulary_level: "technical",
            style_descriptors: ["concise", "helpful"],
          },
          idiolect: {
            catchphrases: [
              "Uses pipeline metaphors",
              "Numbers steps explicitly",
            ],
          },
        },
        motivations: {
          core_drive: "Build clean workflow DAGs",
          goals: {
            short_term: ["Eliminate canvas clutter"],
            long_term: ["Wire data flows correctly"],
          },
          fears: {
            rational: ["Orphaned steps", "Circular dependencies"],
          },
        },
      },
    },
  ],

  // ── 5. Jobs ───────────────────────────────────

  jobs: [
    {
      id: "studio_quick_pipeline",
      name: "Quick Pipeline",
      description: "Create a simple sequential pipeline with configurable step count.",
      inputs: [
        { name: "stepCount", type: "number", description: "Number of steps", required: true, defaultValue: 3 },
        { name: "name", type: "string", description: "Pipeline name", required: true },
      ],
      outputs: [
        { name: "jobId", type: "string", description: "Created job ID" },
      ],
      tags: ["pipeline", "quick-start"],
    },
  ],

  // ── 6. Automations ────────────────────────────

  automations: [
    {
      id: "studio_auto_layout_on_add",
      name: "Auto-Layout on Step Add",
      description: "Automatically re-layout the canvas when a new step is added.",
      trigger: { type: "event", event: "studio.step.added" },
      actions: [{ type: "command", target: "studio_auto_layout" }],
      enabled: false,
    },
    {
      id: "studio_save_on_change",
      name: "Auto-Save Draft",
      description: "Persist canvas state after every modification.",
      trigger: { type: "event", event: "studio.canvas.changed" },
      actions: [{ type: "command", target: "studio_save_job" }],
      enabled: true,
      cooldown: 5000,
    },
  ],

  // ── 7. Tasks ──────────────────────────────────

  tasks: [
    {
      id: "studio_review_workflow",
      name: "Review Workflow",
      description: "Review and validate a canvas workflow before execution.",
      priority: "medium",
      assignableToAgents: true,
      assignableToUsers: true,
      checklist: [
        { id: "check_steps", label: "All steps have valid commands", required: true },
        { id: "check_bindings", label: "Input/output bindings are wired", required: true },
        { id: "check_layout", label: "No overlapping nodes", required: false },
      ],
    },
  ],

  // ── 9. UI / UX ────────────────────────────────

  ui: {
    contributions: [
      { type: "page", id: "studio-canvas", label: "Studio", icon: "Clapperboard", viewId: "studio", order: 1, platforms: ["web"] },
      { type: "panel", id: "studio-steps", label: "Steps Panel", icon: "Layers", description: "Step inspector panel", platforms: ["web"] },
      { type: "menu-item", id: "studio-new-job", label: "New Job", icon: "Plus", description: "Create a new job on canvas" },
    ],
    app: {
      id: "studio",
      name: "Studio",
      platforms: ["web"],
      viewId: "studio",
      description: "Visual drag-and-connect canvas for composing multi-step jobs.",
    },
  },

  /** @deprecated Use ui.app */
  app: {
    id: "studio",
    name: "Studio",
    platforms: ["web"],
    viewId: "studio",
    description: "Visual drag-and-connect canvas for composing multi-step jobs.",
  },

  // ── 10. Configuration ─────────────────────────

  configuration: {
    fields: [
      { key: "autoLayout", label: "Auto-Layout", description: "Re-layout canvas automatically after adding steps", type: "boolean", defaultValue: true },
      { key: "autosaveDrafts", label: "Autosave Drafts", description: "Automatically save canvas state between sessions", type: "boolean", defaultValue: true },
    ],
  },

  // ── 11. Logging ───────────────────────────────

  logging: {
    config: { minLevel: "info", maxEntries: 500 },
    channels: [
      { id: "studio.canvas", name: "Canvas Events", description: "Step additions, removals, layout changes" },
      { id: "studio.execution", name: "Job Execution", description: "Job run lifecycle events" },
    ],
  },

  // ── 12. Notifications ─────────────────────────

  notifications: {
    templates: [
      { id: "studio_job_complete", name: "Job Complete", description: "Notify when a studio job finishes", channel: "in-app", priority: "normal", event: "studio.job.completed", template: "Job '{{jobName}}' completed successfully." },
      { id: "studio_job_failed", name: "Job Failed", description: "Notify when a studio job fails", channel: "in-app", priority: "high", event: "studio.job.failed", template: "Job '{{jobName}}' failed: {{error}}" },
    ],
    channels: ["in-app", "webhook"],
  },

  // ── 13. Metrics ───────────────────────────────

  metrics: {
    definitions: [
      { name: "toolkit.studio.steps_total", description: "Steps on the current canvas", type: "gauge" },
      { name: "toolkit.studio.jobs_saved", description: "Jobs saved to catalog (cumulative)", type: "counter" },
      { name: "toolkit.studio.jobs_run", description: "Jobs executed (cumulative)", type: "counter" },
    ],
    collect: () => ({ "toolkit.studio.steps_total": 0, "toolkit.studio.jobs_saved": 0, "toolkit.studio.jobs_run": 0 }),
  },

  // ── 14. RBAC ──────────────────────────────────

  rbac: {
    permissions: [
      { id: "studio.canvas.view", name: "View Canvas", description: "View the studio canvas", resource: "canvas", actions: ["read"] },
      { id: "studio.canvas.edit", name: "Edit Canvas", description: "Add, remove, and modify steps", resource: "canvas", actions: ["create", "update", "delete"] },
      { id: "studio.job.execute", name: "Execute Jobs", description: "Run jobs from the canvas", resource: "job", actions: ["execute"] },
    ],
    roles: [
      { id: "studio-viewer", name: "Studio Viewer", description: "Read-only access to the canvas", permissions: ["studio.canvas.view"] },
      { id: "studio-editor", name: "Studio Editor", description: "Full canvas editing access", permissions: ["studio.canvas.view", "studio.canvas.edit", "studio.job.execute"] },
    ],
    defaultRole: "studio-editor",
  },

  // ── 15. Tests ─────────────────────────────────

  tests: {
    tests: [
      { id: "test_add_step", name: "Add Step", description: "Verify step addition to canvas", type: "unit", commandId: "studio_add_step" },
      { id: "test_auto_layout", name: "Auto-Layout", description: "Verify auto-layout produces non-overlapping positions", type: "unit", commandId: "studio_auto_layout" },
      { id: "test_save_run_cycle", name: "Save & Run Cycle", description: "End-to-end save and run workflow", type: "e2e" },
    ],
  },

  // ── 16. Documentation ─────────────────────────

  docs: {
    documents: [
      { id: "studio-readme", title: "Studio Overview", type: "readme", content: "# Studio\n\nVisual drag-and-connect canvas for composing multi-step jobs.", order: 1 },
      { id: "studio-guide", title: "Getting Started with Studio", type: "guide", content: "## Quick Start\n\n1. Open Studio from the sidebar\n2. Create a new job\n3. Add steps and wire data flows\n4. Save and run", order: 2 },
    ],
    readme: "# Studio Kit\n\nThe Studio toolkit provides a visual job editor for building multi-step automation workflows.",
  },

  // ── Activity ──────────────────────────────────

  activity: { enabled: true },
};
