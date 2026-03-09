/**
 * AgentRuntimePanel — displays agent runtime status, autonomy controls,
 * and lifecycle activity within the Agent Detail View.
 */

import { useState, useCallback } from "react";
import type { Agent } from "@/types";
import type { AgentRuntimeStatus, AgentAutonomyLevel, AgentAutonomyConfig } from "@/types/agentRuntime";
import { DEFAULT_AGENT_AUTONOMY_CONFIG } from "@/types/agentRuntime";
import {
  activateAgent, deactivateAgent, getAgentRuntime,
  setAgentAutonomyLevel, getAgentLifecycleLog,
} from "@/services/agentRuntime";
import {
  Power, Activity, Shield, Zap, Brain, Eye,
  Users, Clock, ChevronDown, ChevronUp, AlertTriangle,
} from "lucide-react";

interface AgentRuntimePanelProps {
  agent: Agent;
  updateAgent?: (id: string, patch: Partial<Agent>) => void;
}

const STATUS_LABELS: Record<AgentRuntimeStatus, { label: string; color: string; icon: string }> = {
  idle: { label: "Idle", color: "#22c55e", icon: "●" },
  busy: { label: "Busy", color: "#f59e0b", icon: "◉" },
  thinking: { label: "Thinking", color: "#8b5cf6", icon: "◎" },
  listening: { label: "Listening", color: "#3b82f6", icon: "◉" },
  offline: { label: "Offline", color: "#6b7280", icon: "○" },
  error: { label: "Error", color: "#ef4444", icon: "✕" },
};

const AUTONOMY_LABELS: Record<AgentAutonomyLevel, { label: string; desc: string; color: string }> = {
  supervised: { label: "Supervised", desc: "Requires human approval for all actions", color: "#6b7280" },
  guided: { label: "Guided", desc: "Can execute routine tasks, escalates novel situations", color: "#3b82f6" },
  autonomous: { label: "Autonomous", desc: "Full independent operation within bounds", color: "#22c55e" },
  collaborative: { label: "Collaborative", desc: "Prefers group consensus before major actions", color: "#8b5cf6" },
};

export function AgentRuntimePanel({ agent, updateAgent }: AgentRuntimePanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [, setTick] = useState(0);

  const runtime = getAgentRuntime(agent.id);
  const isActive = !!runtime && runtime.status !== "offline";
  const config = agent.autonomyConfig || DEFAULT_AGENT_AUTONOMY_CONFIG;
  const runtimeStatus = agent.runtimeStatus || "offline";
  const statusInfo = STATUS_LABELS[isActive ? (runtime?.status || "offline") : runtimeStatus];

  const forceUpdate = useCallback(() => setTick(t => t + 1), []);

  const handleToggleActive = useCallback(() => {
    if (isActive) {
      deactivateAgent(agent.id);
      updateAgent?.(agent.id, { runtimeStatus: "offline" });
    } else {
      activateAgent(agent);
      updateAgent?.(agent.id, {
        runtimeStatus: "idle",
        activeSince: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
      });
    }
    forceUpdate();
  }, [agent, isActive, updateAgent, forceUpdate]);

  const handleAutonomyChange = useCallback((level: AgentAutonomyLevel) => {
    const newConfig: AgentAutonomyConfig = { ...config, autonomyLevel: level };
    setAgentAutonomyLevel(agent.id, { autonomyLevel: level });
    updateAgent?.(agent.id, { autonomyConfig: newConfig });
    forceUpdate();
  }, [agent.id, config, updateAgent, forceUpdate]);

  const handleToggleSelfInitiate = useCallback(() => {
    const newConfig = { ...config, canSelfInitiate: !config.canSelfInitiate };
    updateAgent?.(agent.id, { autonomyConfig: newConfig });
    forceUpdate();
  }, [agent.id, config, updateAgent, forceUpdate]);

  const handleToggleAutoMessage = useCallback(() => {
    const newConfig = { ...config, canAutoMessage: !config.canAutoMessage };
    updateAgent?.(agent.id, { autonomyConfig: newConfig });
    forceUpdate();
  }, [agent.id, config, updateAgent, forceUpdate]);

  const handleToggleDelegate = useCallback(() => {
    const newConfig = { ...config, canDelegate: !config.canDelegate };
    updateAgent?.(agent.id, { autonomyConfig: newConfig });
    forceUpdate();
  }, [agent.id, config, updateAgent, forceUpdate]);

  const recentEvents = getAgentLifecycleLog(agent.id).slice(-5).reverse();

  return (
    <div className={`agent-runtime-panel${expanded ? " agent-runtime-panel--expanded" : ""}`}>
      {/* Collapsible header */}
      <button
        className="agent-runtime-panel__header"
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
        <div className="agent-runtime-panel__header-left">
          <Activity size={12} color={statusInfo.color} />
          <span className="agent-runtime-panel__title">Agent Runtime</span>
          <span
            className="agent-runtime-panel__status-badge"
            style={{ color: statusInfo.color, borderColor: `${statusInfo.color}40` }}
          >
            {statusInfo.icon} {statusInfo.label}
          </span>
        </div>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {expanded && (
        <div className="agent-runtime-panel__body">
          {/* Power toggle */}
          <div className="agent-runtime-panel__row">
            <div className="agent-runtime-panel__row-label">
              <Power size={11} /> Status
            </div>
            <button
              className={`agent-runtime-panel__toggle ${isActive ? "active" : ""}`}
              onClick={handleToggleActive}
            >
              {isActive ? "Deactivate" : "Activate"}
            </button>
          </div>

          {/* Runtime stats (only when active) */}
          {runtime && (
            <div className="agent-runtime-panel__stats">
              <div className="agent-runtime-panel__stat">
                <Clock size={10} />
                <span>Active since {runtime.activeSince ? new Date(runtime.activeSince).toLocaleTimeString() : "—"}</span>
              </div>
              <div className="agent-runtime-panel__stat">
                <Zap size={10} />
                <span>{runtime.totalProcessed} messages processed</span>
              </div>
              <div className="agent-runtime-panel__stat">
                <Brain size={10} />
                <span>{runtime.currentModel || "default"}</span>
              </div>
              {runtime.pendingMessages > 0 && (
                <div className="agent-runtime-panel__stat agent-runtime-panel__stat--warning">
                  <AlertTriangle size={10} />
                  <span>{runtime.pendingMessages} pending</span>
                </div>
              )}
            </div>
          )}

          {/* Autonomy level */}
          <div className="agent-runtime-panel__section">
            <div className="agent-runtime-panel__section-title">
              <Shield size={11} /> Autonomy Level
            </div>
            <div className="agent-runtime-panel__autonomy-grid">
              {(Object.entries(AUTONOMY_LABELS) as [AgentAutonomyLevel, typeof AUTONOMY_LABELS[AgentAutonomyLevel]][]).map(([level, info]) => (
                <button
                  key={level}
                  className={`agent-runtime-panel__autonomy-btn ${config.autonomyLevel === level ? "selected" : ""}`}
                  style={config.autonomyLevel === level ? {
                    borderColor: info.color,
                    background: `${info.color}15`,
                    color: info.color,
                  } : undefined}
                  onClick={() => handleAutonomyChange(level)}
                  title={info.desc}
                >
                  {info.label}
                </button>
              ))}
            </div>
            <div className="agent-runtime-panel__autonomy-desc">
              {AUTONOMY_LABELS[config.autonomyLevel].desc}
            </div>
          </div>

          {/* Capability toggles */}
          <div className="agent-runtime-panel__section">
            <div className="agent-runtime-panel__section-title">
              <Zap size={11} /> Capabilities
            </div>
            <div className="agent-runtime-panel__toggles">
              <label className="agent-runtime-panel__checkbox">
                <input type="checkbox" checked={config.canSelfInitiate} onChange={handleToggleSelfInitiate} />
                <Eye size={11} /> Self-initiate tasks
              </label>
              <label className="agent-runtime-panel__checkbox">
                <input type="checkbox" checked={config.canAutoMessage} onChange={handleToggleAutoMessage} />
                <Zap size={11} /> Auto-send messages
              </label>
              <label className="agent-runtime-panel__checkbox">
                <input type="checkbox" checked={config.canDelegate} onChange={handleToggleDelegate} />
                <Users size={11} /> Delegate to peers
              </label>
            </div>
          </div>

          {/* Recent lifecycle events */}
          {recentEvents.length > 0 && (
            <div className="agent-runtime-panel__section">
              <div className="agent-runtime-panel__section-title">
                <Activity size={11} /> Recent Activity
              </div>
              <div className="agent-runtime-panel__events">
                {recentEvents.map((event, i) => (
                  <div key={i} className="agent-runtime-panel__event">
                    <span className="agent-runtime-panel__event-kind">{event.kind.replace(/_/g, " ")}</span>
                    <span className="agent-runtime-panel__event-time">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
