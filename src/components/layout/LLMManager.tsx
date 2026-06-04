/**
 * LLM Manager Drawer — footer panel for provider & model management
 *
 * Same UI/UX pattern as ChatPanel, ActionManager, and ArtifactsPanel:
 *   - Resize handle, header with close/expand, scrollable body
 *   - Receives height/setHeight/isExpanded/onToggleExpand/onClose props from Footer
 *
 * Tabs:
 *  1. Providers   — API keys + liveness per provider
 *  2. Models      — Agent Default, Chat, and Image Generation model pickers
 */

import { useState, useCallback, useEffect } from "react";
import {
  X, Key, Cpu, Zap, RefreshCw, Trash2,
  ChevronDown, ChevronUp, Eye, EyeOff,
  ChevronsUp, ChevronsDown, Plus, Server, Globe,
  Bot, MessageCircle, ImageIcon, Brain, Download, Upload, Save, Users,
} from "lucide-react";
import { useLLM, type ProviderId, type LivenessStatus, type LLMModel, type OllamaInstance } from "@/context/LLMContext";
import { useJobsContext } from "@/context/JobsContext";
import { agentCognitionService } from "@/toolkits/cognition/service";
import type {
  AgentCognitionProfileManifest,
  CognitionEdge,
  CognitionNode,
  CognitionStageId,
  CognitionSubAgentPlot,
  CognitionSubAgentTriggerStage,
} from "@/toolkits/cognition/types";
import "../../styles/components/llm-manager.css";

// ── Props (same shape as other footer drawers) ──

interface LLMManagerProps {
  onClose: () => void;
  height: number;
  setHeight: (h: number) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

type Tab = "providers" | "models" | "cognition" | "subagents";

const COGNITION_STAGES: CognitionStageId[] = [
  "intent-analysis",
  "planning",
  "tool-execution",
  "result-assessment",
  "adaptation",
  "completion",
];

const SUBAGENT_TRIGGER_STAGES: CognitionSubAgentTriggerStage[] = ["any", ...COGNITION_STAGES];

function cloneManifest(manifest: AgentCognitionProfileManifest): AgentCognitionProfileManifest {
  return JSON.parse(JSON.stringify(manifest)) as AgentCognitionProfileManifest;
}

// ── Liveness dot ──

function LiveDot({ status, size = 8 }: { status: LivenessStatus; size?: number }) {
  const colors: Record<LivenessStatus, string> = {
    online: "#00e5a0",
    offline: "#ef4444",
    checking: "#fbbf24",
    unknown: "#71717a",
    "no-key": "#71717a",
  };
  const isChecking = status === "checking";
  return (
    <span
      className={`llm-dot ${isChecking ? "llm-dot--pulse" : ""}`}
      style={{ width: size, height: size, background: colors[status] }}
      title={status}
    />
  );
}

// ── Tier badge colors ──

const tierColors: Record<string, string> = {
  recommended: "#00e5a0",
  premium: "#a78bfa",
  fast: "#fbbf24",
  standard: "#38bdf8",
  image: "#f472b6",
  local: "#fb923c",
};

// ── Provider Card ──

function ProviderCard({ providerId }: { providerId: ProviderId }) {
  const llm = useLLM();
  const provider = llm.providers.find(p => p.id === providerId)!;
  const [keyInput, setKeyInput] = useState(provider.apiKey);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    llm.setProviderKey(providerId, keyInput);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    // Auto-probe after save
    if (keyInput.trim()) {
      setTimeout(() => llm.checkLiveness(providerId), 300);
    }
  };

  const handleClear = () => {
    setKeyInput("");
    llm.setProviderKey(providerId, "");
  };

  return (
    <div className="llm-provider-card">
      <div className="llm-provider-header">
        <div className="llm-provider-name">
          <LiveDot status={provider.liveness} />
          {provider.label}
        </div>
        <div className="llm-provider-actions">
          <button
            className="btn btn-ghost btn-xs"
            onClick={() => llm.checkLiveness(providerId)}
            disabled={!provider.apiKey || provider.liveness === "checking"}
            title="Test connection"
          >
            <RefreshCw size={12} className={provider.liveness === "checking" ? "spin" : ""} />
          </button>
        </div>
      </div>
      <div className="llm-provider-key-row">
        <div className="llm-provider-input-wrap">
          <input
            type={showKey ? "text" : "password"}
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            placeholder={provider.keyPlaceholder}
            className={`input ${provider.apiKey ? "input-success" : ""}`}
          />
          <button onClick={() => setShowKey(!showKey)} className="llm-provider-eye">
            {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        </div>
        <button onClick={handleSave} className="btn btn-primary btn-xs">Save</button>
        {provider.apiKey && (
          <button onClick={handleClear} className="btn btn-ghost btn-xs" title="Remove key">
            <Trash2 size={12} />
          </button>
        )}
      </div>
      {saved && <div className="llm-provider-saved">Key saved</div>}
      {!provider.apiKey && (
        <div className="llm-provider-hint">
          <a href={provider.keyHelpUrl} target="_blank" rel="noopener noreferrer">
            Get your API key →
          </a>
        </div>
      )}
      {provider.lastChecked && (
        <div className="llm-provider-last-checked">
          Last checked {new Date(provider.lastChecked).toLocaleTimeString()}
        </div>
      )}
      <div className="llm-provider-models-list">
        {provider.models.map(m => (
          <span key={m.id} className="llm-provider-model-tag" style={{ borderColor: tierColors[m.tier] || "#71717a" }}>
            {m.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Ollama Instance Card ──

function OllamaInstanceCard({ instance }: { instance: OllamaInstance }) {
  const llm = useLLM();
  const [editing, setEditing] = useState(false);
  const [labelInput, setLabelInput] = useState(instance.label);
  const [urlInput, setUrlInput] = useState(instance.baseUrl);

  const handleSave = () => {
    llm.updateOllamaInstance(instance.id, labelInput, urlInput);
    setEditing(false);
    // Auto-probe after save
    setTimeout(() => llm.checkOllamaLiveness(instance.id), 300);
  };

  const handleRemove = () => {
    llm.removeOllamaInstance(instance.id);
  };

  return (
    <div className="llm-provider-card llm-ollama-card">
      <div className="llm-provider-header">
        <div className="llm-provider-name">
          <LiveDot status={instance.liveness} />
          <Server size={12} style={{ opacity: 0.6 }} />
          {editing ? (
            <input
              type="text"
              value={labelInput}
              onChange={e => setLabelInput(e.target.value)}
              className="input llm-ollama-name-input"
              placeholder="Instance name"
            />
          ) : (
            <span>{instance.label}</span>
          )}
        </div>
        <div className="llm-provider-actions">
          <button
            className="btn btn-ghost btn-xs"
            onClick={() => llm.checkOllamaLiveness(instance.id)}
            disabled={instance.liveness === "checking"}
            title="Test connection & fetch models"
          >
            <RefreshCw size={12} className={instance.liveness === "checking" ? "spin" : ""} />
          </button>
          <button
            className="btn btn-ghost btn-xs"
            onClick={() => setEditing(!editing)}
            title="Edit instance"
          >
            {editing ? "Cancel" : "Edit"}
          </button>
          <button
            className="btn btn-ghost btn-xs"
            onClick={handleRemove}
            title="Remove instance"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      {editing ? (
        <div className="llm-provider-key-row">
          <div className="llm-provider-input-wrap">
            <input
              type="text"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="http://localhost:11434"
              className="input"
            />
          </div>
          <button onClick={handleSave} className="btn btn-primary btn-xs">Save</button>
        </div>
      ) : (
        <div className="llm-ollama-url">
          <Globe size={10} style={{ opacity: 0.5 }} />
          <span>{instance.baseUrl}</span>
        </div>
      )}
      {instance.lastChecked && (
        <div className="llm-provider-last-checked">
          Last checked {new Date(instance.lastChecked).toLocaleTimeString()}
        </div>
      )}
      {instance.models.length > 0 ? (
        <div className="llm-provider-models-list">
          {instance.models.map(m => (
            <span key={m.id} className="llm-provider-model-tag" style={{ borderColor: "#a78bfa" }}>
              {m.label}
            </span>
          ))}
        </div>
      ) : instance.liveness === "online" ? (
        <div className="llm-provider-hint">No models found. Pull models with <code>ollama pull</code></div>
      ) : null}
    </div>
  );
}

// ── Ollama Section (add new instances) ──

function OllamaSection() {
  const llm = useLLM();
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("http://localhost:11434");

  const handleAdd = () => {
    if (!newLabel.trim() || !newUrl.trim()) return;
    llm.addOllamaInstance(newLabel.trim(), newUrl.trim());
    setNewLabel("");
    setNewUrl("http://localhost:11434");
    setShowAdd(false);
  };

  return (
    <div className="llm-ollama-section">
      <div className="llm-ollama-section-header">
        <div className="llm-ollama-section-title">
          <Server size={12} />
          <span>Ollama Instances</span>
          <span className="llm-ollama-count">{llm.ollamaInstances.length}</span>
        </div>
        <button className="btn btn-ghost btn-xs" onClick={() => setShowAdd(!showAdd)}>
          <Plus size={12} /> Add
        </button>
      </div>
      {showAdd && (
        <div className="llm-ollama-add-form">
          <input
            type="text"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            placeholder="Instance name (e.g. Home Server)"
            className="input"
          />
          <div className="llm-ollama-add-row">
            <input
              type="text"
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              placeholder="http://localhost:11434"
              className="input"
            />
            <button onClick={handleAdd} className="btn btn-primary btn-xs" disabled={!newLabel.trim() || !newUrl.trim()}>
              Add Instance
            </button>
          </div>
        </div>
      )}
      {llm.ollamaInstances.length === 0 && !showAdd && (
        <div className="llm-ollama-empty">
          No Ollama instances configured. Add one to use local models.
        </div>
      )}
      {llm.ollamaInstances.map(inst => (
        <OllamaInstanceCard key={inst.id} instance={inst} />
      ))}
    </div>
  );
}

// ── Model Picker (used in Models, Agents, Commands tabs) ──

function ModelPicker({
  selectedId,
  onSelect,
  filter,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
  filter?: (m: LLMModel) => boolean;
}) {
  const llm = useLLM();
  const models = filter ? llm.allModels.filter(filter) : llm.allModels;

  // Group by groupKey (defaults to provider)
  const grouped = models.reduce<Record<string, { label: string; models: LLMModel[] }>>((acc, m) => {
    const key = m.groupKey ?? m.provider;
    if (!acc[key]) {
      const providerLabels: Record<string, string> = { anthropic: "Anthropic", google: "Google AI", openai: "OpenAI", ollama: "Ollama" };
      acc[key] = { label: m.groupLabel ?? providerLabels[m.provider] ?? m.provider, models: [] };
    }
    acc[key].models.push(m);
    return acc;
  }, {});

  return (
    <div className="llm-model-picker">
      {Object.entries(grouped).map(([key, group]) => (
        <div key={key} className="llm-model-group">
          <div className="llm-model-group-label">{group.label}</div>
          {group.models.map(m => {
            const active = m.id === selectedId;
            const tc = tierColors[m.tier] || "#71717a";
            return (
              <button
                key={m.id}
                className={`llm-model-option ${active ? "llm-model-option--active" : ""}`}
                onClick={() => onSelect(m.id)}
                style={active ? { borderColor: tc, background: `${tc}0a` } : undefined}
              >
                <div className={`llm-model-radio ${active ? "active" : ""}`} style={active ? { borderColor: tc } : undefined}>
                  {active && <div className="llm-model-radio-dot" style={{ background: tc }} />}
                </div>
                <div className="llm-model-info">
                  <div className="llm-model-name">{m.label}</div>
                  <div className="llm-model-desc">{m.desc}</div>
                </div>
                <span className="llm-model-tier" style={{ color: tc, background: `${tc}14` }}>{m.tier.toUpperCase()}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Models Tab (Agent Default, Chat, Image) ──

function ModelsTab() {
  const llm = useLLM();
  const [expanded, setExpanded] = useState<string | null>("agent");

  const sections: { key: string; label: string; desc: string; icon: React.ReactNode; modelId: string; onSelect: (id: string) => void; filter?: (m: LLMModel) => boolean }[] = [
    {
      key: "agent",
      label: "Agent Default Model",
      desc: "Default model used by agents to generate responses. Individual agents can still override this.",
      icon: <Bot size={13} style={{ color: "#00e5a0" }} />,
      modelId: llm.globalModel,
      onSelect: id => llm.setGlobalModel(id),
      filter: m => m.tier !== "image",
    },
    {
      key: "chat",
      label: "Chat Model",
      desc: "Model used by the Workspace Chat panel for conversations and workspace queries.",
      icon: <MessageCircle size={13} style={{ color: "#38bdf8" }} />,
      modelId: llm.chatModel,
      onSelect: id => llm.setChatModel(id),
      filter: m => m.tier !== "image",
    },
    {
      key: "image",
      label: "Image Generation Model",
      desc: "Model used for generating agent portraits, group badges, and custom images.",
      icon: <ImageIcon size={13} style={{ color: "#f472b6" }} />,
      modelId: llm.imageModel,
      onSelect: id => llm.setImageModel(id),
      filter: m => m.tier === "image",
    },
  ];

  return (
    <div className="llm-models-sections">
      {sections.map(s => {
        const isOpen = expanded === s.key;
        const model = llm.getModelById(s.modelId);
        const tc = model ? (tierColors[model.tier] || "#71717a") : "#71717a";
        return (
          <div key={s.key} className="llm-model-section">
            <button
              className={`llm-model-section__header${isOpen ? " llm-model-section__header--active" : ""}`}
              onClick={() => setExpanded(isOpen ? null : s.key)}
            >
              <div className="llm-model-section__info">
                {s.icon}
                <span className="llm-model-section__label">{s.label}</span>
              </div>
              <div className="llm-model-section__current">
                <span className="llm-model-section__badge" style={{ color: tc, borderColor: `${tc}44` }}>
                  {model?.label || s.modelId}
                </span>
                {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </div>
            </button>
            {isOpen && (
              <div className="llm-model-section__body">
                <p className="llm-section-desc">{s.desc}</p>
                <ModelPicker selectedId={s.modelId} onSelect={s.onSelect} filter={s.filter} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CognitionTab() {
  const { allArtifacts, importArtifact } = useJobsContext();
  const [profiles, setProfiles] = useState<AgentCognitionProfileManifest[]>(() => agentCognitionService.listProfiles());
  const [selectedProfileId, setSelectedProfileId] = useState<string>(() => profiles[0]?.spec.profileId || "");
  const [draft, setDraft] = useState<AgentCognitionProfileManifest | null>(() => {
    const initial = profiles[0];
    return initial ? cloneManifest(initial) : null;
  });
  const [newProfileId, setNewProfileId] = useState("");
  const [newProfileName, setNewProfileName] = useState("");
  const [importArtifactId, setImportArtifactId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cognitionArtifacts = allArtifacts.filter((artifact) => agentCognitionService.isCognitionProfileArtifact(artifact));

  const refreshProfiles = useCallback((nextSelectedId?: string) => {
    const next = agentCognitionService.listProfiles();
    setProfiles(next);
    const fallbackId = next[0]?.spec.profileId || "";
    const targetId = nextSelectedId && next.some((p) => p.spec.profileId === nextSelectedId)
      ? nextSelectedId
      : fallbackId;
    setSelectedProfileId(targetId);
    const selected = next.find((p) => p.spec.profileId === targetId);
    setDraft(selected ? cloneManifest(selected) : null);
  }, []);

  const setDraftField = <K extends keyof AgentCognitionProfileManifest["metadata"]>(key: K, value: AgentCognitionProfileManifest["metadata"][K]) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        metadata: {
          ...prev.metadata,
          [key]: value,
          timestamps: {
            ...prev.metadata.timestamps,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  };

  const setNode = (nodeId: string, patch: Partial<CognitionNode>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const nextNodeId = patch.id?.trim();
      return {
        ...prev,
        spec: {
          ...prev.spec,
          nodes: prev.spec.nodes.map((node) => (node.id === nodeId ? { ...node, ...patch } : node)),
          edges: nextNodeId && nextNodeId !== nodeId
            ? prev.spec.edges.map((edge) => ({
              ...edge,
              from: edge.from === nodeId ? nextNodeId : edge.from,
              to: edge.to === nodeId ? nextNodeId : edge.to,
            }))
            : prev.spec.edges,
        },
      };
    });
  };

  const removeNode = (nodeId: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const nextNodes = prev.spec.nodes.filter((node) => node.id !== nodeId);
      return {
        ...prev,
        spec: {
          ...prev.spec,
          nodes: nextNodes,
          edges: prev.spec.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId),
        },
      };
    });
  };

  const addNode = () => {
    setDraft((prev) => {
      if (!prev) return prev;
      const nodeNum = prev.spec.nodes.length + 1;
      const nodeId = `node-${nodeNum}-${Math.random().toString(36).slice(2, 5)}`;
      const nextNode: CognitionNode = {
        id: nodeId,
        title: `Node ${nodeNum}`,
        stage: "planning",
        objective: "Define objective",
        prompts: ["What must happen in this stage?"],
        outputFields: ["summary"],
      };
      return {
        ...prev,
        spec: {
          ...prev.spec,
          nodes: [...prev.spec.nodes, nextNode],
        },
      };
    });
  };

  const setEdge = (edgeIndex: number, patch: Partial<CognitionEdge>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const nextEdges = [...prev.spec.edges];
      nextEdges[edgeIndex] = { ...nextEdges[edgeIndex], ...patch };
      return {
        ...prev,
        spec: {
          ...prev.spec,
          edges: nextEdges,
        },
      };
    });
  };

  const addEdge = () => {
    setDraft((prev) => {
      if (!prev || prev.spec.nodes.length < 2) return prev;
      const from = prev.spec.nodes[0].id;
      const to = prev.spec.nodes[1].id;
      return {
        ...prev,
        spec: {
          ...prev.spec,
          edges: [...prev.spec.edges, { from, to, condition: "always" }],
        },
      };
    });
  };

  const removeEdge = (edgeIndex: number) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        spec: {
          ...prev.spec,
          edges: prev.spec.edges.filter((_, index) => index !== edgeIndex),
        },
      };
    });
  };

  const handleSelectProfile = (profileId: string) => {
    setSelectedProfileId(profileId);
    const profile = profiles.find((p) => p.spec.profileId === profileId);
    setDraft(profile ? cloneManifest(profile) : null);
    setError(null);
    setNotice(null);
  };

  const handleCreateProfile = () => {
    setError(null);
    setNotice(null);
    const profileId = (newProfileId.trim() || `profile-${Math.random().toString(36).slice(2, 8)}`).toLowerCase();
    if (profiles.some((p) => p.spec.profileId === profileId)) {
      setError(`Profile id ${profileId} already exists.`);
      return;
    }

    const now = new Date().toISOString();
    const nextProfile: AgentCognitionProfileManifest = {
      kind: "v0",
      schema: "agent-cognition-profile",
      metadata: {
        name: newProfileName.trim() || "Custom Cognition Profile",
        labels: { mode: "adaptive" },
        annotations: { description: "Custom cognition profile" },
        timestamps: { createdAt: now, updatedAt: now },
      },
      spec: {
        profileId,
        version: "1.0.0",
        strictLoop: true,
        subAgentPlots: [],
        nodes: [
          {
            id: "intent",
            title: "Intent Analysis",
            stage: "intent-analysis",
            objective: "Understand user intent and constraints.",
            prompts: ["What is the user requesting?", "What constraints apply?"],
            outputFields: ["intent", "constraints"],
          },
          {
            id: "plan",
            title: "Planning",
            stage: "planning",
            objective: "Choose a practical execution strategy.",
            prompts: ["What is the next best action sequence?"],
            outputFields: ["plan"],
          },
        ],
        edges: [{ from: "intent", to: "plan", condition: "intent clear" }],
      },
    };

    try {
      agentCognitionService.upsertProfile(nextProfile);
      setNewProfileId("");
      setNewProfileName("");
      refreshProfiles(profileId);
      setNotice(`Created profile ${profileId}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleSaveProfile = () => {
    if (!draft) return;
    setError(null);
    setNotice(null);
    try {
      const stamped: AgentCognitionProfileManifest = {
        ...draft,
        metadata: {
          ...draft.metadata,
          timestamps: {
            ...draft.metadata.timestamps,
            updatedAt: new Date().toISOString(),
          },
        },
      };
      agentCognitionService.upsertProfile(stamped);
      refreshProfiles(stamped.spec.profileId);
      setNotice(`Saved profile ${stamped.spec.profileId}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDeleteProfile = () => {
    if (!draft) return;
    setError(null);
    setNotice(null);
    try {
      agentCognitionService.deleteProfile(draft.spec.profileId);
      refreshProfiles();
      setNotice(`Deleted profile ${draft.spec.profileId}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleExportArtifact = () => {
    if (!draft) return;
    setError(null);
    setNotice(null);
    const artifact = agentCognitionService.buildProfileArtifact({
      profile: draft,
      tags: ["mindmap", "toolkit:agent-cognition"],
      source: "command",
      description: `Cognition profile mind-map: ${draft.metadata.name}`,
    });
    importArtifact(artifact);
    setNotice(`Exported ${draft.spec.profileId} to artifacts.`);
  };

  const handleImportArtifact = () => {
    if (!importArtifactId) return;
    setError(null);
    setNotice(null);
    const selected = cognitionArtifacts.find((artifact) => artifact.id === importArtifactId);
    if (!selected) {
      setError("Select a cognition artifact first.");
      return;
    }
    try {
      const manifest = agentCognitionService.upsertProfileFromArtifact(selected);
      refreshProfiles(manifest.spec.profileId);
      setNotice(`Imported profile ${manifest.spec.profileId} from ${selected.name}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="llm-cognition">
      <p className="llm-section-desc">
        Build composable cognition profiles as node-and-edge mind maps, then bind them to agents.
      </p>

      <div className="llm-cognition__grid">
        <aside className="llm-cognition__sidebar">
          <div className="llm-cognition__sidebar-head">
            <span>Profiles</span>
            <span className="llm-cognition__count">{profiles.length}</span>
          </div>
          <div className="llm-cognition__profile-list">
            {profiles.map((profile) => (
              <button
                key={profile.spec.profileId}
                className={`llm-cognition__profile-item${selectedProfileId === profile.spec.profileId ? " llm-cognition__profile-item--active" : ""}`}
                onClick={() => handleSelectProfile(profile.spec.profileId)}
              >
                <div className="llm-cognition__profile-name">{profile.metadata.name}</div>
                <div className="llm-cognition__profile-id">{profile.spec.profileId}</div>
              </button>
            ))}
          </div>

          <div className="llm-cognition__create">
            <input
              className="input"
              placeholder="new profile id"
              value={newProfileId}
              onChange={(e) => setNewProfileId(e.target.value)}
            />
            <input
              className="input"
              placeholder="profile name"
              value={newProfileName}
              onChange={(e) => setNewProfileName(e.target.value)}
            />
            <button className="btn btn-primary btn-xs" onClick={handleCreateProfile}>
              <Plus size={11} /> Create profile
            </button>
          </div>

          <div className="llm-cognition__artifact-box">
            <div className="llm-cognition__artifact-label">Artifact import</div>
            <select className="input" value={importArtifactId} onChange={(e) => setImportArtifactId(e.target.value)}>
              <option value="">Select artifact</option>
              {cognitionArtifacts.map((artifact) => (
                <option key={artifact.id} value={artifact.id}>
                  {artifact.name}
                </option>
              ))}
            </select>
            <button className="btn btn-ghost btn-xs" onClick={handleImportArtifact}>
              <Upload size={11} /> Import artifact
            </button>
          </div>
        </aside>

        <section className="llm-cognition__editor">
          {!draft ? (
            <div className="llm-cognition__empty">No cognition profile selected.</div>
          ) : (
            <>
              <div className="llm-cognition__meta-row">
                <input
                  className="input"
                  value={draft.metadata.name}
                  onChange={(e) => setDraftField("name", e.target.value)}
                />
                <input
                  className="input"
                  value={draft.spec.profileId}
                  onChange={(e) => {
                    const nextId = e.target.value.toLowerCase();
                    setDraft((prev) => prev ? { ...prev, spec: { ...prev.spec, profileId: nextId } } : prev);
                  }}
                />
                <select
                  className="input"
                  value={draft.metadata.labels.mode}
                  onChange={(e) => setDraft((prev) => prev ? {
                    ...prev,
                    metadata: {
                      ...prev.metadata,
                      labels: { ...prev.metadata.labels, mode: e.target.value as "linear" | "adaptive" },
                    },
                  } : prev)}
                >
                  <option value="linear">linear</option>
                  <option value="adaptive">adaptive</option>
                </select>
                <label className="llm-cognition__strict">
                  <input
                    type="checkbox"
                    checked={draft.spec.strictLoop}
                    onChange={(e) => setDraft((prev) => prev ? { ...prev, spec: { ...prev.spec, strictLoop: e.target.checked } } : prev)}
                  />
                  strict loop
                </label>
              </div>

              <textarea
                className="llm-cognition__description"
                value={draft.metadata.annotations.description || ""}
                onChange={(e) => setDraft((prev) => prev ? {
                  ...prev,
                  metadata: {
                    ...prev.metadata,
                    annotations: {
                      ...prev.metadata.annotations,
                      description: e.target.value,
                    },
                  },
                } : prev)}
                placeholder="Profile description"
              />

              <div className="llm-cognition__actions">
                <button className="btn btn-primary btn-xs" onClick={handleSaveProfile}><Save size={11} /> Save profile</button>
                <button className="btn btn-ghost btn-xs" onClick={handleExportArtifact}><Download size={11} /> Export to artifacts</button>
                <button className="btn btn-ghost btn-xs" onClick={handleDeleteProfile}><Trash2 size={11} /> Delete profile</button>
              </div>

              <div className="llm-cognition__mindmap">
                <div className="llm-cognition__mindmap-head">
                  <h4>Mind-map nodes</h4>
                  <button className="btn btn-ghost btn-xs" onClick={addNode}><Plus size={11} /> Add node</button>
                </div>
                <div className="llm-cognition__node-list">
                  {draft.spec.nodes.map((node) => (
                    <div key={node.id} className="llm-cognition__node-card">
                      <div className="llm-cognition__node-row">
                        <input className="input" value={node.id} onChange={(e) => setNode(node.id, { id: e.target.value })} />
                        <input className="input" value={node.title} onChange={(e) => setNode(node.id, { title: e.target.value })} />
                        <select className="input" value={node.stage} onChange={(e) => setNode(node.id, { stage: e.target.value as CognitionStageId })}>
                          {COGNITION_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                        </select>
                        <button className="btn btn-ghost btn-xs" onClick={() => removeNode(node.id)}><Trash2 size={11} /></button>
                      </div>
                      <textarea
                        className="llm-cognition__node-objective"
                        value={node.objective}
                        onChange={(e) => setNode(node.id, { objective: e.target.value })}
                        placeholder="Node objective"
                      />
                      <input
                        className="input"
                        value={node.prompts.join(" | ")}
                        onChange={(e) => setNode(node.id, { prompts: e.target.value.split("|").map((v) => v.trim()).filter(Boolean) })}
                        placeholder="Prompts separated by |"
                      />
                      <input
                        className="input"
                        value={node.outputFields.join(",")}
                        onChange={(e) => setNode(node.id, { outputFields: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })}
                        placeholder="Output fields separated by commas"
                      />
                    </div>
                  ))}
                </div>

                <div className="llm-cognition__mindmap-head">
                  <h4>Edges</h4>
                  <button className="btn btn-ghost btn-xs" onClick={addEdge}><Plus size={11} /> Add edge</button>
                </div>
                <div className="llm-cognition__edge-list">
                  {draft.spec.edges.map((edge, index) => (
                    <div className="llm-cognition__edge-row" key={`${edge.from}-${edge.to}-${index}`}>
                      <select className="input" value={edge.from} onChange={(e) => setEdge(index, { from: e.target.value })}>
                        {draft.spec.nodes.map((node) => <option key={`from-${node.id}`} value={node.id}>{node.id}</option>)}
                      </select>
                      <span className="llm-cognition__arrow">→</span>
                      <select className="input" value={edge.to} onChange={(e) => setEdge(index, { to: e.target.value })}>
                        {draft.spec.nodes.map((node) => <option key={`to-${node.id}`} value={node.id}>{node.id}</option>)}
                      </select>
                      <input
                        className="input"
                        value={edge.condition}
                        onChange={(e) => setEdge(index, { condition: e.target.value })}
                        placeholder="condition"
                      />
                      <button className="btn btn-ghost btn-xs" onClick={() => removeEdge(index)}><Trash2 size={11} /></button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {notice && <div className="llm-cognition__msg llm-cognition__msg--ok">{notice}</div>}
          {error && <div className="llm-cognition__msg llm-cognition__msg--err">{error}</div>}
        </section>
      </div>
    </div>
  );
}

function createEmptySubAgentPlot(index: number): CognitionSubAgentPlot {
  const uid = Math.random().toString(36).slice(2, 7);
  return {
    id: `plot-${index}-${uid}`,
    name: `Sub-agent Plot ${index}`,
    enabled: true,
    triggerStage: "result-assessment",
    triggerCondition: "confidence < 0.6 OR unresolved_unknowns > 0",
    target: "specialist-agent",
    directiveTemplate: "Investigate unresolved unknowns and return a concise remediation plan.",
    contextFields: ["intent", "constraints", "assessment"],
    resultPattern: {
      expectedFormat: "json",
      requiredOutputs: ["summary", "findings", "recommendations"],
      successCriteria: "Includes actionable findings with clear next-step recommendation.",
      failureSignal: "No evidence or no recommendation returned.",
    },
  };
}

function SubAgentsTab() {
  const [profiles, setProfiles] = useState<AgentCognitionProfileManifest[]>(() => agentCognitionService.listProfiles());
  const [selectedProfileId, setSelectedProfileId] = useState<string>(() => profiles[0]?.spec.profileId || "");
  const [draft, setDraft] = useState<AgentCognitionProfileManifest | null>(() => {
    const initial = profiles[0];
    return initial ? cloneManifest(initial) : null;
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshProfiles = useCallback((nextSelectedId?: string) => {
    const next = agentCognitionService.listProfiles();
    setProfiles(next);
    const fallbackId = next[0]?.spec.profileId || "";
    const targetId = nextSelectedId && next.some((p) => p.spec.profileId === nextSelectedId)
      ? nextSelectedId
      : fallbackId;
    setSelectedProfileId(targetId);
    const selected = next.find((p) => p.spec.profileId === targetId);
    setDraft(selected ? cloneManifest(selected) : null);
  }, []);

  const handleSelectProfile = (profileId: string) => {
    setSelectedProfileId(profileId);
    const profile = profiles.find((p) => p.spec.profileId === profileId);
    setDraft(profile ? cloneManifest(profile) : null);
    setNotice(null);
    setError(null);
  };

  const setPlot = (plotId: string, patch: Partial<CognitionSubAgentPlot>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        spec: {
          ...prev.spec,
          subAgentPlots: prev.spec.subAgentPlots.map((plot) =>
            plot.id === plotId ? { ...plot, ...patch } : plot,
          ),
        },
      };
    });
  };

  const setPlotResultPattern = (plotId: string, patch: Partial<CognitionSubAgentPlot["resultPattern"]>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        spec: {
          ...prev.spec,
          subAgentPlots: prev.spec.subAgentPlots.map((plot) =>
            plot.id === plotId
              ? { ...plot, resultPattern: { ...plot.resultPattern, ...patch } }
              : plot,
          ),
        },
      };
    });
  };

  const addPlot = () => {
    setDraft((prev) => {
      if (!prev) return prev;
      const index = prev.spec.subAgentPlots.length + 1;
      return {
        ...prev,
        spec: {
          ...prev.spec,
          subAgentPlots: [...prev.spec.subAgentPlots, createEmptySubAgentPlot(index)],
        },
      };
    });
  };

  const removePlot = (plotId: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        spec: {
          ...prev.spec,
          subAgentPlots: prev.spec.subAgentPlots.filter((plot) => plot.id !== plotId),
        },
      };
    });
  };

  const saveProfilePlots = () => {
    if (!draft) return;
    setNotice(null);
    setError(null);
    try {
      const stamped: AgentCognitionProfileManifest = {
        ...draft,
        metadata: {
          ...draft.metadata,
          timestamps: {
            ...draft.metadata.timestamps,
            updatedAt: new Date().toISOString(),
          },
        },
      };
      agentCognitionService.upsertProfile(stamped);
      refreshProfiles(stamped.spec.profileId);
      setNotice(`Saved ${stamped.spec.subAgentPlots.length} sub-agent plot(s) on ${stamped.spec.profileId}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="llm-subagents">
      <p className="llm-section-desc">
        Configure sub-agent usage plots per cognition profile. Each plot defines trigger parameters, dispatch directives, and expected result patterns.
      </p>

      <div className="llm-subagents__grid">
        <aside className="llm-subagents__sidebar">
          <div className="llm-subagents__sidebar-head">
            <span>Cognition profiles</span>
            <span className="llm-subagents__count">{profiles.length}</span>
          </div>
          <div className="llm-subagents__profile-list">
            {profiles.map((profile) => (
              <button
                key={profile.spec.profileId}
                className={`llm-subagents__profile-item${selectedProfileId === profile.spec.profileId ? " llm-subagents__profile-item--active" : ""}`}
                onClick={() => handleSelectProfile(profile.spec.profileId)}
              >
                <div className="llm-subagents__profile-name">{profile.metadata.name}</div>
                <div className="llm-subagents__profile-id">{profile.spec.profileId}</div>
                <div className="llm-subagents__profile-meta">plots: {profile.spec.subAgentPlots.length}</div>
              </button>
            ))}
          </div>
        </aside>

        <section className="llm-subagents__editor">
          {!draft ? (
            <div className="llm-subagents__empty">No cognition profile selected.</div>
          ) : (
            <>
              <div className="llm-subagents__editor-head">
                <div>
                  <div className="llm-subagents__editor-title">{draft.metadata.name}</div>
                  <div className="llm-subagents__editor-subtitle">{draft.spec.profileId}</div>
                </div>
                <div className="llm-subagents__actions">
                  <button className="btn btn-ghost btn-xs" onClick={addPlot}><Plus size={11} /> Add plot</button>
                  <button className="btn btn-primary btn-xs" onClick={saveProfilePlots}><Save size={11} /> Save plots</button>
                </div>
              </div>

              <div className="llm-subagents__plot-list">
                {draft.spec.subAgentPlots.length === 0 ? (
                  <div className="llm-subagents__empty">No sub-agent plots yet. Add one to define dispatch behavior.</div>
                ) : draft.spec.subAgentPlots.map((plot) => (
                  <div className="llm-subagents__plot" key={plot.id}>
                    <div className="llm-subagents__plot-top">
                      <input className="input" value={plot.id} onChange={(e) => setPlot(plot.id, { id: e.target.value })} />
                      <input className="input" value={plot.name} onChange={(e) => setPlot(plot.id, { name: e.target.value })} />
                      <label className="llm-subagents__toggle">
                        <input type="checkbox" checked={plot.enabled} onChange={(e) => setPlot(plot.id, { enabled: e.target.checked })} />
                        enabled
                      </label>
                      <button className="btn btn-ghost btn-xs" onClick={() => removePlot(plot.id)}><Trash2 size={11} /></button>
                    </div>

                    <div className="llm-subagents__plot-row">
                      <select className="input" value={plot.triggerStage} onChange={(e) => setPlot(plot.id, { triggerStage: e.target.value as CognitionSubAgentTriggerStage })}>
                        {SUBAGENT_TRIGGER_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                      </select>
                      <input className="input" value={plot.target} onChange={(e) => setPlot(plot.id, { target: e.target.value })} placeholder="target agent or role" />
                    </div>

                    <input
                      className="input"
                      value={plot.triggerCondition}
                      onChange={(e) => setPlot(plot.id, { triggerCondition: e.target.value })}
                      placeholder="trigger condition (example: confidence < 0.6)"
                    />

                    <textarea
                      className="llm-subagents__textarea"
                      value={plot.directiveTemplate}
                      onChange={(e) => setPlot(plot.id, { directiveTemplate: e.target.value })}
                      placeholder="directive template for dispatched sub-agent"
                    />

                    <input
                      className="input"
                      value={plot.contextFields.join(",")}
                      onChange={(e) => setPlot(plot.id, { contextFields: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })}
                      placeholder="context fields (comma separated)"
                    />

                    <div className="llm-subagents__plot-row">
                      <input
                        className="input"
                        value={plot.resultPattern.expectedFormat}
                        onChange={(e) => setPlotResultPattern(plot.id, { expectedFormat: e.target.value })}
                        placeholder="expected format"
                      />
                      <input
                        className="input"
                        value={plot.resultPattern.requiredOutputs.join(",")}
                        onChange={(e) => setPlotResultPattern(plot.id, {
                          requiredOutputs: e.target.value.split(",").map((v) => v.trim()).filter(Boolean),
                        })}
                        placeholder="required outputs (comma separated)"
                      />
                    </div>

                    <input
                      className="input"
                      value={plot.resultPattern.successCriteria}
                      onChange={(e) => setPlotResultPattern(plot.id, { successCriteria: e.target.value })}
                      placeholder="success criteria"
                    />

                    <input
                      className="input"
                      value={plot.resultPattern.failureSignal}
                      onChange={(e) => setPlotResultPattern(plot.id, { failureSignal: e.target.value })}
                      placeholder="failure signal"
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          {notice && <div className="llm-subagents__msg llm-subagents__msg--ok">{notice}</div>}
          {error && <div className="llm-subagents__msg llm-subagents__msg--err">{error}</div>}
        </section>
      </div>
    </div>
  );
}

// ── Main Drawer Panel ──

export function LLMManager({ onClose, height, setHeight, isExpanded, onToggleExpand }: LLMManagerProps) {
  const llm = useLLM();
  const [tab, setTab] = useState<Tab>("providers");

  // ── Resize (same pattern as ChatPanel / ArtifactsPanel) ──
  const [isResizing, setIsResizing] = useState(false);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => setIsResizing(false), []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing) {
      const newHeight = window.innerHeight - e.clientY;
      if (newHeight > 200 && newHeight < window.innerHeight - 100) {
        setHeight(newHeight);
      }
    }
  }, [isResizing, setHeight]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", resize);
      window.addEventListener("mouseup", stopResizing);
    }
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  // Count overrides for tab badges

  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "providers", label: "Providers", icon: <Key size={11} /> },
    { id: "models", label: "Models", icon: <Cpu size={11} /> },
    { id: "cognition", label: "Cognition", icon: <Brain size={11} /> },
    { id: "subagents", label: "Sub-agents", icon: <Users size={11} /> },
  ];

  return (
    <div className={`llm-panel${isResizing ? " llm-panel--resizing" : ""}`} style={{ height }}>
      {/* Resize Handle */}
      <div onMouseDown={startResizing} className="llm-panel__resize-handle">
        <div className="llm-panel__resize-grip" />
      </div>

      {/* Header */}
      <div className="llm-panel__header">
        <div className="llm-panel__header-left">
          <Zap size={10} color="#00e5a0" />
          <span className="llm-panel__title">LLM MANAGER</span>
          <LiveDot status={llm.overallStatus} size={6} />
          <span className="llm-panel__separator">│</span>
          {/* Inline tabs */}
          {tabs.map(t => (
            <button
              key={t.id}
              className={`llm-panel__tab ${tab === t.id ? "llm-panel__tab--active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.icon}
              {t.label}
              {t.badge ? <span className="llm-panel__tab-badge">{t.badge}</span> : null}
            </button>
          ))}
        </div>
        <div className="llm-panel__header-actions">
          <button
            className="llm-panel__icon-btn"
            onClick={() => llm.checkLiveness()}
            title="Test all connections"
          >
            <RefreshCw size={12} />
          </button>
          <button
            onClick={onToggleExpand}
            className="llm-panel__icon-btn"
            title={isExpanded ? "Collapse panel" : "Expand panel"}
          >
            {isExpanded ? <ChevronsDown size={14} /> : <ChevronsUp size={14} />}
          </button>
          <button onClick={onClose} className="llm-panel__icon-btn" title="Close LLM Manager">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="llm-panel__body">
        {tab === "providers" && (
          <div className="llm-providers">
            <p className="llm-section-desc">
              API keys stored in localStorage. Only sent to the provider's API.
            </p>
            {llm.providers.map(p => <ProviderCard key={p.id} providerId={p.id} />)}
            <OllamaSection />
          </div>
        )}

        {tab === "models" && <ModelsTab />}
        {tab === "cognition" && <CognitionTab />}
        {tab === "subagents" && <SubAgentsTab />}
      </div>
    </div>
  );
}
