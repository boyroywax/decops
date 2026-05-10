/**
 * Job Queue toolkit module.
 */

import type { ToolkitModule } from "../types";
import {
  queueNewJobCommand,
  pauseQueueCommand,
  resumeQueueCommand,
  deleteQueuedJobCommand,
  listQueueCommand,
  listCatalogJobsCommand,
  saveJobDefinitionCommand,
  deleteJobDefinitionCommand,
} from "@/services/commands/definitions/jobs";

export const jobsModule: ToolkitModule = {
  manifest: {
    id: "jobs",
    name: "Job Queue",
    description:
      "Manage the execution queue — add, pause, resume, cancel jobs and manage the saved job catalog.",
    icon: "ListChecks",
    color: "#14b8a6",
    gradient: ["#14b8a6", "#2dd4bf"],
    category: "automation",
    status: "available",
    builtIn: true,
    tags: ["job", "system", "catalog", "query"],
    labels: { tier: "core", domain: "execution" },
    version: "1.0.0",
    author: { name: "decops", url: "https://decops.io" },
    license: "MIT",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
  commands: [
    queueNewJobCommand,
    pauseQueueCommand,
    resumeQueueCommand,
    deleteQueuedJobCommand,
    listQueueCommand,
    listCatalogJobsCommand,
    saveJobDefinitionCommand,
    deleteJobDefinitionCommand,
  ],
  tools: [],

  jobs: [
    {
      id: "batch_execute",
      name: "Batch Execute",
      description: "Execute multiple queued jobs in sequence.",
      inputs: [
        { name: "jobIds", type: "json", description: "Array of job IDs to execute", required: true },
      ],
      outputs: [
        { name: "results", type: "json", description: "Execution results per job" },
      ],
      timeout: 300000,
      retries: 1,
      tags: ["batch", "execution"],
    },
  ],

  automations: [
    {
      id: "jobs_retry_failed",
      name: "Auto-Retry Failed Jobs",
      description: "Automatically re-queue failed jobs after a cooldown.",
      trigger: { type: "event", event: "job.failed" },
      actions: [{ type: "command", target: "queue_new_job", args: { retry: true } }],
      enabled: false,
      cooldown: 30000,
      maxExecutions: 3,
    },
  ],

  collections: [
    {
      id: "job_runs",
      name: "Job Runs",
      description: "History of all job executions.",
      schema: [
        { name: "id", type: "string", required: true, unique: true, indexed: true },
        { name: "jobId", type: "string", required: true, indexed: true },
        { name: "status", type: "enum", enumValues: ["queued", "running", "completed", "failed", "cancelled"] },
        { name: "startedAt", type: "date" },
        { name: "completedAt", type: "date" },
        { name: "duration", type: "number" },
      ],
      primaryKey: "id",
      retention: { maxEntries: 5000, policy: "fifo" },
    },
  ],

  logging: {
    config: { minLevel: "info", maxEntries: 1000 },
    channels: [
      { id: "jobs.execution", name: "Job Execution", description: "Job start, progress, completion, and failure events" },
      { id: "jobs.queue", name: "Queue Activity", description: "Queue additions, pauses, and resumptions" },
    ],
  },

  notifications: {
    templates: [
      { id: "job_completed", name: "Job Completed", description: "Notify when a job completes", channel: "in-app", priority: "normal", event: "job.completed", template: "Job '{{jobName}}' completed in {{duration}}ms." },
      { id: "job_failed", name: "Job Failed", description: "Alert on job failure", channel: "in-app", priority: "high", event: "job.failed", template: "Job '{{jobName}}' failed: {{error}}" },
    ],
    channels: ["in-app", "webhook"],
  },

  metrics: {
    definitions: [
      { name: "toolkit.jobs.queued", description: "Jobs currently in queue", type: "gauge" },
      { name: "toolkit.jobs.completed", description: "Jobs completed (cumulative)", type: "counter" },
      { name: "toolkit.jobs.failed", description: "Jobs failed (cumulative)", type: "counter" },
      { name: "toolkit.jobs.avg_duration", description: "Average job duration (ms)", type: "gauge" },
    ],
    collect: () => ({ "toolkit.jobs.queued": 0, "toolkit.jobs.completed": 0, "toolkit.jobs.failed": 0, "toolkit.jobs.avg_duration": 0 }),
  },

  rbac: {
    permissions: [
      { id: "jobs.queue", name: "Queue Jobs", description: "Add jobs to the queue", resource: "job", actions: ["create"] },
      { id: "jobs.manage", name: "Manage Queue", description: "Pause, resume, and cancel jobs", resource: "job", actions: ["update", "delete"] },
      { id: "jobs.view", name: "View Queue", description: "View job queue and history", resource: "job", actions: ["read"] },
    ],
    roles: [
      { id: "jobs-admin", name: "Jobs Admin", description: "Full job queue access", permissions: ["jobs.queue", "jobs.manage", "jobs.view"] },
      { id: "jobs-viewer", name: "Jobs Viewer", description: "Read-only queue access", permissions: ["jobs.view"] },
    ],
    defaultRole: "jobs-admin",
  },

  configuration: {
    fields: [
      { key: "maxConcurrent", label: "Max Concurrent Jobs", description: "Maximum number of jobs to execute in parallel", type: "number", defaultValue: 3 },
      { key: "retryOnFailure", label: "Retry on Failure", description: "Automatically retry failed jobs once", type: "boolean", defaultValue: false },
    ],
  },

  tests: {
    tests: [
      { id: "test_queue_job", name: "Queue Job", description: "Verify job queueing", type: "unit", commandId: "queue_new_job" },
      { id: "test_pause_resume", name: "Pause & Resume", description: "Verify queue pause/resume cycle", type: "integration" },
    ],
  },

  docs: {
    documents: [
      { id: "jobs-readme", title: "Job Queue Overview", type: "readme", content: "# Job Queue\n\nManage the execution queue for multi-step workflows.", order: 1 },
    ],
    readme: "# Job Queue Kit\n\nProvides job queuing, execution, retry, and catalog management.",
  },

  activity: { enabled: true },
};
