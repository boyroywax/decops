/**
 * Agent Runtime Types — first-class autonomous agent system.
 *
 * Defines the runtime state, communication protocol, and lifecycle
 * management for agents operating as autonomous entities within the mesh.
 *
 * Agent-to-agent communication follows the OpenRouter API format
 * (OpenAI-compatible chat completions) for standardized interactions.
 */

// ── Agent runtime status ───────────────────────────

export type AgentRuntimeStatus =
  | "idle"        // Agent is online but not processing
  | "busy"        // Agent is executing a task or responding
  | "thinking"    // Agent is planning/reasoning
  | "listening"   // Agent is monitoring channels for messages
  | "offline"     // Agent is deactivated
  | "error";      // Agent encountered an unrecoverable error

// ── Agent communication (OpenRouter-compatible) ────

/**
 * Agent message format — follows the OpenRouter/OpenAI chat completions schema
 * so agent-to-agent interactions use a standard, portable format.
 */
export interface AgentChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  /** Agent identity for routing */
  name?: string;
  /** Tool calls made by the agent (assistant role) */
  tool_calls?: AgentToolCall[];
  /** Tool call ID this message responds to (tool role) */
  tool_call_id?: string;
}

export interface AgentToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON-encoded
  };
}

/**
 * Agent-to-agent request envelope — wraps OpenRouter-format messages
 * with mesh-specific routing metadata.
 */
export interface AgentRequest {
  /** Unique request ID */
  id: string;
  /** Source agent ID */
  fromAgentId: string;
  /** Target agent ID */
  toAgentId: string;
  /** The model to use for processing (OpenRouter format: org/model) */
  model: string;
  /** Conversation messages in OpenRouter format */
  messages: AgentChatMessage[];
  /** Maximum response tokens */
  max_tokens?: number;
  /** Temperature (0-2) */
  temperature?: number;
  /** Available tools for the agent */
  tools?: AgentToolDefinition[];
  /** Whether to stream the response */
  stream?: boolean;
  /** Request metadata */
  metadata?: {
    channelId?: string;
    networkId?: string;
    taskId?: string;
    priority?: "low" | "normal" | "high" | "critical";
  };
  /** ISO timestamp */
  createdAt: string;
}

export interface AgentToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>; // JSON Schema
  };
}

/**
 * Agent-to-agent response envelope — wraps OpenRouter-format response
 * with mesh-specific metadata.
 */
export interface AgentResponse {
  /** Original request ID */
  requestId: string;
  /** Responding agent ID */
  agentId: string;
  /** Response choices (OpenRouter format) */
  choices: AgentResponseChoice[];
  /** Token usage */
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  /** Model used */
  model: string;
  /** ISO timestamp */
  createdAt: string;
}

export interface AgentResponseChoice {
  index: number;
  message: AgentChatMessage;
  finish_reason: "stop" | "tool_calls" | "length" | "content_filter" | null;
}

// ── Agent runtime state ────────────────────────────

export interface AgentRuntimeState {
  /** Agent ID */
  agentId: string;
  /** Current operational status */
  status: AgentRuntimeStatus;
  /** Currently active task ID (if any) */
  activeTaskId?: string;
  /** Pending message queue count */
  pendingMessages: number;
  /** Total messages processed since activation */
  totalProcessed: number;
  /** Last activity timestamp */
  lastActivityAt?: string;
  /** Uptime since last activation (ISO timestamp) */
  activeSince?: string;
  /** Error details (when status is "error") */
  lastError?: string;
  /** Model currently being used */
  currentModel?: string;
  /** Autonomy level determines how independently the agent acts */
  autonomyLevel: AgentAutonomyLevel;
  /** Communication endpoint configuration */
  endpoint?: AgentEndpoint;
}

export type AgentAutonomyLevel =
  | "supervised"   // Requires human approval for all actions
  | "guided"       // Can execute routine tasks, escalates novel situations
  | "autonomous"   // Full independent operation within configured bounds
  | "collaborative"; // Prefers group consensus before major actions

export interface AgentEndpoint {
  /** Protocol for reaching this agent */
  protocol: "internal" | "webhook" | "openrouter";
  /** Webhook URL (if protocol is "webhook") */
  url?: string;
  /** OpenRouter model to route to (if protocol is "openrouter") */
  routerModel?: string;
  /** Authentication method */
  auth?: "none" | "bearer" | "did-auth";
}

// ── Agent lifecycle events ─────────────────────────

export type AgentLifecycleEventKind =
  | "activated"       // Agent came online
  | "deactivated"     // Agent went offline
  | "status_changed"  // Status transition
  | "task_started"    // Began working on a task
  | "task_completed"  // Finished a task
  | "message_sent"    // Sent a message to another agent
  | "message_received" // Received a message from another agent
  | "error_occurred"  // Encountered an error
  | "autonomy_changed" // Autonomy level was adjusted
  | "model_changed"   // Model assignment was changed
  | "capability_added" // New skill/toolkit enabled
  | "capability_removed"; // Skill/toolkit disabled

export interface AgentLifecycleEvent {
  kind: AgentLifecycleEventKind;
  agentId: string;
  timestamp: string;
  detail: Record<string, any>;
}

// ── Agent inbox / message queue ────────────────────

export interface AgentInboxMessage {
  id: string;
  request: AgentRequest;
  status: "pending" | "processing" | "completed" | "failed";
  response?: AgentResponse;
  receivedAt: string;
  processedAt?: string;
}

// ── Agent configuration for autonomous operation ───

export interface AgentAutonomyConfig {
  /** How the agent handles incoming tasks */
  autonomyLevel: AgentAutonomyLevel;
  /** Whether the agent can initiate tasks on its own */
  canSelfInitiate: boolean;
  /** Whether the agent can send messages without human trigger */
  canAutoMessage: boolean;
  /** Whether the agent can delegate to other agents */
  canDelegate: boolean;
  /** Maximum concurrent tasks the agent can handle */
  maxConcurrentTasks: number;
  /** Rate limit: max messages per minute */
  maxMessagesPerMinute: number;
  /** Allowed command IDs (empty = all role-permitted commands) */
  allowedCommands?: string[];
  /** Blocked command IDs (takes precedence over allowed) */
  blockedCommands?: string[];
  /** Model override for autonomous operations */
  autonomyModel?: string;
  /** Whether to log all autonomous actions for audit */
  auditLog: boolean;
  /** Spending limit per hour (in USD, for paid API calls) */
  hourlySpendLimit?: number;
}

export const DEFAULT_AGENT_AUTONOMY_CONFIG: AgentAutonomyConfig = {
  autonomyLevel: "guided",
  canSelfInitiate: false,
  canAutoMessage: true,
  canDelegate: true,
  maxConcurrentTasks: 2,
  maxMessagesPerMinute: 10,
  auditLog: true,
  hourlySpendLimit: 1.0,
};
