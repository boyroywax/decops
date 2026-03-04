import type React from "react";
import type { AieosEntity } from "./aieos";
import type { MeshConfig } from "./mesh";
import type { Job, JobArtifact, JobStep } from "./jobs";

export type RoleId = "researcher" | "builder" | "curator" | "validator" | "orchestrator";

export type ChannelTypeId = "data" | "task" | "consensus";

export type ChannelMode = "p2p" | "bridge" | "broadcast";

export type GovernanceModelId = "majority" | "threshold" | "delegated" | "unanimous";

export type ViewId =
  | "architect"
  | "networks"
  | "ecosystem"  // Legacy alias
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
  | "editor";

/** Navigation context for hierarchical drill-down: Ecosystem → Network → Group → Agent → Channel */
export interface NavContext {
  networkId?: string;
  groupId?: string;
  agentId?: string;
  channelId?: string;
  artifactId?: string;
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

export type MessageStatus = "sending" | "delivered" | "no-prompt";

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

// ── AIEOS v1.1.0 — AI Entity Object Specification ──
export type {
  AieosSkill, AieosIdentity, AieosPhysicality, AieosPsychology,
  AieosLinguistics, AieosHistory, AieosInterests, AieosMotivations,
  AieosEntity,
} from "./aieos";

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
  aieos: AieosEntity;  // AIEOS v1.1.0 portable entity spec (always created on agent init)
  recommendedModel?: string; // Suggested LLM model id (e.g. "claude-sonnet-4-20250514")
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

export interface Group {
  id: string;
  name: string;
  governance: GovernanceModelId;
  members: string[];
  threshold: number;
  did: string;
  color: string;
  createdAt: string;
  networkId?: string;  // Which network this group belongs to
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
