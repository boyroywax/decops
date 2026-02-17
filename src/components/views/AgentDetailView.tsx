import { useState } from "react";
import type { Agent, Channel, Group, Message, Network, ViewId, NavContext } from "../../types";
import { ROLES, CHANNEL_TYPES } from "../../constants";
import {
  Users, Calendar, Trash2, Radio,
  MessageSquare, Key, FileText, Edit3, Check, X,
} from "lucide-react";
import "../../styles/components/agent-detail.css";

interface AgentDetailViewProps {
  agentId: string;
  networkId: string;
  groupId?: string;
  agents: Agent[];
  channels: Channel[];
  groups: Group[];
  messages: Message[];
  ecosystems: Network[];
  navigateTo: (view: ViewId, ctx: NavContext) => void;
  updateAgentPrompt: (id: string, prompt: string) => void;
  removeAgent: (id: string) => void;
}

export function AgentDetailView({
  agentId, networkId, groupId,
  agents, channels, groups, messages,
  ecosystems, navigateTo,
  updateAgentPrompt, removeAgent,
}: AgentDetailViewProps) {
  const agent = agents.find(a => a.id === agentId);
  const network = ecosystems.find(n => n.id === networkId);

  const [editingPrompt, setEditingPrompt] = useState(false);
  const [promptText, setPromptText] = useState(agent?.prompt || "");

  if (!agent) {
    return (
      <div className="agent-detail__empty">
        Agent not found. It may have been removed.
      </div>
    );
  }

  const role = ROLES.find(r => r.id === agent.role);

  // Channels this agent participates in
  const agentChannels = channels.filter(
    c => c.networkId === networkId && (c.from === agentId || c.to === agentId)
  );

  // Groups this agent belongs to
  const agentGroups = groups.filter(
    g => g.networkId === networkId && g.members.includes(agentId)
  );

  // Messages sent/received
  const sentMessages = messages.filter(m => m.fromId === agentId);
  const receivedMessages = messages.filter(m => m.toId === agentId);

  // Connected agents (via channels)
  const connectedAgentIds = new Set<string>();
  agentChannels.forEach(ch => {
    if (ch.from === agentId) connectedAgentIds.add(ch.to);
    if (ch.to === agentId) connectedAgentIds.add(ch.from);
  });
  const connectedAgents = agents.filter(a => connectedAgentIds.has(a.id));

  const handleSavePrompt = () => {
    updateAgentPrompt(agentId, promptText);
    setEditingPrompt(false);
  };

  return (
    <div className="agent-detail">
      {/* Header */}
      <div className="agent-detail__header">
        <div>
          <div className="agent-detail__title-row">
            <div
              className="agent-detail__icon"
              style={{
                background: `${role?.color || "#555"}15`,
                border: `1px solid ${role?.color || "#555"}30`,
              }}
            >
              <span style={{ fontSize: 22 }}>{role?.icon}</span>
            </div>
            <div>
              <h2 className="agent-detail__title">{agent.name}</h2>
              <div
                className="agent-detail__role-badge"
                style={{
                  background: `${role?.color || "#555"}10`,
                  color: role?.color || "#555",
                  border: `1px solid ${role?.color || "#555"}15`,
                }}
              >
                {role?.char} {role?.label}
              </div>
            </div>
          </div>
          <div className="agent-detail__meta">
            <span><Calendar size={11} /> Created {new Date(agent.createdAt).toLocaleDateString()}</span>
            {network && (
              <span style={{ color: network.color }}>
                ● {network.name}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="agent-detail__stats">
        <div className="agent-detail__stat">
          <Radio size={13} />
          <span className="agent-detail__stat-value">{agentChannels.length}</span>
          Channels
        </div>
        <div className="agent-detail__stat">
          <Users size={13} />
          <span className="agent-detail__stat-value">{agentGroups.length}</span>
          Groups
        </div>
        <div className="agent-detail__stat">
          <MessageSquare size={13} />
          <span className="agent-detail__stat-value">{sentMessages.length}</span>
          Sent
        </div>
        <div className="agent-detail__stat">
          <MessageSquare size={13} />
          <span className="agent-detail__stat-value">{receivedMessages.length}</span>
          Received
        </div>
      </div>

      {/* Identity */}
      <div className="agent-detail__identity">
        <div className="agent-detail__identity-label">DID</div>
        <div className="agent-detail__identity-value">{agent.did}</div>
        <div className="agent-detail__identity-label">Public Key</div>
        <div className="agent-detail__identity-value">{agent.keys.pub}</div>
      </div>

      {/* Prompt */}
      <div className="agent-detail__section">
        <div className="agent-detail__section-title">
          <FileText size={11} style={{ display: "inline", verticalAlign: "middle" }} /> System Prompt
        </div>
        <div className="agent-detail__prompt">
          {editingPrompt ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
              <textarea
                value={promptText}
                onChange={e => setPromptText(e.target.value)}
                style={{
                  width: "100%",
                  minHeight: 120,
                  background: "rgba(0,0,0,0.3)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 8,
                  color: "#e4e4e7",
                  padding: 12,
                  fontFamily: "inherit",
                  fontSize: 13,
                  resize: "vertical",
                  outline: "none",
                }}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className="agent-detail__action-btn"
                  onClick={handleSavePrompt}
                >
                  <Check size={12} /> Save
                </button>
                <button
                  className="agent-detail__action-btn"
                  onClick={() => { setEditingPrompt(false); setPromptText(agent.prompt); }}
                >
                  <X size={12} /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              {agent.prompt ? (
                <div className="agent-detail__prompt-text">{agent.prompt}</div>
              ) : (
                <div className="agent-detail__prompt-empty">No prompt configured</div>
              )}
              <button
                className="agent-detail__action-btn"
                onClick={() => setEditingPrompt(true)}
                style={{ marginLeft: 12, flexShrink: 0 }}
              >
                <Edit3 size={11} /> Edit
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Connected Agents */}
      <div className="agent-detail__section">
        <div className="agent-detail__section-title">
          Connections ({connectedAgents.length})
        </div>
        {connectedAgents.length > 0 ? (
          <div className="agent-detail__connections">
            {connectedAgents.map(peer => {
              const peerRole = ROLES.find(r => r.id === peer.role);
              const ch = agentChannels.find(
                c => (c.from === peer.id || c.to === peer.id)
              );
              const chType = ch ? CHANNEL_TYPES.find(t => t.id === ch.type) : null;
              return (
                <div
                  key={peer.id}
                  className="agent-detail__connection"
                  onClick={() => navigateTo("networks", { networkId, agentId: peer.id })}
                >
                  <div
                    className="agent-detail__connection-icon"
                    style={{
                      background: `${peerRole?.color || "#555"}10`,
                      border: `1px solid ${peerRole?.color || "#555"}20`,
                    }}
                  >
                    <span style={{ fontSize: 13 }}>{peerRole?.icon}</span>
                  </div>
                  <div>
                    <div className="agent-detail__connection-name">{peer.name}</div>
                    <div className="agent-detail__connection-sub">
                      {peerRole?.label}{chType ? ` · ${chType.label}` : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="agent-detail__empty">No channel connections</div>
        )}
      </div>

      {/* Groups */}
      <div className="agent-detail__section">
        <div className="agent-detail__section-title">
          Groups ({agentGroups.length})
        </div>
        {agentGroups.length > 0 ? (
          <div className="agent-detail__groups">
            {agentGroups.map(g => (
              <button
                key={g.id}
                className="agent-detail__group-chip"
                onClick={() => navigateTo("networks", { networkId, groupId: g.id })}
              >
                <span
                  style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: g.color,
                    display: "inline-block",
                  }}
                />
                {g.name}
                <span style={{ color: "var(--text-faint)" }}>
                  · {g.members.length} members
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="agent-detail__empty">Not a member of any group</div>
        )}
      </div>

      {/* Actions */}
      <div className="agent-detail__actions">
        <button
          className="agent-detail__action-btn agent-detail__action-btn--danger"
          onClick={() => {
            removeAgent(agentId);
            navigateTo("networks", { networkId });
          }}
        >
          <Trash2 size={12} /> Remove Agent
        </button>
      </div>
    </div>
  );
}
