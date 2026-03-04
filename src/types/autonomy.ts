/**
 * Autonomy types — autonomous agent task execution, delegation, and group ideation.
 *
 * Escalation hierarchy:  self → group → network → ecosystem
 *
 * An agent receives a task, plans actions using available commands, executes or
 * delegates to peers, and escalates through the organizational hierarchy when
 * it cannot complete a task alone.  Groups can reach consensus to create new
 * agents, propose workflows, or ideate on ecosystem-level changes.
 */

// ── Escalation ─────────────────────────────────────

export type EscalationLevel = "self" | "group" | "network" | "ecosystem";

/** Maps an EscalationLevel to the next tier up (or null at the top). */
export function nextEscalation(level: EscalationLevel): EscalationLevel | null {
  const order: EscalationLevel[] = ["self", "group", "network", "ecosystem"];
  const idx = order.indexOf(level);
  return idx < order.length - 1 ? order[idx + 1] : null;
}

// ── Task ───────────────────────────────────────────

export type TaskStatus =
  | "pending"       // created but not yet started
  | "planning"      // agent is analyzing & building a plan
  | "executing"     // agent is running planned actions
  | "delegated"     // handed off to another agent / group
  | "escalated"     // pushed up the hierarchy
  | "completed"     // finished successfully
  | "failed"        // could not complete at any level
  | "blocked";      // waiting on external/human input

export interface AgentTask {
  id: string;
  /** Natural-language description of the goal */
  goal: string;
  /** Optional structured constraints the agent must honor */
  constraints?: string[];
  /** Who created the task (agent ID, group ID, "user", or "system") */
  createdBy: string;
  /** The agent currently responsible for execution */
  assigneeId: string;
  /** Current escalation level */
  escalationLevel: EscalationLevel;
  /** Full execution history — every plan, action, delegation, escalation */
  history: TaskEvent[];
  /** Status */
  status: TaskStatus;
  /** Final result (set on completion or failure) */
  result?: TaskResult;
  /** ID of the parent task (if this is a sub-task created during delegation) */
  parentTaskId?: string;
  /** IDs of child sub-tasks */
  childTaskIds?: string[];
  /** Configuration */
  config: AutonomyConfig;
  /** ISO timestamp of creation */
  createdAt: string;
  /** ISO timestamp of last update */
  updatedAt: string;
  /** Persistent workspace storage for cross-action data during task execution */
  workspaceStorage?: Record<string, any>;
  /** AI chat message history maintained across re-planning rounds */
  chatHistory?: Array<{ role: "user" | "assistant"; content: string; timestamp: string }>;
}

// ── Task events (append-only history) ──────────────

export type TaskEventKind =
  | "created"
  | "plan_generated"
  | "action_executed"
  | "action_failed"
  | "delegated"
  | "delegation_accepted"
  | "delegation_rejected"
  | "escalated"
  | "sub_task_created"
  | "sub_task_completed"
  | "sub_task_failed"
  | "consensus_requested"
  | "consensus_reached"
  | "agent_proposed"
  | "agent_created"
  | "completed"
  | "failed"
  | "blocked"
  | "job_queued"
  | "job_completed"
  | "job_failed"
  | "ai_chat"
  | "replan_requested";

export interface TaskEvent {
  kind: TaskEventKind;
  timestamp: string;
  agentId: string;
  detail: Record<string, any>;
}

// ── Task result ────────────────────────────────────

export interface TaskResult {
  success: boolean;
  summary: string;
  /** Artifacts produced during execution */
  artifactIds?: string[];
  /** Jobs created/run during execution */
  jobIds?: string[];
  /** If delegation chain was used, the final resolver */
  resolvedBy?: string;
  /** Raw data (command outputs, deliverables, etc.) */
  data?: Record<string, any>;
}

// ── Action plan (AI-generated) ─────────────────────

export interface PlannedAction {
  /** Sequential order */
  order: number;
  /** Action type: "command" runs a single command, "job" runs a multi-step job pipeline */
  type?: "command" | "job";
  /** Which command to invoke (when type is "command" or unset) */
  commandId: string;
  /** Arguments (may contain $storage refs) */
  args: Record<string, any>;
  /** Why the agent chose this action */
  reasoning: string;
  /** If true, the agent deems this optional / best-effort */
  optional?: boolean;
  /** Job definition ID from the catalog (when type is "job") */
  jobDefinitionId?: string;
  /** Inline job definition (when type is "job" and not referencing the catalog) */
  jobDefinition?: import("@/types/jobs").JobDefinition;
  /** Input overrides for the job (when type is "job") */
  jobInputs?: Record<string, string>;
}

export interface TaskPlan {
  /** The agent's analysis of the goal */
  analysis: string;
  /** Whether the agent believes it can complete the task alone */
  canSelfComplete: boolean;
  /** If not self-completable, who/what to delegate to */
  delegationTarget?: DelegationTarget;
  /** Ordered list of actions to take (if self-completing) */
  actions: PlannedAction[];
  /** Capability gaps identified */
  gaps?: string[];
  /** Job definitions the AI wants to compose (multi-step pipelines) */
  jobDefinitions?: import("@/types/jobs").JobDefinition[];
}

// ── Delegation ─────────────────────────────────────

export interface DelegationTarget {
  /** Target type */
  type: "agent" | "group" | "network" | "ecosystem";
  /** ID of the target entity */
  targetId: string;
  /** Why this target was chosen */
  reasoning: string;
}

export interface DelegationRequest {
  taskId: string;
  fromAgentId: string;
  target: DelegationTarget;
  /** Subset of the original goal, or the full goal forwarded */
  subGoal: string;
  /** Context the delegating agent wants to pass along */
  context: string;
}

export interface DelegationResponse {
  accepted: boolean;
  agentId: string;
  reason: string;
  /** If accepted, the sub-task ID created */
  subTaskId?: string;
}

// ── Group consensus / ideation ─────────────────────

export type ProposalKind =
  | "create_agent"        // group decides a new agent is needed
  | "create_workflow"     // group proposes a new job/workflow
  | "modify_agent"        // update an existing agent's prompt/role
  | "modify_workflow"     // change an existing job definition
  | "ecosystem_change"    // broader structural change proposal
  | "task_strategy"       // how to approach a specific task
  | "custom";             // free-form ideation

export interface ConsensusProposal {
  id: string;
  kind: ProposalKind;
  title: string;
  description: string;
  /** The agent who made the proposal */
  proposedBy: string;
  /** Group deliberating */
  groupId: string;
  /** Structured spec (depends on kind) */
  spec: AgentSpec | WorkflowSpec | EcosystemChangeSpec | Record<string, any>;
  /** Member votes / positions */
  positions: MemberPosition[];
  /** Outcome after deliberation */
  outcome?: ConsensusOutcome;
  /** Was the proposal auto-executed? */
  executed: boolean;
  createdAt: string;
}

export interface MemberPosition {
  agentId: string;
  agentName: string;
  vote: "approve" | "reject" | "abstain" | "pending";
  reasoning: string;
  amendments?: string[];
}

export interface ConsensusOutcome {
  passed: boolean;
  decision: string;
  votesFor: number;
  votesAgainst: number;
  abstentions: number;
  summary: string;
}

// ── Proposal specs ─────────────────────────────────

export interface AgentSpec {
  name: string;
  role: string;
  prompt: string;
  title?: string;
  /** Skills the new agent should have */
  capabilities?: string[];
  /** Why this agent is needed */
  justification: string;
  /** Which network to place it in */
  networkId?: string;
  /** Group membership */
  groupId?: string;
}

export interface WorkflowSpec {
  name: string;
  description: string;
  /** Command IDs the workflow should compose */
  steps: Array<{
    commandId: string;
    args: Record<string, any>;
    reasoning: string;
  }>;
  /** Expected deliverables */
  deliverables?: string[];
}

export interface EcosystemChangeSpec {
  changeType: "add_network" | "add_bridge" | "restructure_group" | "add_channel" | "custom";
  description: string;
  entities: Record<string, any>;
  justification: string;
}

// ── Capability assessment ──────────────────────────

export interface AgentCapability {
  agentId: string;
  agentName: string;
  role: string;
  /** Skills from AIEOS spec */
  skills: string[];
  /** Commands this agent's role allows */
  allowedCommands: string[];
  /** How well this agent matches a given task (0-1, computed dynamically) */
  relevanceScore?: number;
}

// ── Configuration ──────────────────────────────────

export interface AutonomyConfig {
  /** Maximum planning/execution rounds before giving up */
  maxRounds: number;
  /** Maximum number of escalation levels to try */
  maxEscalations: number;
  /** Whether the agent can create sub-tasks */
  allowSubTasks: boolean;
  /** Whether the agent can create new job definitions */
  allowJobCreation: boolean;
  /** Whether groups can propose creating new agents */
  allowAgentCreation: boolean;
  /** Whether to auto-execute consensus outcomes (vs. requiring human approval) */
  autoExecuteConsensus: boolean;
  /** Model to use for planning (defaults to agent's model) */
  planningModel?: string;
  /** Maximum concurrent sub-tasks per agent */
  maxConcurrentSubTasks: number;
  /** Timeout in ms for the entire task */
  taskTimeoutMs: number;
  /** Maximum re-plan attempts after partial execution failure before escalating */
  maxReplanAttempts: number;
  /** Whether the task engine can consult AI mid-execution for reasoning/adaptation */
  allowMidExecutionChat: boolean;
  /** Model to use for mid-execution AI chat (defaults to planningModel) */
  chatModel?: string;
}

export const DEFAULT_AUTONOMY_CONFIG: AutonomyConfig = {
  maxRounds: 12,
  maxEscalations: 3,
  allowSubTasks: true,
  allowJobCreation: true,
  allowAgentCreation: true,
  autoExecuteConsensus: false,
  maxConcurrentSubTasks: 4,
  taskTimeoutMs: 5 * 60 * 1000, // 5 minutes
  maxReplanAttempts: 2,
  allowMidExecutionChat: true,
};
