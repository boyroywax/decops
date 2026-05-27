/**
 * Activity Bus — public surface.
 *
 * @see ./types       — event shape, filter shape
 * @see ./bus         — singleton + ActivityBus class
 * @see ./useActivityFeed — React hook
 * @see ./bridges     — wires jobs + automations into the bus
 */
export type {
  ActivityEvent,
  ActivityEventInput,
  ActivityFilter,
  ActivityKind,
  ActivitySeverity,
  ActivitySource,
  ActivityAction,
  ActivityListener,
} from "./types";

export { ActivityBus, activityBus, matchesFilter, SEVERITY_RANK } from "./bus";
export { useActivityFeed } from "./useActivityFeed";
export {
  useJobsActivityBridge,
  useAutomationsActivityBridge,
} from "./bridges";
export { useToolkitLogger, type ToolkitLogger, type ToolkitLogLevel } from "./useToolkitLogger";

import type { ActivitySource } from "./types";

/** Curated set of sources shown as filter chips in the activity UI. */
export const KNOWN_ACTIVITY_SOURCES: { id: ActivitySource; label: string; accent: string }[] = [
  { id: "libp2p", label: "libp2p", accent: "#38bdf8" },
  { id: "helia", label: "Helia", accent: "#a78bfa" },
  { id: "kubo", label: "Kubo", accent: "#34d399" },
  { id: "orbitdb", label: "OrbitDB", accent: "#fb923c" },
  { id: "orbitdb-server", label: "Lagrange", accent: "#f472b6" },
  { id: "orchestrator", label: "Orchestrator", accent: "#22d3ee" },
  { id: "jobs", label: "Jobs", accent: "#3b82f6" },
  { id: "automations", label: "Automations", accent: "#fbbf24" },
];
