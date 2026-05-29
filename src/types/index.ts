import type React from "react";
import type { AieosEntity } from "./aieos";
import type { MeshConfig } from "./mesh";
import type { Job, JobArtifact, JobStep, JobEvent } from "./jobs";
export type { JobEvent };

export type RoleId = "researcher" | "builder" | "curator" | "validator" | "orchestrator";

export type ChannelTypeId = "data" | "task" | "consensus";

export type ChannelMode = "p2p" | "bridge" | "broadcast";

export type GovernanceModelId = "majority" | "threshold" | "delegated" | "unanimous";

export type ViewId =
  | "architect"
  | "networks"
  | "agents"
  | "channels"
  | "channel"
  | "groups"
  | "messages"
  | "network"
  | "data"
  | "profile"
  | "artifacts"
  | "activity"
  | "actions"
  | "jobs"
  | "toolkits"
  | "editor"
  | "studio"
  | "libp2p"
  | "helia"
  | "kubo"
  | "orbitdb"
  | "orbitdb-server"
  | "orchestrator"
  | "navigator"
  | "system";

/** Navigation context for hierarchical drill-down: Ecosystem → Network → Group → Agent → Channel */
export interface NavContext {
  networkId?: string;
  groupId?: string;
  agentId?: string;
  channelId?: string;
  artifactId?: string;
  toolkitId?: string;
}

export type NotebookCategory = "action" | "output" | "navigation" | "system" | "narrative";

export interface NotebookEntry {
  id: string;
  timestamp: number;
  category: NotebookCategory;
  icon: React.ReactNode;
  title: string;
  description: string;
  details?: Record<string, any>;
  tags?: string[];
}

export interface User {
  id: string;
  email: string;
  did: string;
  createdAt: string;
  profile: {
    name: string;
    avatar?: string;
  };
  hasEmailRegistrationCredential: boolean;
  emailValidation?: EmailValidation;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface EmailValidation {
  email: string;
  status: 'pending' | 'verified' | 'failed';
  verifiedAt?: string;
  credentialId?: string;
}

export interface UserProfile {
  id?: string;
  username?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  [key: string]: any;
}

export interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  loginWithDID: (did: string, signature: string) => Promise<void>;
  registerDID: () => Promise<{ did: string } | null>;
  issueEmailCredential: () => Promise<boolean>;
  updateEmailValidation: (validation: EmailValidation) => void;
  logout: () => Promise<void>;
  isInitialized: boolean;
  clearError: () => void;
  token: string | null;
}

export type ArchPhase = "input" | "preview" | "deploying" | "done";

export type MessageStatus = "sending" | "delivered" | "no-prompt" | "read" | "failed";

export interface Role {
  id: RoleId;
  label: string;
  icon: React.ReactNode;
  char: string;
  color: string;
}

export interface ChannelType {
  id: ChannelTypeId;
  label: string;
  icon: React.ReactNode;
}

export interface GovernanceModel {
  id: GovernanceModelId;
  label: string;
  icon: React.ReactNode;
  desc: string;
}

export interface PromptTemplate {
  label: string;
  prompt: string;
}

export interface ScenarioPreset {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  desc: string;
}

export interface KeyPair {
  pub: string;
  priv: string;
}

// ── AIEOS v1.2.0 — AI Entity Object Specification ──
export type {
  AieosVersion, AieosSkill, AieosIdentity, AieosPhysicality, AieosPsychology,
  AieosLinguistics, AieosHistory, AieosInterests, AieosMotivations,
  AieosPresence, AieosSocialLink, AieosAccess, AieosNetwork, AieosWallet, AieosSettlement,
  AieosEntity,
} from "./aieos";

// ── Agent Runtime ──
export type {
  AgentRuntimeStatus, AgentRuntimeState, AgentAutonomyLevel,
  AgentAutonomyConfig, AgentEndpoint, AgentLifecycleEvent, AgentLifecycleEventKind,
  AgentChatMessage, AgentToolCall, AgentToolDefinition,
  AgentRequest, AgentResponse, AgentResponseChoice,
  AgentInboxMessage,
} from "./agentRuntime";
export { DEFAULT_AGENT_AUTONOMY_CONFIG } from "./agentRuntime";

// ── Toolkit System ──

export type ToolkitId =
  // Command-group toolkits (built-in)
  | "agent-management"
  | "infrastructure"
  | "ecosystem"
  | "autonomy"
  | "artifacts"
  | "studio"
  | "jobs"
  | "image-gen"
  | "workspace-mgmt"
  | "logging"
  | "collective-memory"
  | "libp2p"
  | "helia"
  | "kubo"
  | "orbitdb"
  | "orbitdb-server"
  | "orchestrator"
  | "navigator"
  // Capability toolkits (external)
  | "web-crawler"
  | "ocr"
  | "audio-to-text"
  | "video-to-text";

export type ToolkitCategory =
  | "agents"
  | "infrastructure"
  | "data"
  | "ai"
  | "automation"
  | "system"
  | "media"
  | "data-ingestion"
  | "analysis";

export interface ToolkitTool {
  id: string;
  name: string;
  description: string;
  inputSchema?: Record<string, any>;
  /**
   * Optional command-registry ID this tool is backed by.
   *
   * When set, the tool is promoted to a *direct* LLM-facing tool for any
   * agent bound to this toolkit (i.e. it appears in the Anthropic tool
   * array alongside the curated default surface). When unset, the entry
   * is descriptive metadata only — the underlying capability is still
   * reachable through the `create_job` meta-tool.
   *
   * A toolkit that declares at least one `tools[].commandId` thereby
   * defines its curated agent-facing surface; commands present in
   * `toolkit.commands` but not in any `tools[].commandId` remain
   * registry-only (reachable via `create_job` / `list_available_commands`).
   *
   * A toolkit with no `tools[].commandId` entries falls back to exposing
   * every command in `toolkit.commands` as a direct tool (legacy behavior).
   */
  commandId?: string;
}

export interface ToolkitAgent {
  id: string;
  name: string;
  description: string;
  capabilities?: string[];
  status?: "active" | "idle" | "offline";
  aieos?: AieosEntity;
}

export interface Toolkit {
  id: ToolkitId;
  name: string;
  description: string;
  icon: string;        // lucide icon name
  color: string;
  gradient: [string, string];
  category: ToolkitCategory;
  tools: ToolkitTool[];
  agents?: ToolkitAgent[];      // Sub-agents in this toolkit
  commands: string[];           // Command IDs in this toolkit
  jobTemplates?: string[];      // Job template IDs
  automations?: string[];       // Automation/trigger IDs
  status: "available" | "coming-soon" | "deprecated";
  builtIn?: boolean;            // Built-in toolkit (ships with platform)
  tags?: string[];              // Searchable tags
  labels?: Record<string, string>;       // Structured k/v labels for filtering
  annotations?: Record<string, string>;  // Non-identifying metadata
  version?: string;             // Semantic version
  /** Author/maintainer metadata. */
  author?: { name: string; email?: string; url?: string };
  /** SPDX license identifier. */
  license?: string;
  /** Source repository URL. */
  repository?: string;
  /** Homepage / documentation site. */
  homepage?: string;
  /** ISO-8601 creation timestamp. */
  createdAt?: string;
  /** ISO-8601 last-updated timestamp. */
  updatedAt?: string;
  /** OCI content-addressable digest. */
  digest?: string;
  /** Optional app/frontend surface contributed by this toolkit. */
  app?: {
    id: string;
    name: string;
    platforms: string[];
    viewId?: string;
    url?: string;
    description?: string;
  };
  /** Whether the toolkit tracks user-facing activity. */
  activityEnabled?: boolean;
  /** Number of configuration fields exposed by this toolkit. */
  configFieldCount?: number;
  /** Number of observable metrics declared by this toolkit. */
  metricCount?: number;
  /** Number of task definitions. */
  taskCount?: number;
  /** Number of managed data collections. */
  collectionCount?: number;
  /** Number of notification templates. */
  notificationCount?: number;
  /** Number of RBAC permissions declared. */
  permissionCount?: number;
  /** Number of test cases. */
  testCount?: number;
  /** Number of documentation pages. */
  docCount?: number;
  /** Number of API endpoints. */
  endpointCount?: number;
  /** Active facets provided by this toolkit. */
  facets?: string[];
}

export interface AgentToolkitBinding {
  toolkitId: ToolkitId;
  enabledAt: string;
  config?: Record<string, any>;  // Toolkit-specific settings
}

export interface Agent {
  id: string;
  name: string;
  title?: string;  // Job title / descriptor (e.g. "Lead Researcher", "Security Analyst")
  role: RoleId;
  prompt: string;
  did: string;
  keys: KeyPair;
  createdAt: string;
  status: "active";
  networkId?: string;  // Which network this agent belongs to
  aieos: AieosEntity;  // AIEOS v1.2.0 portable entity spec (always created on agent init)
  /** When true, the agent is isolated from collective shared memory. */
  isDarkAgent?: boolean;
  recommendedModel?: string; // Suggested LLM model id (e.g. "claude-sonnet-4-20250514")
  toolkits?: AgentToolkitBinding[];  // Enabled toolkits for this agent
  // v1.2.0 — Agent runtime & autonomy fields
  runtimeStatus?: import("./agentRuntime").AgentRuntimeStatus;  // Current operational state (idle/busy/thinking/listening/offline/error)
  autonomyConfig?: import("./agentRuntime").AgentAutonomyConfig; // Autonomy settings for independent operation
  endpoint?: import("./agentRuntime").AgentEndpoint;  // Communication endpoint (internal/webhook/openrouter)
  lifecycleLog?: import("./agentRuntime").AgentLifecycleEvent[];  // Append-only audit trail
  lastActivityAt?: string;  // ISO timestamp of last action
  activeSince?: string;  // ISO timestamp when agent was activated
}

export interface Channel {
  id: string;
  from: string;
  to: string;
  type: ChannelTypeId;
  mode?: ChannelMode;  // p2p (default/local), bridge (cross-network), broadcast (group)
  offset: number;
  createdAt: string;
  networkId?: string;  // Which network this channel belongs to (absent for bridge-mode)
  // Bridge-specific fields (present when mode === "bridge")
  fromNetworkId?: string;
  toNetworkId?: string;
}

/**
 * Group kind — distinguishes a "native" group (members all live in one
 * network) from a "huddle" (an ad-hoc cross-network assembly summoned by
 * the navigator).
 *
 * Both kinds persist into the groups list; a huddle simply spans multiple
 * networks and renders with a different affordance in the UI.
 */
export type GroupKind = "native" | "huddle";

export interface Group {
  id: string;
  name: string;
  governance: GovernanceModelId;
  members: string[];
  threshold: number;
  did: string;
  color: string;
  createdAt: string;
  /** Owning network (always set for kind="native"; the primary/host network for kind="huddle"). */
  networkId?: string;
  /**
   * For kind="huddle": the full set of networks contributing members.
   * Omitted for native groups (use `networkId` instead).
   */
  networkIds?: string[];
  /** Defaults to "native" if absent. */
  kind?: GroupKind;
  /**
   * For huddles: which entity summoned it (typically "navigator", an
   * agent DID, or "user"). Surfaced in the UI so operators can tell
   * ad-hoc assemblies apart from designed groups.
   */
  summonedBy?: string;
  /** For huddles: the goal/topic this assembly was formed around. */
  topic?: string;
  modelId?: string;    // LLM model override for group decision-making
}

export interface Message {
  id: string;
  channelId: string;
  fromId: string;
  toId: string;
  content: string;
  response: string | null;
  status: MessageStatus;
  ts: number;
  readAt?: number;
}

export interface BridgeMessage {
  id: string;
  bridgeId: string;
  fromId: string;
  toId: string;
  content: string;
  response: string | null;
  status: MessageStatus;
  ts: number;
  readAt?: number;
}

export interface Network {
  id: string;
  name: string;
  did: string;
  color: string;
  agents: Agent[];
  channels: Channel[];
  groups: Group[];
  messages: Message[];
  createdAt: string;
  description?: string;
}

/** First-class Ecosystem — the "universe" of networks and bridges within a workspace */
export interface Ecosystem {
  id: string;
  name: string;
  did: string;
  networks: Network[];
  bridges: Bridge[];
  bridgeMessages: BridgeMessage[];
  createdAt: string;
}

export interface Bridge {
  id: string;
  fromNetworkId: string;
  toNetworkId: string;
  fromAgentId: string;
  toAgentId: string;
  type: ChannelTypeId;
  offset: number;
  createdAt: string;
}

export interface LogEntry {
  msg: string;
  ts: number;
}

export interface DeployProgress {
  step: string;
  count: number;
  total: number;
}

// ── MeshConfig types ──
export type {
  MeshConfig, MeshConfigNetwork, MeshConfigBridge, MeshConfigAgent,
  MeshConfigChannel, MeshConfigGroup, MeshConfigMessage,
} from "./mesh";

export interface NewAgentForm {
  name: string;
  title: string;
  role: RoleId;
  prompt: string;
  templateIdx: number;
  networkId: string;
}

export interface ChannelForm {
  from: string;
  to: string;
  type: ChannelTypeId;
  networkId: string;
}

export interface GroupForm {
  name: string;
  governance: GovernanceModelId;
  members: string[];
  threshold: number;
  networkId: string;
}

export interface BridgeForm {
  fromNet: string;
  toNet: string;
  fromAgent: string;
  toAgent: string;
  type: ChannelTypeId;
}

// ── Credebl / SSI Types ──
export type {
  ApiResponse, DIDDocument, VerifiableCredential, CredentialOffer,
  VerificationRequest, ProofRequest, Connection, Schema,
  CredentialDefinition, EmailRegistrationCredential,
  AgentType, OrgAgentConfig, EmailOTPRequest, EmailOTPVerification,
} from "./ssi";

// ── Job Queue Types ──
export type {
  JobStatus, ArtifactType, JobArtifact, JobStep, JobDeliverable,
  InputSourceKind, InputSource, EntityInput, TriggerEvent,
  JobTrigger, JobDefinition, Job, StepHandler,
} from "./jobs";


export interface CreateAgentRequest {
  name: string;
  role: RoleId;
  prompt: string;
  networkId?: string;
}

export interface UpdateAgentPromptRequest {
  id: string;
  prompt: string;
}

export interface CreateChannelRequest {
  from: string;
  to: string;
  type: ChannelTypeId;
}

export interface CreateGroupRequest {
  name: string;
  members: string[]; // agent IDs
  governance: GovernanceModelId;
  /** Optional kind discriminator. Defaults to "native". */
  kind?: GroupKind;
  /** For huddles: full list of contributing networks. */
  networkIds?: string[];
  /** For huddles: caller identifier (e.g. "navigator", agent DID, "user"). */
  summonedBy?: string;
  /** For huddles: free-text topic/goal that the assembly is forming around. */
  topic?: string;
}

export interface SendMessageRequest {
  from_agent_id: string;  // Agent ID or 'user' for the current user's DID
  to_agent_id: string;    // Recipient agent ID
  message: string;
}

export interface BroadcastMessageRequest {
  group_id: string;
  message: string;
}

export interface DeployNetworkRequest {
  config: MeshConfig;
}

export interface DeleteRequest {
  id?: string; // Single delete
  type?: "agents" | "channels" | "groups" | "messages"; // Bulk delete
  ids?: string[]; // Bulk delete
}

export interface CreateBridgeRequest {
  from_network: string;
  to_network: string;
  from_agent: string;
  to_agent: string;
  type: ChannelTypeId;
}

export interface CreateNetworkRequest {
  name: string;
  description?: string;
  architectPrompt?: string;  // Optional: use Architect to generate the network
}

export interface ResetWorkspaceRequest { }

// Discriminated Union for all Job types
export type JobRequest =
  | { type: "create_agent"; request: CreateAgentRequest }
  | { type: "update_agent_prompt"; request: UpdateAgentPromptRequest }
  | { type: "create_channel"; request: CreateChannelRequest }
  | { type: "create_group"; request: CreateGroupRequest }
  | { type: "send_message"; request: SendMessageRequest }
  | { type: "broadcast_message"; request: BroadcastMessageRequest }
  | { type: "deploy_network"; request: DeployNetworkRequest }
  | { type: "delete_agent"; request: DeleteRequest }
  | { type: "delete_channel"; request: DeleteRequest }
  | { type: "delete_group"; request: DeleteRequest }
  | { type: "bulk_delete"; request: DeleteRequest }
  | { type: "create_bridge"; request: CreateBridgeRequest }
  | { type: "create_network"; request: CreateNetworkRequest }
  | { type: "reset_workspace"; request: ResetWorkspaceRequest }
  // Fallback for dynamic/other jobs
  | { type: string; request: Record<string, any>; steps?: JobStep[]; mode?: 'serial' | 'parallel' | 'mixed'; parallelGroups?: Array<{ id: string; label: string; stepIds: string[] }> };


export interface WorkspaceMetadata {
  id: string;
  name: string;
  created: number;
  lastModified: number;
  description?: string;
  stats?: {
    agentCount: number;
    channelCount: number;
    groupCount: number;
    networkCount: number;
  };
}

export interface Workspace {
  metadata: WorkspaceMetadata;

  /** First-class ecosystem (target model: all entities live here) */
  ecosystem?: Ecosystem;
  /** Which network is currently focused/active in the UI */
  activeNetworkId?: string;
  /** Which user was last associated with this workspace */
  userId?: string;

  // ─── Legacy top-level arrays (kept for backward compat during migration) ───
  /** @deprecated Agents should live inside Network. Will be removed once migration completes. */
  agents: Agent[];
  /** @deprecated Channels should live inside Network. Will be removed once migration completes. */
  channels: Channel[];
  /** @deprecated Groups should live inside Network. Will be removed once migration completes. */
  groups: Group[];
  /** @deprecated Messages should live inside Network. Will be removed once migration completes. */
  messages: Message[];
  /** @deprecated Use ecosystem.networks instead */
  networks?: Network[];
  /** @deprecated Use ecosystem.bridges instead */
  bridges?: Bridge[];

  jobs?: Job[];
  artifacts?: JobArtifact[];
  automations?: any[]; // AutomationDefinition
  automationRuns?: any[]; // AutomationRun
}
