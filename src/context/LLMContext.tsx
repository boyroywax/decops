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

export type ProviderId = "anthropic" | "google";

export interface LLMModel {
  id: string;
  label: string;
  desc: string;
  tier: string;
  provider: ProviderId;
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

/** Per-agent model override (stored in localStorage as JSON map) */
export type AgentModelMap = Record<string, string>; // agentId → modelId

/** Per-command model override */
export type CommandModelMap = Record<string, string>; // commandId → modelId

export interface LLMContextType {
  providers: ProviderState[];
  // Global default
  globalModel: string;
  setGlobalModel: (modelId: string) => void;
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
  getAgentModel: (agentId: string) => string; // returns override or globalModel
  // Per-command
  commandModels: CommandModelMap;
  setCommandModel: (commandId: string, modelId: string) => void;
  clearCommandModel: (commandId: string) => void;
  getCommandModel: (commandId: string) => string;
  // All models flat
  allModels: LLMModel[];
  getModelById: (id: string) => LLMModel | undefined;
  // UI state
  isManagerOpen: boolean;
  openManager: () => void;
  closeManager: () => void;
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

const LS_KEYS = {
  anthropicKey: "anthropic_api_key",
  anthropicModel: "anthropic_model",
  geminiKey: "gemini_api_key",
  agentModels: "llm_agent_models",
  commandModels: "llm_command_models",
} as const;

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

// ── Liveness probes ────────────────────────────────

async function probeAnthropic(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-haiku-3-5-20241022",
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    // 200 = success, 401 = bad key (still "online"), 429 = rate limited (still reachable)
    return res.status === 200 || res.status === 429;
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
  const [anthropicLiveness, setAnthropicLiveness] = useState<LivenessStatus>(anthropicKey ? "unknown" : "no-key");
  const [googleLiveness, setGoogleLiveness] = useState<LivenessStatus>(geminiKey ? "unknown" : "no-key");
  const [anthropicLastChecked, setAnthropicLastChecked] = useState<string | null>(null);
  const [googleLastChecked, setGoogleLastChecked] = useState<string | null>(null);

  // Global model
  const [globalModel, setGlobalModelState] = useState(() => localStorage.getItem(LS_KEYS.anthropicModel) || DEFAULT_MODEL);

  // Per-agent overrides
  const [agentModels, setAgentModelsState] = useState<AgentModelMap>(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEYS.agentModels) || "{}"); } catch { return {}; }
  });

  // Per-command overrides
  const [commandModels, setCommandModelsState] = useState<CommandModelMap>(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEYS.commandModels) || "{}"); } catch { return {}; }
  });

  // Manager modal open state
  const [isManagerOpen, setIsManagerOpen] = useState(false);

  // Guards against double-probe on mount
  const probeRan = useRef(false);

  // ── Persistence helpers ──

  const setGlobalModel = useCallback((modelId: string) => {
    setGlobalModelState(modelId);
    localStorage.setItem(LS_KEYS.anthropicModel, modelId);
  }, []);

  const setProviderKey = useCallback((provider: ProviderId, key: string) => {
    const trimmed = key.trim();
    if (provider === "anthropic") {
      setAnthropicKey(trimmed);
      if (trimmed) localStorage.setItem(LS_KEYS.anthropicKey, trimmed);
      else localStorage.removeItem(LS_KEYS.anthropicKey);
      setAnthropicLiveness(trimmed ? "unknown" : "no-key");
    } else {
      setGeminiKeyState(trimmed);
      if (trimmed) localStorage.setItem(LS_KEYS.geminiKey, trimmed);
      else localStorage.removeItem(LS_KEYS.geminiKey);
      setGoogleLiveness(trimmed ? "unknown" : "no-key");
    }
  }, []);

  const getProviderKey = useCallback((provider: ProviderId) => {
    return provider === "anthropic" ? anthropicKey : geminiKey;
  }, [anthropicKey, geminiKey]);

  const hasProviderKey = useCallback((provider: ProviderId) => {
    return provider === "anthropic" ? !!anthropicKey : !!geminiKey;
  }, [anthropicKey, geminiKey]);

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

  const getAgentModel = useCallback((agentId: string) => {
    return agentModels[agentId] || globalModel;
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

  const getCommandModel = useCallback((commandId: string) => {
    return commandModels[commandId] || globalModel;
  }, [commandModels, globalModel]);

  // ── Liveness probes ──

  const checkLiveness = useCallback(async (provider?: ProviderId) => {
    const now = new Date().toISOString();
    const doAnthropic = !provider || provider === "anthropic";
    const doGoogle = !provider || provider === "google";

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
  }, [anthropicKey, geminiKey]);

  // Auto-probe on mount (once)
  useEffect(() => {
    if (probeRan.current) return;
    probeRan.current = true;
    if (anthropicKey) checkLiveness("anthropic");
    if (geminiKey) checkLiveness("google");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ──

  const allModels: LLMModel[] = [...ANTHROPIC_MODELS, ...GOOGLE_MODELS];

  const getModelById = useCallback((id: string) => allModels.find(m => m.id === id), []);

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
  ];

  // Overall status = worst of all providers that have keys
  const overallStatus: LivenessStatus = (() => {
    const keyed = providers.filter(p => p.apiKey);
    if (keyed.length === 0) return "no-key";
    if (keyed.some(p => p.liveness === "checking")) return "checking";
    if (keyed.every(p => p.liveness === "online")) return "online";
    if (keyed.some(p => p.liveness === "offline")) return "offline";
    return "unknown";
  })();

  const value: LLMContextType = {
    providers,
    globalModel,
    setGlobalModel,
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
    allModels,
    getModelById,
    isManagerOpen,
    openManager: () => setIsManagerOpen(true),
    closeManager: () => setIsManagerOpen(false),
  };

  return <LLMContext.Provider value={value}>{children}</LLMContext.Provider>;
}
