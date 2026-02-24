/**
 * LLM Manager Modal — centralised provider, model & override management
 *
 * Tabs:
 *  1. Providers   — API keys + liveness per provider
 *  2. Models      — Global default model picker
 *  3. Agents      — Per-agent model overrides
 *  4. Commands    — Per-command model overrides
 */

import { useState, useRef, useEffect } from "react";
import {
  X, Key, Bot, Cpu, Zap, RefreshCw, Trash2, Check,
  ChevronDown, ChevronUp, Terminal, Eye, EyeOff,
} from "lucide-react";
import { useLLM, type ProviderId, type LivenessStatus, type LLMModel } from "../../context/LLMContext";
import { useWorkspaceContext } from "../../context/WorkspaceContext";
import { registry } from "../../services/commands/registry";
import "../../styles/components/llm-manager.css";

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

  // Group by provider
  const grouped = models.reduce<Record<string, LLMModel[]>>((acc, m) => {
    (acc[m.provider] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div className="llm-model-picker">
      {Object.entries(grouped).map(([provider, pModels]) => (
        <div key={provider} className="llm-model-group">
          <div className="llm-model-group-label">{provider === "anthropic" ? "Anthropic" : "Google AI"}</div>
          {pModels.map(m => {
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
        const effectiveModel = llm.getAgentModel(agent.id);
        const model = llm.getModelById(effectiveModel);
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
                  {override && (
                    <button className="btn btn-ghost btn-xs" onClick={() => llm.clearAgentModel(agent.id)}>
                      <Trash2 size={10} /> Reset to global
                    </button>
                  )}
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
        const effectiveModel = llm.getCommandModel(cmd.id);
        const model = llm.getModelById(effectiveModel);
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
                  {override && (
                    <button className="btn btn-ghost btn-xs" onClick={() => llm.clearCommandModel(cmd.id)}>
                      <Trash2 size={10} /> Reset to global
                    </button>
                  )}
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

// ── Main Modal ──

export function LLMManager() {
  const llm = useLLM();
  const [tab, setTab] = useState<Tab>("providers");
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!llm.isManagerOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") llm.closeManager(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [llm.isManagerOpen, llm.closeManager]);

  if (!llm.isManagerOpen) return null;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "providers", label: "Providers", icon: <Key size={13} /> },
    { id: "models", label: "Models", icon: <Cpu size={13} /> },
    { id: "agents", label: "Agents", icon: <Bot size={13} /> },
    { id: "commands", label: "Commands", icon: <Terminal size={13} /> },
  ];

  // Count overrides for badges
  const agentOverrideCount = Object.keys(llm.agentModels).length;
  const commandOverrideCount = Object.keys(llm.commandModels).length;

  return (
    <div
      ref={backdropRef}
      className="llm-backdrop"
      onClick={e => { if (e.target === backdropRef.current) llm.closeManager(); }}
    >
      <div className="llm-modal">
        {/* Header */}
        <div className="llm-header">
          <div className="llm-header-left">
            <Zap size={16} color="#00e5a0" />
            <span className="llm-header-title">LLM Manager</span>
            <LiveDot status={llm.overallStatus} size={6} />
          </div>
          <button onClick={llm.closeManager} className="btn-icon">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="llm-tabs">
          {tabs.map(t => (
            <button
              key={t.id}
              className={`llm-tab ${tab === t.id ? "llm-tab--active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.icon}
              {t.label}
              {t.id === "agents" && agentOverrideCount > 0 && (
                <span className="llm-tab-badge">{agentOverrideCount}</span>
              )}
              {t.id === "commands" && commandOverrideCount > 0 && (
                <span className="llm-tab-badge">{commandOverrideCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="llm-body">
          {tab === "providers" && (
            <div className="llm-providers">
              <p className="llm-section-desc">
                API keys are stored in your browser's localStorage. Not sent anywhere except the provider's API.
              </p>
              {llm.providers.map(p => <ProviderCard key={p.id} providerId={p.id} />)}
              <div className="llm-probe-all">
                <button className="btn btn-ghost" onClick={() => llm.checkLiveness()}>
                  <RefreshCw size={12} /> Test All Connections
                </button>
              </div>
            </div>
          )}

          {tab === "models" && (
            <div className="llm-models">
              <p className="llm-section-desc">
                Global default model for all agent conversations and mesh generation. Agents and commands can override this.
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
    </div>
  );
}
