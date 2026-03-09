/**
 * ToolkitModule — OCI-compliant, modular, hot-loadable toolkit (kit) system.
 *
 * A kit is a self-contained plugin composed of up to 17 standardized facets:
 *
 *   ┌─────────────────┬──────────────────────────────────────────────────────┐
 *   │ Facet           │ Description                                          │
 *   ├─────────────────┼──────────────────────────────────────────────────────┤
 *   │ metadata        │ Identity, author, version, dependencies, OCI digest  │
 *   │ commands        │ Basic process actions (CommandRegistry)               │
 *   │ tools           │ MCP / function-calling schemas                        │
 *   │ agents          │ Sub-agents (AIEOS entities)                           │
 *   │ jobs            │ Pre-defined job templates with steps & I/O            │
 *   │ automations     │ Triggers, schedules, event-driven workflows           │
 *   │ tasks           │ Assignable work items for users or agents             │
 *   │ collections     │ Managed data schemas (entities, artifacts)            │
 *   │ ui              │ Pages, panels, cards, menu items, icons, theme        │
 *   │ configuration   │ Per-kit settings exposed in the config UI             │
 *   │ logging         │ Structured logs with channel pub/sub                  │
 *   │ notifications   │ Multi-channel alerts & preferences                    │
 *   │ metrics         │ Observable gauges (OpenTelemetry-compatible)           │
 *   │ rbac            │ Roles, permissions, access control                    │
 *   │ tests           │ Test suites & assertions                              │
 *   │ docs            │ Documentation, guides, changelogs                     │
 *   │ api             │ Server-side HTTP endpoints                            │
 *   └─────────────────┴──────────────────────────────────────────────────────┘
 *
 * Kits are OCI-compliant artifacts — each facet maps to an OCI layer so that
 * kits can be pushed to / pulled from any OCI-compatible registry (Harbor,
 * GitHub Packages, Docker Hub, etc.) and versioned with semver + content-
 * addressable digests.
 *
 * Every toolkit (built-in or third-party) implements the `ToolkitModule`
 * interface so the platform can register it at startup or hot-load/unload
 * it at runtime.
 */

import type {
  ToolkitId,
  ToolkitCategory,
  ToolkitTool,
  ToolkitAgent,
} from "@/types";
import type { CommandDefinition } from "@/services/commands/types";
import type { CommandRegistry } from "@/services/commands/registry";

// ═══════════════════════════════════════════════════
//  OCI (Open Container Initiative) Packaging
// ═══════════════════════════════════════════════════

/** All recognized facets that a kit can contribute. */
export type ToolkitFacet =
  | "metadata"
  | "commands"
  | "tools"
  | "agents"
  | "jobs"
  | "automations"
  | "tasks"
  | "collections"
  | "ui"
  | "configuration"
  | "logging"
  | "notifications"
  | "metrics"
  | "rbac"
  | "tests"
  | "docs"
  | "api";

/**
 * OCI content descriptor — identifies a blob of content by digest.
 *
 * @see https://github.com/opencontainers/image-spec/blob/main/descriptor.md
 */
export interface OCIDescriptor {
  /** MIME type of the referenced content. */
  mediaType: string;
  /** Content-addressable digest (e.g. "sha256:abc123…"). */
  digest: string;
  /** Size of the referenced content in bytes. */
  size: number;
  /** Optional annotations (OCI spec §descriptor). */
  annotations?: Record<string, string>;
}

/**
 * OCI layer — a single content blob within a kit artifact.
 * Each facet is serialized into its own layer so registries can
 * pull/push selectively.
 */
export interface OCILayer extends OCIDescriptor {
  /** Which kit facet this layer encodes. */
  facet?: ToolkitFacet;
}

/**
 * OCI artifact manifest for a kit package.
 *
 * @see https://github.com/opencontainers/image-spec/blob/main/manifest.md
 */
export interface OCIArtifactManifest {
  /** Must be 2 per the OCI image spec. */
  schemaVersion: 2;
  /** Artifact media type — custom for decops kits. */
  mediaType: "application/vnd.decops.kit.manifest.v1+json";
  /** Config descriptor — contains the ToolkitManifest JSON. */
  config: OCIDescriptor;
  /** One layer per facet included in this kit. */
  layers: OCILayer[];
  /** OCI annotations (org.opencontainers.image.* keys). */
  annotations?: Record<string, string>;
}

/**
 * Registry coordinates for pushing / pulling a kit artifact.
 */
export interface OCIReference {
  /** Registry hostname (e.g. "registry.example.com"). */
  registry: string;
  /** Repository path (e.g. "decops/kits/studio"). */
  repository: string;
  /** Tag or digest (e.g. "1.2.0" or "sha256:…"). */
  reference: string;
}

// ═══════════════════════════════════════════════════
//  1. Metadata / Manifest
// ═══════════════════════════════════════════════════

/** Author / maintainer of a toolkit. */
export interface ToolkitAuthor {
  /** Display name of the author. */
  name: string;
  /** Contact email. */
  email?: string;
  /** Homepage or profile URL. */
  url?: string;
}

/** Dependency on another kit. */
export interface ToolkitDependency {
  /** Target kit identifier. */
  id: ToolkitId | string;
  /**
   * Semver range (e.g. "^1.0.0", ">=2.1.0").
   * When `minimumVersion` is provided this becomes a shorthand alias for it.
   */
  version: string;
  /** If true, the dependency is optional (won't block registration). */
  optional?: boolean;

  // ── Version tiers ─────────────────────────────
  // Toolkit dependencies can declare three version tiers so that the
  // platform can warn on stale dependencies and recommend upgrades.

  /**
   * Minimum compatible version — the kit **will not load** if the
   * dependency is older than this.  Follows semver range syntax.
   */
  minimumVersion?: string;
  /**
   * Recommended version — the version the author tested against and
   * considers stable.  The platform may display a soft warning when
   * the installed dependency is below this but above `minimumVersion`.
   */
  recommendedVersion?: string;
  /**
   * Latest known version — informational; used by the UI to show
   * available upgrade paths and by the OCI resolver to pull the
   * newest compatible release.
   */
  latestVersion?: string;
}

/** Static metadata that describes a toolkit to the UI and AI system. */
export interface ToolkitManifest {
  /** Unique identifier (must be globally unique within a registry). */
  id: ToolkitId;
  /** Human-readable display name. */
  name: string;
  /** Short prose description of what the kit does. */
  description: string;
  /** Lucide icon name used in the UI. */
  icon: string;
  /** Primary brand color (hex). */
  color: string;
  /** Two-stop gradient used for badges/headers. */
  gradient: [string, string];
  /** Logical grouping in the toolkit catalog. */
  category: ToolkitCategory;
  /** Availability status. */
  status: "available" | "coming-soon" | "deprecated";
  /** True for toolkits shipped with the platform. */
  builtIn?: boolean;
  /** Free-form searchable tags. */
  tags?: string[];
  /**
   * Structured key-value labels for filtering and selection (Kubernetes-style).
   * e.g. `{ "tier": "core", "domain": "messaging", "owner": "platform-team" }`
   */
  labels?: Record<string, string>;
  /**
   * Unstructured key-value annotations for non-identifying metadata.
   * e.g. `{ "docs": "https://…", "changelog": "https://…" }`
   */
  annotations?: Record<string, string>;

  // ── OCI / Versioning ───────────────────────────

  /** Semantic version (required — follows semver). */
  version: string;
  /** Author / maintainer. */
  author?: ToolkitAuthor;
  /** SPDX license identifier (e.g. "MIT", "Apache-2.0"). */
  license?: string;
  /** Source repository URL. */
  repository?: string;
  /** Homepage / documentation site. */
  homepage?: string;
  /** ISO-8601 creation timestamp. */
  createdAt?: string;
  /** ISO-8601 last-updated timestamp. */
  updatedAt?: string;
  /** OCI content-addressable digest (populated when packed). */
  digest?: string;
  /** Other kits this kit depends on. */
  dependencies?: ToolkitDependency[];
  /** Minimum platform version required to load this kit. */
  minPlatformVersion?: string;
}

// ═══════════════════════════════════════════════════
//  2. Commands  (existing — unchanged)
// ═══════════════════════════════════════════════════
// CommandDefinition is imported from @/services/commands/types

// ═══════════════════════════════════════════════════
//  3. Tools  (existing — imported from @/types)
// ═══════════════════════════════════════════════════
// ToolkitTool is imported from @/types

// ═══════════════════════════════════════════════════
//  4. Agents  (existing — imported from @/types)
// ═══════════════════════════════════════════════════
// ToolkitAgent is imported from @/types

// ═══════════════════════════════════════════════════
//  5. Jobs
// ═══════════════════════════════════════════════════

/** An input parameter for a job template. */
export interface ToolkitJobInput {
  /** Parameter name. */
  name: string;
  /** Value type. */
  type: "string" | "number" | "boolean" | "file" | "json";
  /** Human-readable description. */
  description?: string;
  /** Whether the input must be provided. */
  required?: boolean;
  /** Fallback value if not supplied. */
  defaultValue?: unknown;
}

/** An output declaration for a job template. */
export interface ToolkitJobOutput {
  /** Output variable name. */
  name: string;
  /** Value type. */
  type: "string" | "number" | "boolean" | "file" | "json";
  /** Human-readable description. */
  description?: string;
}

/** A single step inside a job template. */
export interface ToolkitJobStep {
  /** Step identifier (unique within the job). */
  id: string;
  /** Display name. */
  name: string;
  /** Command to execute (by ID). */
  commandId?: string;
  /** Tool to invoke (by ID). */
  toolId?: string;
  /** Static arguments for the step. */
  args?: Record<string, unknown>;
  /** CEL/expression — step is skipped when falsy. */
  condition?: string;
  /** Step IDs that must complete before this step runs. */
  dependsOn?: string[];
}

/**
 * A pre-defined, reusable job template.
 * Job templates declaratively describe a multi-step workflow that can be
 * instantiated and executed via the Job Queue.
 */
export interface ToolkitJobTemplate {
  /** Unique identifier (within this kit). */
  id: string;
  /** Display name. */
  name: string;
  /** Human-readable description. */
  description: string;
  /** Ordered steps — executed respecting `dependsOn` DAG. */
  steps?: ToolkitJobStep[];
  /** Input parameters required to run this job. */
  inputs?: ToolkitJobInput[];
  /** Outputs produced by this job. */
  outputs?: ToolkitJobOutput[];
  /** Maximum execution time in milliseconds. */
  timeout?: number;
  /** Number of automatic retries on failure. */
  retries?: number;
  /** Searchable tags. */
  tags?: string[];
}

// ═══════════════════════════════════════════════════
//  6. Automations
// ═══════════════════════════════════════════════════

/** Trigger type for an automation rule. */
export type AutomationTriggerType =
  | "event"
  | "schedule"
  | "webhook"
  | "manual"
  | "condition";

/** Defines when an automation fires. */
export interface AutomationTrigger {
  /** How the automation is triggered. */
  type: AutomationTriggerType;
  /** Event name — required when `type` is "event". */
  event?: string;
  /** Cron expression — required when `type` is "schedule". */
  cron?: string;
  /** Webhook path — required when `type` is "webhook". */
  webhookPath?: string;
  /** Boolean expression — required when `type` is "condition". */
  condition?: string;
}

/** An action performed when an automation fires. */
export interface AutomationAction {
  /** What kind of action to take. */
  type: "command" | "job" | "notification" | "webhook" | "script";
  /** Target identifier (command ID, job template ID, webhook URL, etc.). */
  target: string;
  /** Arguments passed to the target. */
  args?: Record<string, unknown>;
  /** CEL/expression guard — action is skipped when falsy. */
  condition?: string;
}

/**
 * An automation rule — event-driven or scheduled workflow.
 * Automations connect triggers to actions declaratively.
 */
export interface ToolkitAutomation {
  /** Unique identifier (within this kit). */
  id: string;
  /** Display name. */
  name: string;
  /** Human-readable description. */
  description: string;
  /** What fires this automation. */
  trigger: AutomationTrigger;
  /** Ordered actions to execute when triggered. */
  actions: AutomationAction[];
  /** Whether this automation is active. */
  enabled?: boolean;
  /** Minimum cooldown between executions in milliseconds. */
  cooldown?: number;
  /** Maximum total executions (0 = unlimited). */
  maxExecutions?: number;
}

// ═══════════════════════════════════════════════════
//  7. Tasks
// ═══════════════════════════════════════════════════

/** Priority level for a task. */
export type TaskPriority = "low" | "medium" | "high" | "critical";

/** Lifecycle status of a task instance. */
export type TaskStatus =
  | "pending"
  | "assigned"
  | "in-progress"
  | "review"
  | "completed"
  | "cancelled";

/** A single item in a task checklist. */
export interface TaskChecklistItem {
  /** Item identifier. */
  id: string;
  /** Display label. */
  label: string;
  /** Whether the item must be checked to complete the task. */
  required?: boolean;
}

/**
 * A task definition — assignable work item for users or AI agents.
 */
export interface ToolkitTask {
  /** Unique identifier (within this kit). */
  id: string;
  /** Display name. */
  name: string;
  /** Human-readable description. */
  description: string;
  /** Default priority. */
  priority?: TaskPriority;
  /** Whether this task can be assigned to AI agents. */
  assignableToAgents?: boolean;
  /** Whether this task can be assigned to human users. */
  assignableToUsers?: boolean;
  /** Estimated duration in milliseconds. */
  estimatedDuration?: number;
  /** Searchable tags. */
  tags?: string[];
  /** Checklist items that must be completed. */
  checklist?: TaskChecklistItem[];
}

// ═══════════════════════════════════════════════════
//  8. Collections (data schemas)
// ═══════════════════════════════════════════════════

/** Primitive and complex field types for collection schemas. */
export type CollectionFieldType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "json"
  | "reference"
  | "enum"
  | "array"
  | "file";

/** A single field in a collection schema. */
export interface CollectionField {
  /** Field name (used as key in documents). */
  name: string;
  /** Value type. */
  type: CollectionFieldType;
  /** Human-readable description. */
  description?: string;
  /** Whether the field must be present. */
  required?: boolean;
  /** Whether values must be unique within the collection. */
  unique?: boolean;
  /** Whether the field is indexed for fast lookups. */
  indexed?: boolean;
  /** Default value for new documents. */
  defaultValue?: unknown;
  /** For `type: "enum"` — the allowed values. */
  enumValues?: string[];
  /** For `type: "reference"` — the target collection ID. */
  referenceCollection?: string;
}

/** A composite index on a collection. */
export interface CollectionIndex {
  /** Fields included in this index. */
  fields: string[];
  /** Whether the index enforces uniqueness. */
  unique?: boolean;
  /** Optional index name. */
  name?: string;
}

/**
 * A managed data collection — schema for entities/artifacts owned by this kit.
 * Collections are stored in the platform's data layer and are accessible
 * via the API and AI tool-use system.
 */
export interface ToolkitCollection {
  /** Unique identifier (within this kit). */
  id: string;
  /** Display name. */
  name: string;
  /** Human-readable description. */
  description: string;
  /** Field definitions — the schema. */
  schema: CollectionField[];
  /** Primary key field name (defaults to "id"). */
  primaryKey?: string;
  /** Composite indexes. */
  indexes?: CollectionIndex[];
  /** Retention policy for automatic eviction. */
  retention?: {
    /** Maximum number of documents. */
    maxEntries?: number;
    /** Maximum age in milliseconds — documents older than this are evicted. */
    maxAge?: number;
    /** Eviction policy. */
    policy?: "fifo" | "lru";
  };
}

// ═══════════════════════════════════════════════════
//  9. UI / UX
// ═══════════════════════════════════════════════════

/** Type of UI contribution a kit can provide. */
export type UIContributionType =
  | "page"
  | "panel"
  | "card"
  | "menu-item"
  | "toolbar-action"
  | "status-bar"
  | "widget"
  | "modal";

/** Platform target for UI contributions. */
export type PlatformTarget = "web" | "mobile" | "tv" | "desktop" | "cli";

/** A single UI element contributed by a kit. */
export interface ToolkitUIContribution {
  /** What kind of UI element this is. */
  type: UIContributionType;
  /** Unique identifier (within this kit's UI contributions). */
  id: string;
  /** Display label. */
  label: string;
  /** Lucide icon name. */
  icon?: string;
  /** Brief description / tooltip. */
  description?: string;
  /** In-app view ID to navigate to (for pages/panels). */
  viewId?: string;
  /** Route path (for page contributions). */
  route?: string;
  /** Parent contribution ID (for nesting menu items). */
  parentId?: string;
  /** Display order (lower = first). */
  order?: number;
  /** Platforms this contribution is visible on. */
  platforms?: PlatformTarget[];
  /** RBAC permission required to see this contribution. */
  requiredPermission?: string;
}

/**
 * Comprehensive UI configuration for a kit.
 * Combines atomic UI contributions with the optional primary app surface.
 */
export interface ToolkitUI {
  /** Individual UI contributions (pages, panels, cards, menu items, etc.). */
  contributions: ToolkitUIContribution[];
  /**
   * Primary app surface, if any.
   * @deprecated Prefer `contributions` with `type: "page"`.  Kept for
   * backward compatibility with the `ToolkitApp` shape.
   */
  app?: ToolkitApp;
  /** Custom icon definitions shipped by this kit. */
  icons?: { id: string; svg: string }[];
  /** Theme / color variable overrides scoped to this kit. */
  theme?: Record<string, string>;
}

/** Describes an optional primary UI surface provided by a toolkit (legacy). */
export interface ToolkitApp {
  /** Unique identifier for the app (e.g. "studio", "editor"). */
  id: string;
  /** Display name shown in navigation. */
  name: string;
  /** Target platforms this app supports. */
  platforms: PlatformTarget[];
  /** View ID used for in-app navigation (if web). */
  viewId?: string;
  /** External URL (for out-of-platform apps). */
  url?: string;
  /** Brief description of the app's purpose. */
  description?: string;
}

// ═══════════════════════════════════════════════════
//  10. Configuration / Settings
// ═══════════════════════════════════════════════════

/** A single setting exposed by a toolkit. */
export interface ToolkitConfigField {
  /** Unique key within this toolkit's config namespace. */
  key: string;
  /** Display label shown in settings UI. */
  label: string;
  /** Description / help text. */
  description?: string;
  /** Value type. */
  type: "string" | "number" | "boolean" | "select";
  /** Default value. */
  defaultValue?: string | number | boolean;
  /** For `type: "select"` — the allowed values. */
  options?: { label: string; value: string }[];
  /** Whether a value is required. */
  required?: boolean;
}

/** Toolkit configuration schema + current values. */
export interface ToolkitConfiguration {
  /** Declared settings this toolkit exposes. */
  fields: ToolkitConfigField[];
  /**
   * Current persisted values (key → value).
   * Populated at registration from stored config.
   */
  values?: Record<string, string | number | boolean>;
}

// ═══════════════════════════════════════════════════
//  11. Logging (with channel pub/sub)
// ═══════════════════════════════════════════════════

export type ToolkitLogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/** A single structured log entry. */
export interface ToolkitLogEntry {
  /** Globally unique entry ID (UUIDv7 / ULID). */
  id?: string;
  /** ISO-8601 timestamp. */
  timestamp: string;
  /** Severity level. */
  level: ToolkitLogLevel;
  /** Human-readable message. */
  message: string;
  /** Source toolkit that emitted this entry. */
  sourceKit?: string;
  /** Channel this entry was published to. */
  channel?: string;
  /** Optional structured data (trace IDs, error codes, etc.). */
  data?: Record<string, unknown>;
  /** Content-addressable identifier on the storage backend (e.g. IPFS CID). */
  cid?: string;
  /** Parent CID for IPLD DAG linkage (previous entry or batch root). */
  parentCid?: string;
  /** Tags for categorization and search. */
  tags?: string[];
}

/** A named log channel that supports pub/sub subscriptions. */
export interface ToolkitLogChannel {
  /** Channel identifier (e.g. "toolkit.studio.errors"). */
  id: string;
  /** Display name. */
  name: string;
  /** Brief description of what this channel captures. */
  description?: string;
  /** Minimum level for entries published to this channel. */
  minLevel?: ToolkitLogLevel;
  /** Kit IDs that are automatically subscribed to this channel. */
  subscribers?: string[];
  /** Whether this channel persists to the decentralized backend. */
  persistent?: boolean;
  /** Retention policy override for this channel. */
  retention?: {
    maxEntries?: number;
    maxAge?: number;
    policy?: "fifo" | "lru";
  };
}

/** Configuration for the kit's logging behavior (legacy). */
export interface ToolkitLogConfig {
  /** Minimum level that is emitted (default "info"). */
  minLevel?: ToolkitLogLevel;
  /**
   * Maximum number of log entries retained in memory.
   * Older entries are evicted in FIFO order.
   */
  maxEntries?: number;
}

// ── Modular Log Backends / Sinks ────────────────

/** Identifies which backend type a log sink uses. */
export type LogBackendType =
  | "console"
  | "file"
  | "ipfs"
  | "ipld"
  | "http"
  | "syslog"
  | "custom";

/** Configuration for a single log sink (output destination). */
export interface LogSinkConfig {
  /** Unique sink identifier. */
  id: string;
  /** Display name. */
  name: string;
  /** Backend type. */
  type: LogBackendType;
  /** Whether this sink is active. */
  enabled: boolean;
  /** Minimum level for entries routed to this sink. */
  minLevel?: ToolkitLogLevel;
  /** Channel filter — if set only entries from these channels are routed. */
  channels?: string[];

  // ── Backend-specific options ─────────────────

  /** Console backend options. */
  console?: {
    /** Use structured JSON output instead of human-readable. */
    json?: boolean;
    /** Include color codes. */
    color?: boolean;
  };

  /** File backend options. */
  file?: {
    /** File path or pattern (e.g. "/var/log/decops/{{kit}}.log"). */
    path: string;
    /** Maximum file size before rotation (bytes). */
    maxSize?: number;
    /** Number of rotated files to retain. */
    maxFiles?: number;
    /** Output format. */
    format?: "json" | "text" | "csv";
  };

  /** IPFS backend options. */
  ipfs?: {
    /** IPFS API endpoint (e.g. "http://localhost:5001"). */
    apiUrl: string;
    /** Whether to pin log entries. */
    pin?: boolean;
    /** Batch size — entries are buffered and flushed as a single DAG node. */
    batchSize?: number;
    /** Flush interval in milliseconds (0 = immediate). */
    flushInterval?: number;
  };

  /**
   * IPLD backend options — extends IPFS with DAG structure.
   * Each log batch becomes an IPLD node linking to the previous batch,
   * forming a verifiable append-only log.
   */
  ipld?: {
    /** IPFS API endpoint. */
    apiUrl: string;
    /** IPLD codec to use (default "dag-cbor"). */
    codec?: "dag-cbor" | "dag-json" | "dag-pb";
    /** Hash algorithm (default "sha2-256"). */
    hashAlg?: "sha2-256" | "blake3" | "sha3-256";
    /** Whether to build a Prolly-tree index for range queries. */
    indexEnabled?: boolean;
    /** Maximum entries per DAG node before splitting. */
    nodeCapacity?: number;
    /** Pin root CID after each flush. */
    pin?: boolean;
    /** Batch size before flush. */
    batchSize?: number;
    /** Flush interval in milliseconds. */
    flushInterval?: number;
  };

  /** HTTP/webhook backend options. */
  http?: {
    /** Target URL. */
    url: string;
    /** HTTP method (default "POST"). */
    method?: "POST" | "PUT";
    /** Additional headers. */
    headers?: Record<string, string>;
    /** Batch size. */
    batchSize?: number;
  };

  /** Custom backend — opaque config passed to a user-supplied handler. */
  custom?: Record<string, unknown>;
}

/**
 * Complete logging configuration — extends legacy `ToolkitLogConfig` with
 * channel-based pub/sub, modular sink routing, and IPFS/IPLD support.
 */
export interface ToolkitLogging {
  /** Basic log behavior (level, retention). */
  config?: ToolkitLogConfig;
  /** Named channels this kit publishes to. */
  channels?: ToolkitLogChannel[];
  /** Channel IDs this kit subscribes to (from other kits). */
  subscriptions?: string[];
  /**
   * Log sinks — modular output destinations.
   * Each sink routes log entries to a specific backend (console, file,
   * IPFS/IPLD, HTTP, etc.).  When omitted the platform default sinks
   * are used.
   */
  sinks?: LogSinkConfig[];
  /**
   * IPFS/IPLD root CID — resolved lazily by the aggregator.
   * Set by the platform when the kit's log DAG is first created.
   */
  rootCid?: string;
}

// ═══════════════════════════════════════════════════
//  12. Notifications
// ═══════════════════════════════════════════════════

/** Supported notification delivery channels. */
export type NotificationChannel =
  | "in-app"
  | "email"
  | "webhook"
  | "push"
  | "sms"
  | "slack"
  | "pubsub";

/** Notification urgency level. */
export type NotificationPriority = "low" | "normal" | "high" | "urgent";

/** A reusable notification template. */
export interface ToolkitNotificationTemplate {
  /** Template identifier. */
  id: string;
  /** Display name. */
  name: string;
  /** Human-readable description. */
  description: string;
  /** Delivery channel for this template. */
  channel: NotificationChannel;
  /** Default priority. */
  priority?: NotificationPriority;
  /** Message template with `{{variable}}` interpolation. */
  template?: string;
  /** Event that triggers this notification (e.g. "job.completed"). */
  event?: string;
}

/** Notification system configuration for a kit. */
export interface ToolkitNotifications {
  /** Notification templates provided by this kit. */
  templates: ToolkitNotificationTemplate[];
  /** Channels this kit can send notifications through. */
  channels?: NotificationChannel[];
  /** User-configurable notification preferences. */
  preferences?: {
    /** Default delivery channel. */
    defaultChannel?: NotificationChannel;
    /** Whether notifications from this kit are muted. */
    muted?: boolean;
    /** Quiet hours — notifications are held until the window ends. */
    quietHours?: { start: string; end: string };
  };
}

// ═══════════════════════════════════════════════════
//  13. Metrics (OpenTelemetry-compatible)
// ═══════════════════════════════════════════════════

/**
 * A single observable metric exposed by a toolkit.
 *
 * Metrics follow an OpenTelemetry-inspired format and are always
 * reducible to a key-value pair: `name → value`.
 */
export interface ToolkitMetric {
  /** Metric name (dot-separated namespace, e.g. "toolkit.studio.steps_total"). */
  name: string;
  /** Short description shown in dashboards. */
  description: string;
  /** Metric kind — mirrors OpenTelemetry instrument types. */
  type: "counter" | "gauge" | "histogram";
  /** Measurement unit (e.g. "ms", "bytes", "1" for unitless counts). */
  unit?: string;
}

/**
 * Callback interface a toolkit can implement to push metric snapshots.
 * The platform calls `collect()` on a cadence or on-demand.
 */
export interface ToolkitMetricsProvider {
  /** Declared metrics this provider emits. */
  definitions: ToolkitMetric[];
  /**
   * Return the current values for all declared metrics.
   * Keys must match `ToolkitMetric.name`.
   */
  collect: () => Record<string, number>;
}

// ═══════════════════════════════════════════════════
//  14. RBAC (Role-Based Access Control)
// ═══════════════════════════════════════════════════

/** Actions that can be guarded by permissions. */
export type PermissionAction =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "execute"
  | "admin"
  | "*";

/** A single permission declared by a kit. */
export interface ToolkitPermission {
  /** Permission identifier (e.g. "studio.canvas.edit"). */
  id: string;
  /** Display name. */
  name: string;
  /** Human-readable description. */
  description: string;
  /** Resource this permission guards (e.g. "canvas", "job", "artifact"). */
  resource: string;
  /** Allowed actions. */
  actions: PermissionAction[];
}

/** A role definition scoped to this kit. */
export interface ToolkitRole {
  /** Role identifier. */
  id: string;
  /** Display name. */
  name: string;
  /** Human-readable description. */
  description: string;
  /** Permission IDs granted by this role. */
  permissions: string[];
  /** Parent role IDs this role inherits from. */
  inherits?: string[];
}

/** RBAC configuration for a kit. */
export interface ToolkitRBAC {
  /** Permissions declared by this kit. */
  permissions: ToolkitPermission[];
  /** Roles defined by this kit. */
  roles: ToolkitRole[];
  /** Default role assigned to new users for this kit. */
  defaultRole?: string;
}

// ═══════════════════════════════════════════════════
//  15. Tests
// ═══════════════════════════════════════════════════

/** Test type classification. */
export type TestType = "unit" | "integration" | "e2e" | "smoke" | "performance";

/** A single assertion within a test. */
export interface TestAssertion {
  /** Assertion operator. */
  type: "equals" | "contains" | "matches" | "truthy" | "status";
  /** Field / path to assert on (dot-separated). */
  field?: string;
  /** Expected value for equality checks. */
  expected?: unknown;
  /** Regex pattern for "matches" assertions. */
  pattern?: string;
}

/** A single test case. */
export interface ToolkitTest {
  /** Test identifier. */
  id: string;
  /** Display name. */
  name: string;
  /** Human-readable description. */
  description: string;
  /** Test classification. */
  type: TestType;
  /** Command ID to exercise (if testing a command). */
  commandId?: string;
  /** Tool ID to exercise (if testing a tool). */
  toolId?: string;
  /** Assertions to evaluate after execution. */
  assertions?: TestAssertion[];
  /** Timeout in milliseconds. */
  timeout?: number;
}

/** A test suite — collection of test cases with optional setup/teardown. */
export interface ToolkitTestSuite {
  /** Test cases. */
  tests: ToolkitTest[];
  /** Command ID to run before the suite. */
  setup?: string;
  /** Command ID to run after the suite. */
  teardown?: string;
  /** Code-coverage settings. */
  coverage?: { enabled: boolean; threshold?: number };
}

// ═══════════════════════════════════════════════════
//  16. Documentation
// ═══════════════════════════════════════════════════

/** Document type classification. */
export type DocType =
  | "readme"
  | "guide"
  | "tutorial"
  | "api-reference"
  | "changelog"
  | "faq"
  | "architecture";

/** A single documentation page. */
export interface ToolkitDoc {
  /** Document identifier. */
  id: string;
  /** Document title. */
  title: string;
  /** Type classification. */
  type: DocType;
  /** Inline markdown content. */
  content?: string;
  /** External URL (alternative to inline content). */
  url?: string;
  /** Display order (lower = first). */
  order?: number;
  /** Searchable tags. */
  tags?: string[];
}

/** Documentation bundle for a kit. */
export interface ToolkitDocs {
  /** Individual documentation pages. */
  documents: ToolkitDoc[];
  /** Inline README markdown. */
  readme?: string;
  /** Inline CHANGELOG markdown. */
  changelog?: string;
}

// ═══════════════════════════════════════════════════
//  17. API Endpoints (server-side)
// ═══════════════════════════════════════════════════

/** HTTP method for API endpoints. */
export type HTTPMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

/** A single HTTP endpoint contributed by a kit. */
export interface ToolkitAPIEndpoint {
  /** Endpoint identifier. */
  id: string;
  /** HTTP method. */
  method: HTTPMethod;
  /** Route path relative to the kit's base path (e.g. "/jobs/:id"). */
  path: string;
  /** Human-readable description. */
  description: string;
  /** JSON Schema for the request body. */
  requestSchema?: Record<string, unknown>;
  /** JSON Schema for the response body. */
  responseSchema?: Record<string, unknown>;
  /** Whether authentication is required. */
  auth?: boolean;
  /** Rate limiting. */
  rateLimit?: {
    /** Max requests per window. */
    requests: number;
    /** Window duration in milliseconds. */
    window: number;
  };
  /** Searchable tags. */
  tags?: string[];
}

/** API surface contributed by a kit (server-side). */
export interface ToolkitAPI {
  /** Base URL path prefix (e.g. "/api/v1/studio"). */
  basePath: string;
  /** Endpoint definitions. */
  endpoints: ToolkitAPIEndpoint[];
  /** API version (can differ from kit version). */
  version?: string;
}

// ═══════════════════════════════════════════════════
//  Activity (user-facing change feed — unchanged)
// ═══════════════════════════════════════════════════

/** A user-facing activity entry — change that affects or was triggered by a user. */
export interface ToolkitActivityEntry {
  /** ISO-8601 timestamp. */
  timestamp: string;
  /** Machine-readable action verb (e.g. "created", "updated", "deleted"). */
  action: string;
  /** Human-readable description. */
  summary: string;
  /** Optional ID of the entity affected. */
  entityId?: string;
  /** Optional entity type (e.g. "agent", "channel", "artifact"). */
  entityType?: string;
  /** ID of the user or agent that performed the action. */
  actorId?: string;
}

// ═══════════════════════════════════════════════════
//  Lifecycle Context
// ═══════════════════════════════════════════════════

/** Context supplied to lifecycle hooks during registration. */
export interface ToolkitContext {
  /** The global command registry — modules can query or extend it. */
  commandRegistry: CommandRegistry;
}

// ═══════════════════════════════════════════════════
//  ToolkitModule — the complete kit interface
// ═══════════════════════════════════════════════════

/**
 * The complete, standardized interface for a decops toolkit (kit).
 *
 * Every facet is optional except `manifest`, `commands`, and `tools`.
 * A minimal kit only needs metadata + commands + tools.  A full-featured
 * kit can declare all 17 facets.
 *
 * Kits implementing this interface can be:
 *   • Registered at platform startup (built-in)
 *   • Hot-loaded/unloaded at runtime (third-party)
 *   • Packed into OCI artifacts and stored in registries
 *   • Versioned, dependency-resolved, and content-addressed
 */
export interface ToolkitModule {
  // ── 1. Core identity ──────────────────────────

  /** Declarative metadata — identity, versioning, OCI fields. */
  manifest: ToolkitManifest;

  // ── 2. Commands ───────────────────────────────

  /** Command definitions registered with the global CommandRegistry. */
  commands: CommandDefinition[];

  // ── 3. Tools ──────────────────────────────────

  /**
   * Tool schemas (MCP / function-calling) exposed to the AI system.
   * Tools represent advanced processes — jobs, AI-prompted workflows,
   * or delegations to the kit's sub-agents.
   */
  tools: ToolkitTool[];

  // ── 4. Agents ─────────────────────────────────

  /** Sub-agents provided by this kit (e.g. Studio Bot, Architect Bot). */
  agents?: ToolkitAgent[];

  // ── 5. Jobs ───────────────────────────────────

  /** Pre-defined job templates — reusable multi-step workflows. */
  jobs?: ToolkitJobTemplate[];

  // ── 6. Automations ────────────────────────────

  /** Event-driven or scheduled automation rules. */
  automations?: ToolkitAutomation[];

  // ── 7. Tasks ──────────────────────────────────

  /** Assignable work items for users or agents. */
  tasks?: ToolkitTask[];

  // ── 8. Collections ────────────────────────────

  /** Managed data schemas — entities/artifacts owned by this kit. */
  collections?: ToolkitCollection[];

  // ── 9. UI / UX ────────────────────────────────

  /** Comprehensive UI contributions (pages, panels, cards, menus, etc.). */
  ui?: ToolkitUI;

  /**
   * Primary app surface (legacy shorthand).
   * @deprecated Prefer `ui.app` or `ui.contributions`. Kept for backward
   * compatibility.
   */
  app?: ToolkitApp;

  // ── 10. Configuration ─────────────────────────

  /** Settings schema exposed in the platform config UI. */
  configuration?: ToolkitConfiguration;

  // ── 11. Logging ───────────────────────────────

  /** Structured logging with channel pub/sub. */
  logging?: ToolkitLogging;

  /**
   * Legacy log config.
   * @deprecated Prefer `logging.config`. Kept for backward compatibility.
   */
  logs?: ToolkitLogConfig;

  // ── 12. Notifications ─────────────────────────

  /** Multi-channel notification templates and preferences. */
  notifications?: ToolkitNotifications;

  // ── 13. Metrics ───────────────────────────────

  /** Metrics provider — key-value gauges in OpenTelemetry format. */
  metrics?: ToolkitMetricsProvider;

  // ── 14. RBAC ──────────────────────────────────

  /** Role-based access control — permissions and roles scoped to this kit. */
  rbac?: ToolkitRBAC;

  // ── 15. Tests ─────────────────────────────────

  /** Test suite for validating this kit's commands and tools. */
  tests?: ToolkitTestSuite;

  // ── 16. Documentation ─────────────────────────

  /** Documentation pages, README, and changelog. */
  docs?: ToolkitDocs;

  // ── 17. API (server-side) ─────────────────────

  /** HTTP endpoints contributed by this kit. */
  api?: ToolkitAPI;

  // ── OCI Packaging ─────────────────────────────

  /** OCI artifact manifest — populated when the kit is packed for distribution. */
  oci?: OCIArtifactManifest;

  // ── Activity ──────────────────────────────────

  /** Activity feed configuration — set `enabled: false` to disable tracking. */
  activity?: { enabled: boolean };

  // ── Lifecycle hooks ───────────────────────────

  /**
   * Called once when the toolkit is registered.
   * Use for one-time setup, side-effects, or async resource loading.
   */
  init?: (ctx: ToolkitContext) => void | Promise<void>;

  /**
   * Called when the toolkit is un-registered (hot-unload).
   * Use for teardown, event listener cleanup, etc.
   */
  destroy?: () => void | Promise<void>;
}
