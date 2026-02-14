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
  | "network";

export type ArchPhase = "input" | "preview" | "deploying" | "done";

export type MessageStatus = "sending" | "delivered" | "no-prompt";

export interface Role {
  id: RoleId;
  label: string;
  icon: string;
  color: string;
}

export interface ChannelType {
  id: ChannelTypeId;
  label: string;
  icon: string;
}

export interface GovernanceModel {
  id: GovernanceModelId;
  label: string;
  icon: string;
  desc: string;
}

export interface PromptTemplate {
  label: string;
  prompt: string;
}

export interface ScenarioPreset {
  id: string;
  label: string;
  icon: string;
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
