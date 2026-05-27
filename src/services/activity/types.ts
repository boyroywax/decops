/**
 * Activity Bus — type definitions.
 *
 * The activity bus is the unified pub/sub layer for operational events
 * across toolkits (libp2p, helia, kubo, orbitdb, orbitdb-server,
 * orchestrator…) and app-level systems (jobs, automations, navigation).
 *
 * Distinct from the logging service (`@/services/logging`) which is for
 * **telemetry** (severity-routed, sink-backed audit trail) and from the
 * Notebook (`@/hooks/useNotebook`) which is the **user-curated** timeline.
 *
 * Activity events are short-lived, UI-facing operational signals: a job
 * transitioned, a pubsub message arrived, a stack drifted, an automation
 * fired.
 */

/** Known event sources. Plain string permits new sources without a code change. */
export type ActivitySource =
  | "libp2p"
  | "helia"
  | "kubo"
  | "orbitdb"
  | "orbitdb-server"
  | "orchestrator"
  | "jobs"
  | "automations"
  | "system"
  | "architect"
  | (string & {});

/** Coarse classification — what kind of signal this event represents. */
export type ActivityKind =
  | "event"          // generic lifecycle / state-change event
  | "metric"         // numeric metric update
  | "notification"   // user-visible notification
  | "jobLifecycle"   // job created/started/finished/failed/stopped
  | "automation"     // automation run created/started/finished/failed
  | "stateChange";   // toolkit-internal state transition

/** Severity ordering: debug < info < warn < error. */
export type ActivitySeverity = "debug" | "info" | "warn" | "error";

/**
 * An inline action a consumer (e.g. an Activity row) can invoke without
 * leaving the feed — e.g. "Open libp2p", "Re-run job", "Inspect manifest".
 */
export interface ActivityAction {
  id: string;
  label: string;
  /** Optional ViewId to navigate to when invoked (handled by the feed host). */
  viewTarget?: string;
  /** Optional ad-hoc callback. Avoid for events that need to be exportable. */
  onInvoke?: () => void;
}

/** An immutable activity event published on the bus. */
export interface ActivityEvent {
  /** Unique id (monotonic counter + epoch for ordering). */
  id: string;
  /** Wall-clock timestamp (ms since epoch) when the event was published. */
  timestamp: number;
  /** Logical source toolkit / subsystem. */
  source: ActivitySource;
  /** Sub-channel within the source (e.g. "lifecycle", "pubsub", "pins"). */
  channel: string;
  /** Coarse classification. */
  kind: ActivityKind;
  /** Severity for filtering. */
  severity: ActivitySeverity;
  /** Short human-readable title (rendered as the row's primary text). */
  title: string;
  /** Longer human-readable detail (rendered when expanded). */
  message?: string;
  /** Free-form tags for additional filtering. */
  tags?: string[];
  /** Structured payload (JSON-serialisable). Rendered as expandable JSON. */
  data?: unknown;
  /** Optional link back to a Job (for jobLifecycle events). */
  jobId?: string;
  /** Optional link back to an automation run. */
  automationRunId?: string;
  /** Inline row actions. */
  actions?: ActivityAction[];
}

/** Optional input to `publish` — id+timestamp are filled by the bus. */
export type ActivityEventInput = Omit<ActivityEvent, "id" | "timestamp"> & {
  id?: string;
  timestamp?: number;
};

/** Predicate filter shared by subscribe() and query(). */
export interface ActivityFilter {
  sources?: ActivitySource[];
  kinds?: ActivityKind[];
  severities?: ActivitySeverity[];
  channels?: string[];
  /** Inclusive lower bound (ms epoch). */
  since?: number;
  /** Inclusive upper bound (ms epoch). */
  until?: number;
  /** Case-insensitive substring match against title, message, tags, channel. */
  search?: string;
  /** Optional max number of entries returned by query(). */
  limit?: number;
}

export type ActivityListener = (event: ActivityEvent) => void;
