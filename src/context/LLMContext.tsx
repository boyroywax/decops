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

// Re-export all types so existing consumers keep working
export type { ProviderId, LLMModel, LivenessStatus, ProviderState, OllamaInstance, AgentModelMap, CommandModelMap, GroupModelMap, LLMContextType } from "@/types/llm";

import type { ProviderId, LLMModel, LivenessStatus, ProviderState, OllamaInstance, OllamaInstanceStored, AgentModelMap, CommandModelMap, GroupModelMap, LLMContextType } from "@/types/llm";
import { ANTHROPIC_MODELS, GOOGLE_MODELS, OPENAI_MODELS, OPENROUTER_MODELS, LS_KEYS, DEFAULT_MODEL, DEFAULT_IMAGE_MODEL } from "./llmModels";
import { probeAnthropic, probeGoogle, probeOpenAI, probeOpenRouter, fetchOpenRouterModels, probeOllama, fetchOllamaModelTags } from "./llmProbes";

// ── Context ──────────────────────────────────────────────────

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
  const [openrouterKey, setOpenrouterKeyState] = useState(() => localStorage.getItem(LS_KEYS.openrouterKey) || "");
  const [anthropicLiveness, setAnthropicLiveness] = useState<LivenessStatus>(anthropicKey ? "unknown" : "no-key");
  const [googleLiveness, setGoogleLiveness] = useState<LivenessStatus>(geminiKey ? "unknown" : "no-key");
  const [openaiLiveness, setOpenaiLiveness] = useState<LivenessStatus>(openaiKey ? "unknown" : "no-key");
  const [openrouterLiveness, setOpenrouterLiveness] = useState<LivenessStatus>(openrouterKey ? "unknown" : "no-key");
  const [anthropicLastChecked, setAnthropicLastChecked] = useState<string | null>(null);
  const [googleLastChecked, setGoogleLastChecked] = useState<string | null>(null);
  const [openaiLastChecked, setOpenaiLastChecked] = useState<string | null>(null);
  const [openrouterLastChecked, setOpenrouterLastChecked] = useState<string | null>(null);

  // OpenRouter dynamic models
  const [openrouterDynamicModels, setOpenrouterDynamicModels] = useState<LLMModel[]>([]);

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
  const [imageModel, setImageModelState] = useState(() => localStorage.getItem(LS_KEYS.imageModel) || DEFAULT_IMAGE_MODEL);

  // Per-agent overrides
  const [agentModels, setAgentModelsState] = useState<AgentModelMap>(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEYS.agentModels) || "{}"); } catch { return {}; }
  });

  // Per-command overrides
  const [commandModels, setCommandModelsState] = useState<CommandModelMap>(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEYS.commandModels) || "{}"); } catch { return {}; }
  });

  // Per-group overrides
  const [groupModels, setGroupModelsState] = useState<GroupModelMap>(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEYS.groupModels) || "{}"); } catch { return {}; }
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
    } else if (provider === "openrouter") {
      setOpenrouterKeyState(trimmed);
      if (trimmed) localStorage.setItem(LS_KEYS.openrouterKey, trimmed);
      else localStorage.removeItem(LS_KEYS.openrouterKey);
      setOpenrouterLiveness(trimmed ? "unknown" : "no-key");
    }
  }, []);

  const getProviderKey = useCallback((provider: ProviderId) => {
    if (provider === "anthropic") return anthropicKey;
    if (provider === "google") return geminiKey;
    if (provider === "openai") return openaiKey;
    if (provider === "openrouter") return openrouterKey;
    return "";
  }, [anthropicKey, geminiKey, openaiKey, openrouterKey]);

  const hasProviderKey = useCallback((provider: ProviderId) => {
    if (provider === "anthropic") return !!anthropicKey;
    if (provider === "google") return !!geminiKey;
    if (provider === "openai") return !!openaiKey;
    if (provider === "openrouter") return !!openrouterKey;
    return false;
  }, [anthropicKey, geminiKey, openaiKey, openrouterKey]);

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

  // ── Per-group ──

  const setGroupModel = useCallback((groupId: string, modelId: string) => {
    setGroupModelsState(prev => {
      const next = { ...prev, [groupId]: modelId };
      localStorage.setItem(LS_KEYS.groupModels, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearGroupModel = useCallback((groupId: string) => {
    setGroupModelsState(prev => {
      const next = { ...prev };
      delete next[groupId];
      localStorage.setItem(LS_KEYS.groupModels, JSON.stringify(next));
      return next;
    });
  }, []);

  const getGroupModel = useCallback((groupId: string, recommendedModel?: string) => {
    return groupModels[groupId] || recommendedModel || globalModel;
  }, [groupModels, globalModel]);

  // ── Liveness probes ──

  const checkLiveness = useCallback(async (provider?: ProviderId) => {
    const now = new Date().toISOString();
    const doAnthropic = !provider || provider === "anthropic";
    const doGoogle = !provider || provider === "google";
    const doOpenai = !provider || provider === "openai";
    const doOpenrouter = !provider || provider === "openrouter";

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
    if (doOpenrouter) {
      if (!openrouterKey) { setOpenrouterLiveness("no-key"); return; }
      setOpenrouterLiveness("checking");
      const ok = await probeOpenRouter(openrouterKey);
      setOpenrouterLiveness(ok ? "online" : "offline");
      setOpenrouterLastChecked(now);
      // Fetch dynamic models on successful probe
      if (ok) {
        const models = await fetchOpenRouterModels(openrouterKey);
        if (models.length > 0) setOpenrouterDynamicModels(models);
      }
    }
  }, [anthropicKey, geminiKey, openaiKey, openrouterKey]);

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
    if (openrouterKey) checkLiveness("openrouter");
    // Probe all saved Ollama instances
    ollamaInstances.forEach(inst => {
      checkOllamaLiveness(inst.id);
    });
    // reason: mount-only one-shot probe; `checkLiveness` is stable and the
    // key/ollama arrays would cause repeated probes on every render. §5.4.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ──

  const ollamaModels = ollamaInstances.flatMap(i => i.models);
  const openrouterModels = openrouterDynamicModels.length > 0 ? openrouterDynamicModels : OPENROUTER_MODELS;
  const allModels: LLMModel[] = [...ANTHROPIC_MODELS, ...GOOGLE_MODELS, ...OPENAI_MODELS, ...openrouterModels, ...ollamaModels];

  const getModelById = useCallback((id: string) => {
    return ANTHROPIC_MODELS.find(m => m.id === id)
      || GOOGLE_MODELS.find(m => m.id === id)
      || OPENAI_MODELS.find(m => m.id === id)
      || openrouterModels.find(m => m.id === id)
      || ollamaModels.find(m => m.id === id);
  }, [ollamaModels, openrouterModels]);

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
    {
      id: "openrouter",
      label: "OpenRouter",
      keyPlaceholder: "sk-or-...",
      keyPrefix: "sk-or-",
      keyHelpUrl: "https://openrouter.ai/keys",
      apiKey: openrouterKey,
      liveness: openrouterLiveness,
      lastChecked: openrouterLastChecked,
      models: openrouterModels,
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
    groupModels,
    setGroupModel,
    clearGroupModel,
    getGroupModel,
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
