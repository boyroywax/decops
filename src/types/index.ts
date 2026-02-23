import type React from "react";

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
  | "actions";

/** Navigation context for hierarchical drill-down: Ecosystem → Network → Group → Agent → Channel */
export interface NavContext {
  networkId?: string;
  groupId?: string;
  agentId?: string;
  channelId?: string;
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

export interface AieosSkill {
  name: string;
  description: string;
  uri?: string;
  version?: string;
  auto_activate?: boolean;
  priority?: number; // 1 (highest) – 10 (lowest)
}

export interface AieosIdentity {
  names: { first: string; middle?: string; last?: string; nickname?: string };
  bio?: { birthday?: string; age_biological?: number; age_perceived?: number; gender?: string };
  origin?: { nationality?: string; ethnicity?: string; birthplace?: { city?: string; country?: string } };
  residence?: { current_city?: string; current_country?: string; dwelling_type?: string };
}

export interface AieosPhysicality {
  face?: {
    shape?: string;
    skin?: { tone?: string; texture?: string; details?: string[] };
    eyes?: { color?: string; shape?: string; eyebrows?: string; corrective_lenses?: string };
    hair?: { color?: string; style?: string; texture?: string };
    facial_hair?: string;
    nose?: string;
    mouth?: string;
    distinguishing_features?: string[];
  };
  body?: {
    height_cm?: number;
    weight_kg?: number;
    somatotype?: "Ectomorph" | "Mesomorph" | "Endomorph" | string;
    build_description?: string;
    posture?: string;
    scars_tattoos?: string[];
  };
  style?: {
    aesthetic_archetype?: string;
    clothing_preferences?: string[];
    accessories?: string[];
    color_palette?: string[];
  };
  image_prompts?: { portrait?: string; full_body?: string };
}

export interface AieosPsychology {
  neural_matrix?: {
    creativity?: number; empathy?: number; logic?: number;
    adaptability?: number; charisma?: number; reliability?: number;
  };
  traits?: {
    ocean?: { openness?: number; conscientiousness?: number; extraversion?: number; agreeableness?: number; neuroticism?: number };
    mbti?: string;
    enneagram?: string;
    temperament?: string;
  };
  moral_compass?: { alignment?: string; core_values?: string[]; conflict_resolution_style?: string };
  mental_patterns?: { decision_making_style?: string; attention_span?: string; learning_style?: string };
  emotional_profile?: {
    base_mood?: string;
    volatility?: number;
    resilience?: string;
    triggers?: { joy?: string[]; anger?: string[]; sadness?: string[] };
  };
  idiosyncrasies?: { phobias?: string[]; obsessions?: string[]; tics?: string[] };
}

export interface AieosLinguistics {
  voice?: {
    tts_config?: { provider?: string; voice_id?: string; stability?: number; similarity_boost?: number };
    acoustics?: { pitch?: string; speed?: string; roughness?: number; breathiness?: number };
    accent?: { region?: string; strength?: number };
  };
  text_style?: {
    formality_level?: number;
    verbosity_level?: number;
    vocabulary_level?: string;
    slang_usage?: boolean;
    style_descriptors?: string[];
  };
  syntax?: { sentence_structure?: string; use_contractions?: boolean; active_passive_ratio?: number };
  interaction?: { turn_taking?: string; dominance_score?: number; emotional_coloring?: string };
  idiolect?: { catchphrases?: string[]; forbidden_words?: string[]; hesitation_markers?: boolean };
}

export interface AieosHistory {
  origin_story?: string;
  education?: { level?: string; field?: string; institution?: string; graduation_year?: number };
  occupation?: { title?: string; industry?: string; years_experience?: number; previous_jobs?: string[] };
  family?: { relationship_status?: string; parents?: string; siblings?: string; children?: string; pets?: string };
  key_life_events?: Array<{ year?: number; event?: string; impact?: string }>;
}

export interface AieosInterests {
  hobbies?: string[];
  favorites?: { music_genre?: string; book?: string; movie?: string; color?: string; food?: string; season?: string };
  aversions?: string[];
  lifestyle?: { diet?: string; sleep_schedule?: string; digital_habits?: string };
}

export interface AieosMotivations {
  core_drive?: string;
  goals?: { short_term?: string[]; long_term?: string[] };
  fears?: { rational?: string[]; irrational?: string[] };
}

/** AIEOS v1.1.0 — full entity object attached to an agent */
export interface AieosEntity {
  standard: { protocol: "AIEOS"; version: "1.1.0"; schema_url: string };
  metadata: {
    instance_id: string;
    instance_version: string;
    generator: string;
    created_at: string;
    last_updated: string;
  };
  capabilities?: { skills: AieosSkill[] };
  identity?: AieosIdentity;
  physicality?: AieosPhysicality;
  psychology?: AieosPsychology;
  linguistics?: AieosLinguistics;
  history?: AieosHistory;
  interests?: AieosInterests;
  motivations?: AieosMotivations;
}

export interface Agent {
  id: string;
  name: string;
  role: RoleId;
  prompt: string;
  did: string;
  keys: KeyPair;
  createdAt: string;
  status: "active";
  networkId?: string;  // Which network this agent belongs to
  aieos: AieosEntity;  // AIEOS v1.1.0 portable entity spec (always created on agent init)
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

export interface MeshConfig {
  networks?: MeshConfigNetwork[];
  agents: MeshConfigAgent[];
  channels: MeshConfigChannel[];
  groups: MeshConfigGroup[];
  bridges?: MeshConfigBridge[];
  exampleMessages: MeshConfigMessage[];
}

export interface MeshConfigNetwork {
  name: string;
  description?: string;
  agents: number[]; // indices into agents array
}

export interface MeshConfigBridge {
  fromNetwork: number; // index into networks array
  toNetwork: number;
  fromAgent: number; // index into agents array
  toAgent: number;
  type: string; // channel type
}

export interface MeshConfigAgent {
  name: string;
  role: string;
  prompt: string;
  network?: number; // index into networks array (alternative to MeshConfigNetwork.agents)
}

export interface MeshConfigChannel {
  from: number;
  to: number;
  type: string;
}

export interface MeshConfigGroup {
  name: string;
  governance: string;
  members: number[];
  threshold: number;
}

export interface MeshConfigMessage {
  channelIdx: number;
  message: string;
}

export interface NewAgentForm {
  name: string;
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

// Credebl / SSI Types

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface DIDDocument {
  id: string;
  controller: string;
  verificationMethod: any[];
  authentication: string[];
  assertionMethod: string[];
}

export interface VerifiableCredential {
  '@context': string[];
  id: string;
  type: string[];
  issuer: { id: string; name?: string } | string;
  issuanceDate: string;
  credentialSubject: Record<string, any>;
  proof?: any;
}

export interface CredentialOffer {
  credentialRecordId?: string;
  credentialDefinitionId: string;
  attributes: { name: string; value: string }[];
}

export interface VerificationRequest {
  proofRecordId?: string;
  state: string;
  presentationRequest?: any;
}

export interface ProofRequest {
  name: string;
  version: string;
  attributes: Record<string, any>;
}

export interface Connection {
  connectionId: string;
  state: string;
  theirDid: string;
  theirLabel: string;
}

export interface Schema {
  schemaId: string;
  name: string;
  version: string;
  attributes: string[];
}

export interface CredentialDefinition {
  credentialDefinitionId: string;
  tag: string;
  schemaId: string;
}

export interface EmailRegistrationCredential extends VerifiableCredential {
  credentialSubject: {
    id: string;
    email: string;
    registrationDate: string;
    serviceName: string;
    serviceProvider: string;
    verifiedAt?: string;
  };
}

export type AgentType = 'DEDICATED' | 'SHARED';

export interface OrgAgentConfig {
  orgId: string;
  orgDid: string;
  agentType: AgentType;
  agentEndpoint: string;
  tenantId?: string;
  isActive: boolean;
  ledger?: string;
  network?: string;
}

export interface EmailOTPRequest {
  email: string;
}


export interface EmailOTPVerification {
  email: string;
  otp: string;
}

// Job Queue Types

export type JobStatus = "queued" | "running" | "completed" | "failed";

export type ArtifactType = "markdown" | "json" | "yaml" | "csv" | "image" | "code";

export interface JobArtifact {
  id: string;
  type: ArtifactType;
  content?: string; // Text content
  url?: string; // URL for images or downloads
  name: string;
  tags?: string[];  // Tag-based organization (e.g. "type:json", "agent:alice", "network:alpha")
  createdAt?: number;  // Unix timestamp
  description?: string;  // Optional description
  source?: "job" | "import" | "command" | "user";  // Where the artifact came from
}

export interface JobStep {
  id: string;
  commandId: string;
  args: Record<string, any>;
  name?: string;
  status?: "pending" | "running" | "completed" | "failed" | "skipped";
  result?: string;
  condition?: string; // JS expression string
}

export interface JobDefinition {
  id: string;
  name: string;
  description: string;
  mode: 'serial' | 'parallel';
  steps: JobStep[];
  createdAt: number;
  updatedAt: number;
}


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
  from_agent_name: string;
  to_agent_name: string;
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
  | { type: string; request: Record<string, any>; steps?: JobStep[]; mode?: 'serial' | 'parallel' };

export interface Job {
  id: string;
  type: string; // We keep string here to match JobRequest.type easily, or we can stricter it to JobRequest['type']
  status: JobStatus;
  request: Record<string, any>; // Keeping flexible for storage, but addJob enforces JobRequest

  result?: string;
  artifacts: JobArtifact[];
  createdAt: number;
  updatedAt: number;

  // Multi-step job fields
  jobDefinitionId?: string;
  steps?: JobStep[];
  currentStepIndex?: number;
  stepResults?: Record<string, any>;
  mode?: 'serial' | 'parallel';
}


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
