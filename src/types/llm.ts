/**
 * LLM type definitions — provider, model and context types
 */

export type ProviderId = "anthropic" | "google" | "openai" | "ollama" | "openrouter";

export interface LLMModel {
  id: string;
  label: string;
  desc: string;
  tier: string;
  provider: ProviderId;
  groupKey?: string;
  groupLabel?: string;
}

export type LivenessStatus = "unknown" | "checking" | "online" | "offline" | "no-key";

export interface ProviderState {
  id: ProviderId;
  label: string;
  keyPlaceholder: string;
  keyPrefix: string;
  keyHelpUrl: string;
  apiKey: string;
  liveness: LivenessStatus;
  lastChecked: string | null;
  models: LLMModel[];
}

export interface OllamaInstance {
  id: string;
  label: string;
  baseUrl: string;
  liveness: LivenessStatus;
  lastChecked: string | null;
  models: LLMModel[];
}

/** Stored in localStorage (without live-only fields) */
export interface OllamaInstanceStored {
  id: string;
  label: string;
  baseUrl: string;
}

/** Per-agent model override (stored in localStorage as JSON map) */
export type AgentModelMap = Record<string, string>; // agentId → modelId

/** Per-command model override */
export type CommandModelMap = Record<string, string>; // commandId → modelId

/** Per-group model override (stored in localStorage as JSON map) */
export type GroupModelMap = Record<string, string>; // groupId → modelId

export interface LLMContextType {
  providers: ProviderState[];
  // Global default (used as default for agents)
  globalModel: string;
  setGlobalModel: (modelId: string) => void;
  // Chat model (used by workspace chat)
  chatModel: string;
  setChatModel: (modelId: string) => void;
  // Image generation model
  imageModel: string;
  setImageModel: (modelId: string) => void;
  // Keys
  setProviderKey: (provider: ProviderId, key: string) => void;
  getProviderKey: (provider: ProviderId) => string;
  hasProviderKey: (provider: ProviderId) => boolean;
  // Liveness
  checkLiveness: (provider?: ProviderId) => Promise<void>;
  overallStatus: LivenessStatus;
  // Per-agent
  agentModels: AgentModelMap;
  setAgentModel: (agentId: string, modelId: string) => void;
  clearAgentModel: (agentId: string) => void;
  getAgentModel: (agentId: string, recommendedModel?: string) => string;
  // Per-command
  commandModels: CommandModelMap;
  setCommandModel: (commandId: string, modelId: string) => void;
  clearCommandModel: (commandId: string) => void;
  getCommandModel: (commandId: string, recommendedModel?: string) => string;
  // Per-group
  groupModels: GroupModelMap;
  setGroupModel: (groupId: string, modelId: string) => void;
  clearGroupModel: (groupId: string) => void;
  getGroupModel: (groupId: string, recommendedModel?: string) => string;
  // Ollama instances
  ollamaInstances: OllamaInstance[];
  addOllamaInstance: (label: string, baseUrl: string) => void;
  removeOllamaInstance: (id: string) => void;
  updateOllamaInstance: (id: string, label: string, baseUrl: string) => void;
  refreshOllamaModels: (id: string) => Promise<void>;
  checkOllamaLiveness: (id: string) => Promise<void>;
  // All models flat
  allModels: LLMModel[];
  getModelById: (id: string) => LLMModel | undefined;
  // Open-request counter — Footer watches this to sync panel state
  managerOpenRequest: number;
  openManager: () => void;
}
