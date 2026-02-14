import type React from "react";

export type RoleId = "researcher" | "builder" | "curator" | "validator" | "orchestrator";

export type ChannelTypeId = "data" | "task" | "consensus";

export type GovernanceModelId = "majority" | "threshold" | "delegated" | "unanimous";

export type ViewId =
  | "architect"
  | "ecosystem"
  | "agents"
  | "channels"
  | "groups"
  | "messages"
  | "network"
  | "data"
  | "profile"
  | "artifacts"
  | "activity";

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

export interface Agent {
  id: string;
  name: string;
  role: RoleId;
  prompt: string;
  did: string;
  keys: KeyPair;
  createdAt: string;
  status: "active";
}

export interface Channel {
  id: string;
  from: string;
  to: string;
  type: ChannelTypeId;
  offset: number;
  createdAt: string;
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
  agents: MeshConfigAgent[];
  channels: MeshConfigChannel[];
  groups: MeshConfigGroup[];
  exampleMessages: MeshConfigMessage[];
}

export interface MeshConfigAgent {
  name: string;
  role: string;
  prompt: string;
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
}

export interface ChannelForm {
  from: string;
  to: string;
  type: ChannelTypeId;
}

export interface GroupForm {
  name: string;
  governance: GovernanceModelId;
  members: string[];
  threshold: number;
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

export interface JobArtifact {
  id: string;
  type: "markdown" | "json" | "yaml" | "csv" | "image" | "code";
  content?: string; // Text content
  url?: string; // URL for images or downloads
  name: string;
}

export interface Job {
  id: string;
  type: string;
  status: JobStatus;
  request: Record<string, any>; // Flexible request parameters
  result?: string;
  artifacts: JobArtifact[];
  createdAt: number;
  updatedAt: number;
}

