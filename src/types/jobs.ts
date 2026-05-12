/**
 * Job-related types: steps, definitions, triggers, inputs, artifacts.
 * Extracted from types/index.ts for modularity.
 */

export type JobStatus = "queued" | "running" | "completed" | "failed" | "awaiting-input";

export type ArtifactType = "markdown" | "json" | "yaml" | "csv" | "image" | "code" | "txt";

/** Lifecycle event types that are recorded in a job's timeline. */
export type JobEventKind =
  | "created"
  | "started"
  | "step:started"
  | "step:completed"
  | "step:failed"
  | "step:skipped"
  | "awaiting-input"
  | "input-received"
  | "completed"
  | "failed"
  | "stopped";

/** A single traceable event in the job's lifecycle. */
export interface JobEvent {
  /** When this event occurred (epoch ms) */
  timestamp: number;
  /** The kind of lifecycle event */
  kind: JobEventKind;
  /** Human-readable label (e.g. "Step: Fetch Data started") */
  label: string;
  /** Optional reference to a step ID */
  stepId?: string;
  /** Optional additional detail (error message, result summary, input value) */
  detail?: string;
  /** Duration in ms (for completed/failed events that have a start counterpart) */
  duration?: number;
}

export interface JobArtifact {
  id: string;
  type: ArtifactType;
  content?: string;
  url?: string;
  name: string;
  tags?: string[];
  createdAt?: number;
  description?: string;
  source?: "job" | "import" | "command" | "user";
}

/**
 * Action hook that fires after a step succeeds or fails.
 * Supports running a follow-up command, writing to storage, logging,
 * and controlling execution flow.
 */
export interface StepHandler {
  /** Command to execute as a reaction (optional) */
  commandId?: string;
  /** Args for the handler command — supports $storage.*, $result.*, $error.* refs */
  args?: Record<string, any>;
  /** Key→value pairs to write into shared storage */
  setStorage?: Record<string, any>;
  /** Message to add to the job log */
  log?: string;
  /** (onFailure only) If true, swallow the error and continue to next step */
  continueOnFailure?: boolean;
  /** (onSuccess only) If true, halt the job after this step — skip remaining steps */
  haltAfterSuccess?: boolean;
}

export interface JobStep {
  id: string;
  commandId: string;
  args: Record<string, any>;
  name?: string;
  status?: "pending" | "running" | "completed" | "failed" | "skipped";
  result?: string;
  /** When this step started executing (epoch ms) */
  startedAt?: number;
  /** When this step finished executing (epoch ms) */
  completedAt?: number;
  condition?: string;
  modelId?: string;
  /** Action hook that runs when this step completes successfully */
  onSuccess?: StepHandler;
  /** Action hook that runs when this step fails */
  onFailure?: StepHandler;
  outputMappings?: Array<{
    outputKey: string;
    target: "storage" | "deliverable";
    targetKey: string;
  }>;
  inputBindings?: Record<string, {
    source: "storage" | "deliverable";
    sourceKey: string;
  }>;
}

/** A named deliverable the job is expected to produce */
export interface JobDeliverable {
  key: string;
  label: string;
  type: ArtifactType;
  description?: string;
  /** Override the default storage key (`_deliverable_<key>`) to pull content from */
  sourceStorageKey?: string;
}

/**
 * How an input node resolves its value at runtime.
 */
export type InputSourceKind = "prompt" | "storage" | "hardcoded" | "artifact";

export type InputSource =
  | { kind: "prompt";    promptText?: string }
  | { kind: "storage";   storageKey: string; path?: string }
  | { kind: "hardcoded"; value: string }
  | { kind: "artifact";  artifactId?: string; tag?: string };

/** A named entity input that maps a friendly name to an entity ID or user-provided value */
export interface EntityInput {
  name: string;
  type: "agent" | "channel" | "group" | "network" | "text" | "number_range" | "list";
  entityId: string;
  source?: InputSource;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  multiSelect?: boolean;
}

/**
 * Workspace event types that can trigger automatic job execution.
 */
export type TriggerEvent =
  | "artifact:created"   | "artifact:updated"  | "artifact:deleted"
  | "agent:created"      | "agent:updated"
  | "group:created"      | "group:updated"
  | "channel:created"    | "channel:updated"
  | "network:created"    | "network:updated"
  | "job:completed"      | "job:failed"
  | "schedule:cron";

/** A single trigger rule that can fire a job automatically. */
export interface JobTrigger {
  id: string;
  event: TriggerEvent;
  enabled: boolean;
  filter?: {
    entityId?: string;
    tag?: string;
    name?: string;
  };
  cron?: string;
  label?: string;
}

export interface JobDefinition {
  id: string;
  name: string;
  description: string;
  mode: 'serial' | 'parallel' | 'mixed';
  icon?: string;
  steps: JobStep[];
  deliverables?: JobDeliverable[];
  storageDefaults?: Record<string, any>;
  inputDefaults?: EntityInput[];
  parallelGroups?: Array<{ id: string; label: string; stepIds: string[] }>;
  triggers?: JobTrigger[];
  createdAt: number;
  updatedAt: number;
}

/** Information shown while a job is paused waiting for user input. */
export interface JobPendingPrompt {
  inputName: string;
  promptText: string;
  inputType: EntityInput['type'];
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}

/** Fields shared by every Job regardless of status. */
export interface JobBase {
  id: string;
  type: string;
  request: Record<string, any>;
  artifacts: JobArtifact[];
  createdAt: number;
  updatedAt: number;
  /** When the job actually began executing (epoch ms) — distinct from createdAt */
  startedAt?: number;
  /** Ordered timeline of lifecycle events for full traceability */
  timeline?: JobEvent[];
  jobDefinitionId?: string;
  steps?: JobStep[];
  currentStepIndex?: number;
  stepResults?: Record<string, any>;
  mode?: 'serial' | 'parallel' | 'mixed';
  storage?: Record<string, any>;
  deliverables?: JobDeliverable[];
  inputs?: EntityInput[];
  parallelGroups?: Array<{ id: string; label: string; stepIds: string[] }>;
  dryRun?: boolean;
}

/**
 * A Job is a discriminated union on `status`:
 *  - "queued" | "running": no terminal data
 *  - "awaiting-input": carries a `pendingPrompt` describing what user input is required
 *  - "completed" | "failed": carries `completedAt` (and may carry `result`)
 *
 * Terminal-only and prompt-only fields are deliberately absent from non-matching
 * variants so consumers must narrow on `status` before accessing them.
 */
export type Job =
  | (JobBase & { status: "queued" | "running"; result?: undefined; completedAt?: undefined; pendingPrompt?: undefined })
  | (JobBase & { status: "awaiting-input"; pendingPrompt: JobPendingPrompt; result?: undefined; completedAt?: undefined })
  | (JobBase & { status: "completed"; completedAt: number; result?: string; pendingPrompt?: undefined })
  | (JobBase & { status: "failed"; completedAt: number; result?: string; pendingPrompt?: undefined });
