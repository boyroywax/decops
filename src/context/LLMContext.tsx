/**
 * LLM Context — centralised model & provider management
 *
 * Manages:
 *  - Provider registry (Anthropic, Google AI / Gemini)
 *  - API keys per provider
 *  - Global default model selection
 *  - Per-agent model overrides
 *  - Per-command model overrides
 *  - Liveness probes for each provider
 */

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";

// ── Types ──────────────────────────────────────────

export type ProviderId = "anthropic" | "google" | "openai" | "ollama";

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
interface OllamaInstanceStored {
  id: string;
  label: string;
  baseUrl: string;
}

/** Per-agent model override (stored in localStorage as JSON map) */
export type AgentModelMap = Record<string, string>; // agentId → modelId

/** Per-command model override */
export type CommandModelMap = Record<string, string>; // commandId → modelId

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
  getAgentModel: (agentId: string, recommendedModel?: string) => string; // override → recommended → global
  // Per-command
  commandModels: CommandModelMap;
  setCommandModel: (commandId: string, modelId: string) => void;
  clearCommandModel: (commandId: string) => void;
  getCommandModel: (commandId: string, recommendedModel?: string) => string;
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

// ── Constants ──────────────────────────────────────

const ANTHROPIC_MODELS: LLMModel[] = [
  { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", desc: "Best balance of speed and intelligence", tier: "recommended", provider: "anthropic" },
  { id: "claude-opus-4-20250514", label: "Claude Opus 4", desc: "Most capable model for complex tasks", tier: "premium", provider: "anthropic" },
  { id: "claude-haiku-3-5-20241022", label: "Claude 3.5 Haiku", desc: "Fastest and most affordable", tier: "fast", provider: "anthropic" },
  { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet", desc: "Previous generation balanced model", tier: "standard", provider: "anthropic" },
];

const GOOGLE_MODELS: LLMModel[] = [
  { id: "imagen-4.0-generate-001", label: "Imagen 4.0", desc: "Image generation (portraits & badges)", tier: "image", provider: "google" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", desc: "Fast multimodal reasoning", tier: "fast", provider: "google" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", desc: "Advanced reasoning and coding", tier: "premium", provider: "google" },
];

const OPENAI_MODELS: LLMModel[] = [
  { id: "gpt-4.1", label: "GPT-4.1", desc: "Most capable GPT model", tier: "premium", provider: "openai" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 Mini", desc: "Balanced speed and intelligence", tier: "recommended", provider: "openai" },
  { id: "gpt-4.1-nano", label: "GPT-4.1 Nano", desc: "Fastest and most affordable", tier: "fast", provider: "openai" },
  { id: "gpt-4o", label: "GPT-4o", desc: "Fast multimodal model", tier: "standard", provider: "openai" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini", desc: "Small and fast for simple tasks", tier: "fast", provider: "openai" },
  { id: "o3", label: "o3", desc: "Advanced reasoning model", tier: "premium", provider: "openai" },
  { id: "o4-mini", label: "o4-mini", desc: "Fast reasoning model", tier: "fast", provider: "openai" },
];

const LS_KEYS = {
  anthropicKey: "anthropic_api_key",
  anthropicModel: "anthropic_model",
  chatModel: "llm_chat_model",
  imageModel: "llm_image_model",
  geminiKey: "gemini_api_key",
  openaiKey: "openai_api_key",
  ollamaInstances: "ollama_instances",
  agentModels: "llm_agent_models",
  commandModels: "llm_command_models",
} as const;

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

// ── Liveness probes ────────────────────────────────

async function probeAnthropic(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
    });
    // 200 = success, 429 = rate limited (still reachable)
    return res.ok || res.status === 429;
  } catch {
    return false;
  }
}

async function probeGoogle(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { method: "GET" },
    );
    return res.ok;
  } catch {
    return false;
  }
}

async function probeOpenAI(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
    return res.ok || res.status === 429;
  } catch {
    return false;
  }
}

async function probeOllama(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/version`, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchOllamaModelTags(baseUrl: string, instanceId: string, instanceLabel: string): Promise<LLMModel[]> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { method: "GET" });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.models || !Array.isArray(data.models)) return [];
    return data.models.map((m: any) => ({
      id: `ollama:${instanceId}:${m.name}`,
      label: m.name,
      desc: m.details
        ? `${m.details.parameter_size || ""} \u2022 ${m.details.family || ""} \u2022 ${m.details.quantization_level || ""}`.replace(/\s*\u2022\s*$/g, "")
        : "Local model",
      tier: "local",
      provider: "ollama" as ProviderId,
      groupKey: `ollama-${instanceId}`,
      groupLabel: `Ollama \u2014 ${instanceLabel}`,
    }));
  } catch {
    return [];
  }
}

// ── Context ────────────────────────────────────────

const LLMContext = createContext<LLMContextType | null>(null);

export function useLLM(): LLMContextType {
  const ctx = useContext(LLMContext);
  if (!ctx) throw new Error("useLLM must be used inside <LLMProvider>");
  return ctx;
}

// ── Provider ───────────────────────────────────────

export function LLMProvider({ children }: { children: ReactNode }) {
  // Provider states
  const [anthropicKey, setAnthropicKey] = useState(() => localStorage.getItem(LS_KEYS.anthropicKey) || "");
  const [geminiKey, setGeminiKeyState] = useState(() => localStorage.getItem(LS_KEYS.geminiKey) || "");
  const [openaiKey, setOpenaiKeyState] = useState(() => localStorage.getItem(LS_KEYS.openaiKey) || "");
  const [anthropicLiveness, setAnthropicLiveness] = useState<LivenessStatus>(anthropicKey ? "unknown" : "no-key");
  const [googleLiveness, setGoogleLiveness] = useState<LivenessStatus>(geminiKey ? "unknown" : "no-key");
  const [openaiLiveness, setOpenaiLiveness] = useState<LivenessStatus>(openaiKey ? "unknown" : "no-key");
  const [anthropicLastChecked, setAnthropicLastChecked] = useState<string | null>(null);
  const [googleLastChecked, setGoogleLastChecked] = useState<string | null>(null);
  const [openaiLastChecked, setOpenaiLastChecked] = useState<string | null>(null);

  // Ollama instances
  const [ollamaInstances, setOllamaInstancesState] = useState<OllamaInstance[]>(() => {
    try {
      const stored: OllamaInstanceStored[] = JSON.parse(localStorage.getItem(LS_KEYS.ollamaInstances) || "[]");
      return stored.map(s => ({ ...s, liveness: "unknown" as LivenessStatus, lastChecked: null, models: [] }));
    } catch { return []; }
  });

  // Global model (agent default)
  const [globalModel, setGlobalModelState] = useState(() => localStorage.getItem(LS_KEYS.anthropicModel) || DEFAULT_MODEL);

  // Chat model
  const [chatModel, setChatModelState] = useState(() => localStorage.getItem(LS_KEYS.chatModel) || DEFAULT_MODEL);

  // Image generation model
  const DEFAULT_IMAGE_MODEL = "imagen-4.0-generate-001";
  const [imageModel, setImageModelState] = useState(() => localStorage.getItem(LS_KEYS.imageModel) || DEFAULT_IMAGE_MODEL);

  // Per-agent overrides
  const [agentModels, setAgentModelsState] = useState<AgentModelMap>(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEYS.agentModels) || "{}"); } catch { return {}; }
  });

  // Per-command overrides
  const [commandModels, setCommandModelsState] = useState<CommandModelMap>(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEYS.commandModels) || "{}"); } catch { return {}; }
  });

  // Manager open-request counter (Footer watches this)
  const [managerOpenRequest, setManagerOpenRequest] = useState(0);

  // Guards against double-probe on mount
  const probeRan = useRef(false);

  // ── Persistence helpers ──

  const setGlobalModel = useCallback((modelId: string) => {
    setGlobalModelState(modelId);
    localStorage.setItem(LS_KEYS.anthropicModel, modelId);
  }, []);

  const setChatModel = useCallback((modelId: string) => {
    setChatModelState(modelId);
    localStorage.setItem(LS_KEYS.chatModel, modelId);
  }, []);

  const setImageModel = useCallback((modelId: string) => {
    setImageModelState(modelId);
    localStorage.setItem(LS_KEYS.imageModel, modelId);
  }, []);

  const setProviderKey = useCallback((provider: ProviderId, key: string) => {
    const trimmed = key.trim();
    if (provider === "anthropic") {
      setAnthropicKey(trimmed);
      if (trimmed) localStorage.setItem(LS_KEYS.anthropicKey, trimmed);
      else localStorage.removeItem(LS_KEYS.anthropicKey);
      setAnthropicLiveness(trimmed ? "unknown" : "no-key");
    } else if (provider === "google") {
      setGeminiKeyState(trimmed);
      if (trimmed) localStorage.setItem(LS_KEYS.geminiKey, trimmed);
      else localStorage.removeItem(LS_KEYS.geminiKey);
      setGoogleLiveness(trimmed ? "unknown" : "no-key");
    } else if (provider === "openai") {
      setOpenaiKeyState(trimmed);
      if (trimmed) localStorage.setItem(LS_KEYS.openaiKey, trimmed);
      else localStorage.removeItem(LS_KEYS.openaiKey);
      setOpenaiLiveness(trimmed ? "unknown" : "no-key");
    }
  }, []);

  const getProviderKey = useCallback((provider: ProviderId) => {
    if (provider === "anthropic") return anthropicKey;
    if (provider === "google") return geminiKey;
    if (provider === "openai") return openaiKey;
    return "";
  }, [anthropicKey, geminiKey, openaiKey]);

  const hasProviderKey = useCallback((provider: ProviderId) => {
    if (provider === "anthropic") return !!anthropicKey;
    if (provider === "google") return !!geminiKey;
    if (provider === "openai") return !!openaiKey;
    return false;
  }, [anthropicKey, geminiKey, openaiKey]);

  // ── Per-agent ──

  const setAgentModel = useCallback((agentId: string, modelId: string) => {
    setAgentModelsState(prev => {
      const next = { ...prev, [agentId]: modelId };
      localStorage.setItem(LS_KEYS.agentModels, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearAgentModel = useCallback((agentId: string) => {
    setAgentModelsState(prev => {
      const next = { ...prev };
      delete next[agentId];
      localStorage.setItem(LS_KEYS.agentModels, JSON.stringify(next));
      return next;
    });
  }, []);

  const getAgentModel = useCallback((agentId: string, recommendedModel?: string) => {
    return agentModels[agentId] || recommendedModel || globalModel;
  }, [agentModels, globalModel]);

  // ── Per-command ──

  const setCommandModel = useCallback((commandId: string, modelId: string) => {
    setCommandModelsState(prev => {
      const next = { ...prev, [commandId]: modelId };
      localStorage.setItem(LS_KEYS.commandModels, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearCommandModel = useCallback((commandId: string) => {
    setCommandModelsState(prev => {
      const next = { ...prev };
      delete next[commandId];
      localStorage.setItem(LS_KEYS.commandModels, JSON.stringify(next));
      return next;
    });
  }, []);

  const getCommandModel = useCallback((commandId: string, recommendedModel?: string) => {
    return commandModels[commandId] || recommendedModel || globalModel;
  }, [commandModels, globalModel]);

  // ── Liveness probes ──

  const checkLiveness = useCallback(async (provider?: ProviderId) => {
    const now = new Date().toISOString();
    const doAnthropic = !provider || provider === "anthropic";
    const doGoogle = !provider || provider === "google";
    const doOpenai = !provider || provider === "openai";

    if (doAnthropic) {
      if (!anthropicKey) { setAnthropicLiveness("no-key"); return; }
      setAnthropicLiveness("checking");
      const ok = await probeAnthropic(anthropicKey);
      setAnthropicLiveness(ok ? "online" : "offline");
      setAnthropicLastChecked(now);
    }
    if (doGoogle) {
      if (!geminiKey) { setGoogleLiveness("no-key"); return; }
      setGoogleLiveness("checking");
      const ok = await probeGoogle(geminiKey);
      setGoogleLiveness(ok ? "online" : "offline");
      setGoogleLastChecked(now);
    }
    if (doOpenai) {
      if (!openaiKey) { setOpenaiLiveness("no-key"); return; }
      setOpenaiLiveness("checking");
      const ok = await probeOpenAI(openaiKey);
      setOpenaiLiveness(ok ? "online" : "offline");
      setOpenaiLastChecked(now);
    }
  }, [anthropicKey, geminiKey, openaiKey]);

  // ── Ollama instance management ──

  const persistOllamaInstances = useCallback((instances: OllamaInstance[]) => {
    const stored: OllamaInstanceStored[] = instances.map(i => ({ id: i.id, label: i.label, baseUrl: i.baseUrl }));
    localStorage.setItem(LS_KEYS.ollamaInstances, JSON.stringify(stored));
  }, []);

  const addOllamaInstance = useCallback((label: string, baseUrl: string) => {
    const id = `ollama-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newInstance: OllamaInstance = { id, label, baseUrl: baseUrl.replace(/\/+$/, ""), liveness: "unknown", lastChecked: null, models: [] };
    setOllamaInstancesState(prev => {
      const next = [...prev, newInstance];
      persistOllamaInstances(next);
      return next;
    });
  }, [persistOllamaInstances]);

  const removeOllamaInstance = useCallback((id: string) => {
    setOllamaInstancesState(prev => {
      const next = prev.filter(i => i.id !== id);
      persistOllamaInstances(next);
      return next;
    });
  }, [persistOllamaInstances]);

  const updateOllamaInstance = useCallback((id: string, label: string, baseUrl: string) => {
    setOllamaInstancesState(prev => {
      const next = prev.map(i => i.id === id ? { ...i, label, baseUrl: baseUrl.replace(/\/+$/, "") } : i);
      persistOllamaInstances(next);
      return next;
    });
  }, [persistOllamaInstances]);

  const refreshOllamaModels = useCallback(async (id: string) => {
    const inst = ollamaInstances.find(i => i.id === id);
    if (!inst) return;
    const models = await fetchOllamaModelTags(inst.baseUrl, inst.id, inst.label);
    setOllamaInstancesState(prev => prev.map(i => i.id === id ? { ...i, models } : i));
  }, [ollamaInstances]);

  const checkOllamaLiveness = useCallback(async (id: string) => {
    const inst = ollamaInstances.find(i => i.id === id);
    if (!inst) return;
    const now = new Date().toISOString();
    setOllamaInstancesState(prev => prev.map(i => i.id === id ? { ...i, liveness: "checking" } : i));
    const ok = await probeOllama(inst.baseUrl);
    setOllamaInstancesState(prev => prev.map(i => i.id === id ? { ...i, liveness: ok ? "online" : "offline", lastChecked: now } : i));
    // Also fetch models on successful probe
    if (ok) {
      const models = await fetchOllamaModelTags(inst.baseUrl, inst.id, inst.label);
      setOllamaInstancesState(prev => prev.map(i => i.id === id ? { ...i, models } : i));
    }
  }, [ollamaInstances]);

  // Auto-probe on mount (once)
  useEffect(() => {
    if (probeRan.current) return;
    probeRan.current = true;
    if (anthropicKey) checkLiveness("anthropic");
    if (geminiKey) checkLiveness("google");
    if (openaiKey) checkLiveness("openai");
    // Probe all saved Ollama instances
    ollamaInstances.forEach(inst => {
      checkOllamaLiveness(inst.id);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ──

  const ollamaModels = ollamaInstances.flatMap(i => i.models);
  const allModels: LLMModel[] = [...ANTHROPIC_MODELS, ...GOOGLE_MODELS, ...OPENAI_MODELS, ...ollamaModels];

  const getModelById = useCallback((id: string) => {
    return ANTHROPIC_MODELS.find(m => m.id === id)
      || GOOGLE_MODELS.find(m => m.id === id)
      || OPENAI_MODELS.find(m => m.id === id)
      || ollamaModels.find(m => m.id === id);
  }, [ollamaModels]);

  const providers: ProviderState[] = [
    {
      id: "anthropic",
      label: "Anthropic",
      keyPlaceholder: "sk-ant-...",
      keyPrefix: "sk-",
      keyHelpUrl: "https://console.anthropic.com/",
      apiKey: anthropicKey,
      liveness: anthropicLiveness,
      lastChecked: anthropicLastChecked,
      models: ANTHROPIC_MODELS,
    },
    {
      id: "google",
      label: "Google AI",
      keyPlaceholder: "AIza...",
      keyPrefix: "AIza",
      keyHelpUrl: "https://aistudio.google.com/apikey",
      apiKey: geminiKey,
      liveness: googleLiveness,
      lastChecked: googleLastChecked,
      models: GOOGLE_MODELS,
    },
    {
      id: "openai",
      label: "OpenAI",
      keyPlaceholder: "sk-...",
      keyPrefix: "sk-",
      keyHelpUrl: "https://platform.openai.com/api-keys",
      apiKey: openaiKey,
      liveness: openaiLiveness,
      lastChecked: openaiLastChecked,
      models: OPENAI_MODELS,
    },
  ];

  // Overall status = worst of all providers that have keys + Ollama instances
  const overallStatus: LivenessStatus = (() => {
    const keyed = providers.filter(p => p.apiKey);
    const allSources = [...keyed.map(p => p.liveness), ...ollamaInstances.map(i => i.liveness)];
    if (allSources.length === 0) return "no-key";
    if (allSources.some(s => s === "checking")) return "checking";
    if (allSources.every(s => s === "online")) return "online";
    if (allSources.some(s => s === "offline")) return "offline";
    return "unknown";
  })();

  const value: LLMContextType = {
    providers,
    globalModel,
    setGlobalModel,
    chatModel,
    setChatModel,
    imageModel,
    setImageModel,
    setProviderKey,
    getProviderKey,
    hasProviderKey,
    checkLiveness,
    overallStatus,
    agentModels,
    setAgentModel,
    clearAgentModel,
    getAgentModel,
    commandModels,
    setCommandModel,
    clearCommandModel,
    getCommandModel,
    ollamaInstances,
    addOllamaInstance,
    removeOllamaInstance,
    updateOllamaInstance,
    refreshOllamaModels,
    checkOllamaLiveness,
    allModels,
    getModelById,
    managerOpenRequest,
    openManager: () => setManagerOpenRequest(c => c + 1),
  };

  return <LLMContext.Provider value={value}>{children}</LLMContext.Provider>;
}
