/**
 * Navigator types — goals, subgoals, and huddle sessions.
 *
 * The navigator turns a user prompt into a {@link NavigatorGoal} composed of
 * one or more {@link NavigatorSubgoal}s. Each subgoal is assigned to one
 * agent (direct) or a {@link NavigatorHuddle} (consultation), and is then
 * executed via the existing jobs subsystem — the navigator does NOT
 * reinvent execution, only planning + routing.
 */

export type NavigatorGoalStatus =
  | "draft"        // user prompt accepted, not yet decomposed
  | "planning"     // navigator is breaking the goal into subgoals
  | "executing"    // at least one subgoal is in flight
  | "blocked"      // a subgoal needs human/agent input
  | "completed"
  | "failed"
  | "cancelled";

export type NavigatorSubgoalStatus =
  | "pending"
  | "assigned"
  | "paused"
  | "blocked"
  | "consulting"   // routed to a huddle, awaiting consensus
  | "executing"
  | "completed"
  | "failed"
  | "skipped";

export interface NavigatorLifecycleEvent {
  id: string;
  timestamp: number;
  goalId: string;
  subgoalId?: string;
  kind:
    | "goal-created"
    | "goal-status"
    | "goal-cancelled"
    | "goal-removed"
    | "subgoal-created"
    | "subgoal-status"
    | "subgoal-assigned"
    | "subgoal-job-linked"
    | "subgoal-note"
    | "huddle-created"
    | "huddle-status";
  actor?: string;
  fromStatus?: string;
  toStatus?: string;
  message?: string;
  jobId?: string;
}

export interface NavigatorSubgoal {
  id: string;
  goalId: string;
  /** Short imperative title — what should be done. */
  title: string;
  /** Longer instruction passed to the assigned agent/huddle. */
  instruction: string;
  /** Direct agent assignment OR huddle assignment (exactly one). */
  assignedAgentId?: string;
  huddleId?: string;
  status: NavigatorSubgoalStatus;
  /** IDs of jobs created to execute this subgoal. */
  jobIds: string[];
  /** Number of retry attempts initiated by operator/automation. */
  retries?: number;
  /** Optional pause/block/failure reason. */
  reason?: string;
  /** Transition timestamps for lifecycle monitoring. */
  startedAt?: number;
  completedAt?: number;
  lastTransitionAt?: number;
  /** Latest execution-linked job id for quick lookup. */
  latestJobId?: string;
  /** Per-subgoal lifecycle log (newest at end). */
  lifecycle?: NavigatorLifecycleEvent[];
  /** Free-form result summary once completed. */
  result?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  /** Optional ordering — sub-goals with the same `order` may run in parallel. */
  order?: number;
}

export interface NavigatorGoal {
  id: string;
  /** The originating user prompt. */
  prompt: string;
  /** Navigator-generated headline goal. */
  title: string;
  status: NavigatorGoalStatus;
  subgoals: NavigatorSubgoal[];
  /** DIDComm thread id used as `thid` on every protocol message for this goal. */
  thid: string;
  /** Networks this goal spans (informational). */
  networkIds: string[];
  startedAt?: number;
  completedAt?: number;
  lastTransitionAt?: number;
  lifecycle?: NavigatorLifecycleEvent[];
  createdAt: number;
  updatedAt: number;
  /** Free-form synthesis once all sub-goals complete. */
  synthesis?: string;
  error?: string;
}

export interface NavigatorHuddle {
  id: string;
  goalId: string;
  subgoalId: string;
  /** The persisted Group id (kind="huddle") backing this session. */
  groupId: string;
  /** Member agent IDs (mirrors group.members for fast access). */
  members: string[];
  /** Networks the members come from. */
  networkIds: string[];
  /** DIDComm parent-thread id so huddle traffic remains correlated to the goal. */
  pthid: string;
  /** DIDComm thread id for this huddle. */
  thid: string;
  status: "open" | "deliberating" | "decided" | "abandoned";
  /** Decision text once the huddle reaches consensus. */
  decision?: string;
  createdAt: number;
  updatedAt: number;
}

export interface NavigatorSnapshot {
  goals: NavigatorGoal[];
  huddles: NavigatorHuddle[];
  activeGoalId: string | null;
}

// ── Bot config (mirrors orchestratorBot's shape) ────────────────────

export type NavigatorBotStatus = "idle" | "planning" | "executing" | "reviewing" | "error";

export interface NavigatorBotConfig {
  /** Max LLM round-trips per request. */
  maxRounds: number;
  /** When true, the navigator may summon huddles without explicit user approval. */
  autoSummonHuddles: boolean;
  /** When true, sub-goal execution is queued via the jobs subsystem. */
  autoQueueJobs: boolean;
}

export const DEFAULT_NAVIGATOR_BOT_CONFIG: NavigatorBotConfig = {
  maxRounds: 15,
  autoSummonHuddles: true,
  autoQueueJobs: true,
};

export interface NavigatorBotRequest {
  id: string;
  instruction: string;
}

export interface NavigatorBotOperation {
  command: string;
  args: unknown;
  description: string;
  order: number;
  status: "pending" | "executing" | "completed" | "failed";
  result?: unknown;
  error?: string;
}

export interface NavigatorBotResponse {
  requestId: string;
  summary: string;
  operations: NavigatorBotOperation[];
  suggestions: string[];
  success: boolean;
  error?: string;
  duration_ms: number;
}
