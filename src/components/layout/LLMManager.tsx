/**
 * LLM Manager Drawer — footer panel for provider, model & override management
 *
 * Same UI/UX pattern as ChatPanel, ActionManager, and ArtifactsPanel:
 *   - Resize handle, header with close/expand, scrollable body
 *   - Receives height/setHeight/isExpanded/onToggleExpand/onClose props from Footer
 *
 * Tabs:
 *  1. Providers   — API keys + liveness per provider
 *  2. Models      — Global default model picker
 *  3. Agents      — Per-agent model overrides
 *  4. Commands    — Per-command model overrides
 */

import { useState, useCallback, useEffect } from "react";
import {
  X, Key, Bot, Cpu, Zap, RefreshCw, Trash2,
  ChevronDown, ChevronUp, Terminal, Eye, EyeOff,
  ChevronsUp, ChevronsDown, Plus, Server, Globe,
} from "lucide-react";
import { useLLM, type ProviderId, type LivenessStatus, type LLMModel, type OllamaInstance } from "../../context/LLMContext";
import { useWorkspaceContext } from "../../context/WorkspaceContext";
import { registry } from "../../services/commands/registry";
import "../../styles/components/llm-manager.css";

// ── Props (same shape as other footer drawers) ──

interface LLMManagerProps {
  onClose: () => void;
  height: number;
  setHeight: (h: number) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

type Tab = "providers" | "models" | "agents" | "commands";

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

// ── Agents Tab ──

function AgentsTab() {
  const llm = useLLM();
  const { agents } = useWorkspaceContext();
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  if (agents.length === 0) {
    return <div className="llm-empty">No agents in workspace. Create agents first.</div>;
  }

  return (
    <div className="llm-agents-list">
      {agents.map(agent => {
        const override = llm.agentModels[agent.id];
        const effectiveModel = llm.getAgentModel(agent.id, agent.recommendedModel);
        const model = llm.getModelById(effectiveModel);
        const recModel = agent.recommendedModel ? llm.getModelById(agent.recommendedModel) : undefined;
        const isExpanded = expandedAgent === agent.id;

        return (
          <div key={agent.id} className="llm-agent-row">
            <button
              className="llm-agent-header"
              onClick={() => setExpandedAgent(isExpanded ? null : agent.id)}
            >
              <div className="llm-agent-info">
                <Bot size={14} style={{ color: "#00e5a0" }} />
                <span className="llm-agent-name">{agent.name}</span>
                <span className="llm-agent-role">{agent.role}</span>
              </div>
              <div className="llm-agent-model-badge">
                {override ? (
                  <span className="llm-override-badge">{model?.label || effectiveModel}</span>
                ) : agent.recommendedModel ? (
                  <span className="llm-recommended-badge">{recModel?.label || agent.recommendedModel}</span>
                ) : (
                  <span className="llm-default-badge">Global default</span>
                )}
                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </div>
            </button>
            {isExpanded && (
              <div className="llm-agent-picker">
                <div className="llm-agent-picker-header">
                  <span>Model for <strong>{agent.name}</strong></span>
                  <div style={{ display: "flex", gap: "var(--space-sm)", alignItems: "center" }}>
                    {agent.recommendedModel && (
                      <span className="llm-recommended-hint">Rec: {recModel?.label || agent.recommendedModel}</span>
                    )}
                    {override && (
                      <button className="btn btn-ghost btn-xs" onClick={() => llm.clearAgentModel(agent.id)}>
                        <Trash2 size={10} /> Reset{agent.recommendedModel ? " to recommended" : " to global"}
                      </button>
                    )}
                  </div>
                </div>
                <ModelPicker
                  selectedId={effectiveModel}
                  onSelect={id => llm.setAgentModel(agent.id, id)}
                  filter={m => m.provider === "anthropic"} // Only text models for agents
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Commands Tab ──

function CommandsTab() {
  const llm = useLLM();
  const [expandedCmd, setExpandedCmd] = useState<string | null>(null);

  const commands = registry.getAll();

  // Only show commands that make AI calls (filter by tags or known AI-using commands)
  const aiCommands = commands.filter(
    c => c.tags.some(t => ["agent", "workspace", "architect", "ai", "image"].includes(t))
  );

  if (aiCommands.length === 0) {
    return <div className="llm-empty">No AI-related commands registered.</div>;
  }

  return (
    <div className="llm-commands-list">
      {aiCommands.map(cmd => {
        const override = llm.commandModels[cmd.id];
        const effectiveModel = llm.getCommandModel(cmd.id, cmd.recommendedModel);
        const model = llm.getModelById(effectiveModel);
        const recModel = cmd.recommendedModel ? llm.getModelById(cmd.recommendedModel) : undefined;
        const isExpanded = expandedCmd === cmd.id;

        return (
          <div key={cmd.id} className="llm-command-row">
            <button
              className="llm-command-header"
              onClick={() => setExpandedCmd(isExpanded ? null : cmd.id)}
            >
              <div className="llm-command-info">
                <Terminal size={12} style={{ opacity: 0.5 }} />
                <span className="llm-command-name">{cmd.id}</span>
              </div>
              <div className="llm-command-model-badge">
                {override ? (
                  <span className="llm-override-badge">{model?.label || effectiveModel}</span>
                ) : cmd.recommendedModel ? (
                  <span className="llm-recommended-badge">{recModel?.label || cmd.recommendedModel}</span>
                ) : (
                  <span className="llm-default-badge">Global default</span>
                )}
                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </div>
            </button>
            {isExpanded && (
              <div className="llm-command-picker">
                <div className="llm-command-picker-header">
                  <span>{cmd.description}</span>
                  <div style={{ display: "flex", gap: "var(--space-sm)", alignItems: "center" }}>
                    {cmd.recommendedModel && (
                      <span className="llm-recommended-hint">Rec: {recModel?.label || cmd.recommendedModel}</span>
                    )}
                    {override && (
                      <button className="btn btn-ghost btn-xs" onClick={() => llm.clearCommandModel(cmd.id)}>
                        <Trash2 size={10} /> Reset{cmd.recommendedModel ? " to recommended" : " to global"}
                      </button>
                    )}
                  </div>
                </div>
                <ModelPicker
                  selectedId={effectiveModel}
                  onSelect={id => llm.setCommandModel(cmd.id, id)}
                />
              </div>
            )}
          </div>
        );
      })}
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
  const agentOverrideCount = Object.keys(llm.agentModels).length;
  const commandOverrideCount = Object.keys(llm.commandModels).length;

  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "providers", label: "Providers", icon: <Key size={11} /> },
    { id: "models", label: "Models", icon: <Cpu size={11} /> },
    { id: "agents", label: "Agents", icon: <Bot size={11} />, badge: agentOverrideCount },
    { id: "commands", label: "Commands", icon: <Terminal size={11} />, badge: commandOverrideCount },
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

        {tab === "models" && (
          <div className="llm-models">
            <p className="llm-section-desc">
              Global default model. Agents and commands can override this individually.
            </p>
            <ModelPicker
              selectedId={llm.globalModel}
              onSelect={id => llm.setGlobalModel(id)}
            />
          </div>
        )}

        {tab === "agents" && <AgentsTab />}
        {tab === "commands" && <CommandsTab />}
      </div>
    </div>
  );
}
