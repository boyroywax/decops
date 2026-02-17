import type { Agent, Channel, Group, Network, Bridge, ViewId, NavContext } from "../../types";
import { ROLES, CHANNEL_TYPES, GOVERNANCE_MODELS } from "../../constants";
import {
  Globe, Users, Radio, Link2, Calendar,
} from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import { NetworkCanvas } from "../canvas/NetworkCanvas";
import "../../styles/components/network-detail.css";

interface NetworkDetailViewProps {
  networkId: string;
  agents: Agent[];
  channels: Channel[];
  groups: Group[];
  ecosystems: Network[];
  bridges: Bridge[];
  navigateTo: (view: ViewId, ctx: NavContext) => void;
  dissolveNetwork: (id: string) => void;
}

export function NetworkDetailView({
  networkId, agents, channels, groups,
  ecosystems, bridges, navigateTo, dissolveNetwork,
}: NetworkDetailViewProps) {
  const network = ecosystems.find(n => n.id === networkId);
  if (!network) {
    return (
      <div className="network-detail__empty">
        Network not found. It may have been dissolved.
      </div>
    );
  }

  // Filter workspace entities belonging to this network
  const networkAgents = agents.filter(a => a.networkId === networkId);
  const networkChannels = channels.filter(c => c.networkId === networkId);
  const networkGroups = groups.filter(g => g.networkId === networkId);
  const networkBridges = bridges.filter(b => b.fromNetworkId === networkId || b.toNetworkId === networkId);
  const activeChannels = new Set<string>();

  return (
    <div className="network-detail">
      {/* Header */}
      <div className="network-detail__header">
        <div>
          <div className="network-detail__title-row">
            <div
              className="network-detail__icon"
              style={{
                background: `${network.color}15`,
                border: `1px solid ${network.color}30`,
              }}
            >
              <Globe size={22} color={network.color} />
            </div>
            <div>
              <h2 className="network-detail__title">{network.name}</h2>
              <div className="network-detail__did">{network.did}</div>
            </div>
          </div>
          <div className="network-detail__meta">
            <span><Calendar size={11} /> Created {new Date(network.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      {/* Description */}
      {network.description && (
        <div className="network-detail__description">{network.description}</div>
      )}

      {/* Stats */}
      <div className="network-detail__stats">
        <div className="network-detail__stat">
          <Users size={13} />
          <span className="network-detail__stat-value">{networkAgents.length}</span>
          Agents
        </div>
        <div className="network-detail__stat">
          <Radio size={13} />
          <span className="network-detail__stat-value">{networkChannels.length}</span>
          Channels
        </div>
        <div className="network-detail__stat">
          <GradientIcon icon={Globe} size={13} gradient={["#a78bfa", "#c084fc"]} />
          <span className="network-detail__stat-value">{networkGroups.length}</span>
          Groups
        </div>
        <div className="network-detail__stat">
          <Link2 size={13} />
          <span className="network-detail__stat-value">{networkBridges.length}</span>
          Bridges
        </div>
      </div>

      {/* Topology Canvas */}
      {networkAgents.length > 0 && (
        <div className="network-detail__section">
          <div className="network-detail__section-title">Topology</div>
          <div className="network-detail__topology">
            <NetworkCanvas
              agents={networkAgents}
              channels={networkChannels}
              groups={networkGroups}
              activeChannels={activeChannels}
            />
          </div>
        </div>
      )}

      {/* Agents Grid */}
      <div className="network-detail__section">
        <div className="network-detail__section-title">
          Agents ({networkAgents.length})
        </div>
        {networkAgents.length > 0 ? (
          <div className="network-detail__grid">
            {networkAgents.map(agent => {
              const role = ROLES.find(r => r.id === agent.role);
              // Find the first group this agent belongs to (for breadcrumb context)
              const agentGroup = networkGroups.find(g => g.members.includes(agent.id));
              return (
                <div
                  key={agent.id}
                  className="nd-card"
                  onClick={() => navigateTo("networks", {
                    networkId,
                    ...(agentGroup ? { groupId: agentGroup.id } : {}),
                    agentId: agent.id,
                  })}
                >
                  <div className="nd-card__header">
                    <div
                      className="nd-card__icon"
                      style={{
                        background: `${role?.color || "#555"}10`,
                        border: `1px solid ${role?.color || "#555"}20`,
                      }}
                    >
                      <span style={{ fontSize: 13 }}>{role?.icon}</span>
                    </div>
                    <div>
                      <div className="nd-card__name">{agent.name}</div>
                      <div className="nd-card__sub">{role?.label}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="network-detail__empty">No agents in this network</div>
        )}
      </div>

      {/* Groups Grid */}
      <div className="network-detail__section">
        <div className="network-detail__section-title">
          Groups ({networkGroups.length})
        </div>
        {networkGroups.length > 0 ? (
          <div className="network-detail__grid">
            {networkGroups.map(group => {
              const gov = GOVERNANCE_MODELS.find(g => g.id === group.governance);
              const memberAgents = networkAgents.filter(a => group.members.includes(a.id));
              return (
                <div
                  key={group.id}
                  className="nd-card"
                  onClick={() => navigateTo("networks", { networkId, groupId: group.id })}
                >
                  <div className="nd-card__header">
                    <div
                      className="nd-card__icon"
                      style={{
                        background: `${group.color}15`,
                        border: `1px solid ${group.color}30`,
                      }}
                    >
                      <Users size={14} color={group.color} />
                    </div>
                    <div>
                      <div className="nd-card__name">{group.name}</div>
                      <div className="nd-card__sub">
                        {memberAgents.length} members · {gov?.label}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="network-detail__empty">No groups in this network</div>
        )}
      </div>

      {/* Channels Section */}
      <div className="network-detail__section">
        <div className="network-detail__section-title">
          Channels ({networkChannels.length})
        </div>
        {networkChannels.length > 0 ? (
          <div className="network-detail__grid">
            {networkChannels.map(ch => {
              const chType = CHANNEL_TYPES.find(t => t.id === ch.type);
              const fromAgent = networkAgents.find(a => a.id === ch.from);
              const toAgent = networkAgents.find(a => a.id === ch.to);
              return (
                <div key={ch.id} className="nd-card" style={{ cursor: "default" }}>
                  <div className="nd-card__header">
                    <div
                      className="nd-card__icon"
                      style={{
                        background: "rgba(167,139,250,0.08)",
                        border: "1px solid rgba(167,139,250,0.15)",
                      }}
                    >
                      <Radio size={14} color="#a78bfa" />
                    </div>
                    <div>
                      <div className="nd-card__name">
                        {fromAgent?.name || "?"} → {toAgent?.name || "?"}
                      </div>
                      <div className="nd-card__sub">{chType?.label} · {ch.mode || "p2p"}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="network-detail__empty">No channels in this network</div>
        )}
      </div>

      {/* Bridges Section */}
      {networkBridges.length > 0 && (
        <div className="network-detail__section">
          <div className="network-detail__section-title">
            Bridges ({networkBridges.length})
          </div>
          <div className="network-detail__grid">
            {networkBridges.map(bridge => {
              const otherNetId = bridge.fromNetworkId === networkId ? bridge.toNetworkId : bridge.fromNetworkId;
              const otherNet = ecosystems.find(n => n.id === otherNetId);
              const fromAgent = agents.find(a => a.id === bridge.fromAgentId);
              const toAgent = agents.find(a => a.id === bridge.toAgentId);
              return (
                <div
                  key={bridge.id}
                  className="nd-card"
                  onClick={() => otherNetId && navigateTo("networks", { networkId: otherNetId })}
                >
                  <div className="nd-card__header">
                    <div
                      className="nd-card__icon"
                      style={{
                        background: "rgba(251,191,36,0.08)",
                        border: "1px solid rgba(251,191,36,0.15)",
                      }}
                    >
                      <Link2 size={14} color="#fbbf24" />
                    </div>
                    <div>
                      <div className="nd-card__name">↔ {otherNet?.name || "Unknown"}</div>
                      <div className="nd-card__sub">
                        {fromAgent?.name} → {toAgent?.name}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
