import type { Agent, Group, Network, ViewId, NavContext } from "../../types";
import { ROLES, GOVERNANCE_MODELS } from "../../constants";
import {
  Users, Calendar, Trash2, Radio,
} from "lucide-react";
import "../../styles/components/group-detail.css";

interface GroupDetailViewProps {
  groupId: string;
  networkId: string;
  agents: Agent[];
  groups: Group[];
  ecosystems: Network[];
  navigateTo: (view: ViewId, ctx: NavContext) => void;
  removeGroup: (id: string) => void;
  setBroadcastGroup: (id: string | null) => void;
  setView: (v: ViewId) => void;
}

export function GroupDetailView({
  groupId, networkId, agents, groups,
  ecosystems, navigateTo, removeGroup,
  setBroadcastGroup, setView,
}: GroupDetailViewProps) {
  const group = groups.find(g => g.id === groupId);
  const network = ecosystems.find(n => n.id === networkId);

  if (!group) {
    return (
      <div className="group-detail__empty">
        Group not found. It may have been removed.
      </div>
    );
  }

  const gov = GOVERNANCE_MODELS.find(g => g.id === group.governance);
  const memberAgents = agents.filter(a => group.members.includes(a.id));
  const nonMembers = agents.filter(a => a.networkId === networkId && !group.members.includes(a.id));

  return (
    <div className="group-detail">
      {/* Header */}
      <div className="group-detail__header">
        <div>
          <div className="group-detail__title-row">
            <div
              className="group-detail__icon"
              style={{
                background: `${group.color}15`,
                border: `1px solid ${group.color}30`,
              }}
            >
              <Users size={22} color={group.color} />
            </div>
            <div>
              <h2 className="group-detail__title">{group.name}</h2>
              <div className="group-detail__did">{group.did}</div>
            </div>
          </div>
          <div className="group-detail__meta">
            <span><Calendar size={11} /> Created {new Date(group.createdAt).toLocaleDateString()}</span>
            {network && (
              <span style={{ color: network.color }}>
                ● {network.name}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Governance */}
      <div className="group-detail__governance">
        <div>
          <div className="group-detail__gov-label">
            {gov?.icon} {gov?.label || group.governance}
          </div>
          <div className="group-detail__gov-desc">
            {gov?.desc}
          </div>
        </div>
        <div className="group-detail__threshold">
          Threshold: {group.threshold}/{group.members.length}
        </div>
      </div>

      {/* Members */}
      <div className="group-detail__section">
        <div className="group-detail__section-title">
          Members ({memberAgents.length})
        </div>
        {memberAgents.length > 0 ? (
          <div className="group-detail__members">
            {memberAgents.map(agent => {
              const role = ROLES.find(r => r.id === agent.role);
              return (
                <div
                  key={agent.id}
                  className="group-detail__member"
                  onClick={() => navigateTo("networks", { networkId, groupId, agentId: agent.id })}
                >
                  <div
                    className="group-detail__member-icon"
                    style={{
                      background: `${role?.color || "#555"}10`,
                      border: `1px solid ${role?.color || "#555"}20`,
                    }}
                  >
                    <span style={{ fontSize: 13 }}>{role?.icon}</span>
                  </div>
                  <div>
                    <div className="group-detail__member-name">{agent.name}</div>
                    <div className="group-detail__member-role">{role?.label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="group-detail__empty">No members in this group</div>
        )}
      </div>

      {/* Non-members in same network */}
      {nonMembers.length > 0 && (
        <div className="group-detail__section">
          <div className="group-detail__section-title">
            Other Agents in Network ({nonMembers.length})
          </div>
          <div className="group-detail__members">
            {nonMembers.map(agent => {
              const role = ROLES.find(r => r.id === agent.role);
              return (
                <div
                  key={agent.id}
                  className="group-detail__member"
                  style={{ opacity: 0.6 }}
                  onClick={() => navigateTo("networks", { networkId, agentId: agent.id })}
                >
                  <div
                    className="group-detail__member-icon"
                    style={{
                      background: `${role?.color || "#555"}10`,
                      border: `1px solid ${role?.color || "#555"}20`,
                    }}
                  >
                    <span style={{ fontSize: 13 }}>{role?.icon}</span>
                  </div>
                  <div>
                    <div className="group-detail__member-name">{agent.name}</div>
                    <div className="group-detail__member-role">{role?.label} · not a member</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="group-detail__actions">
        <button
          className="group-detail__action-btn"
          onClick={() => {
            setBroadcastGroup(groupId);
            setView("messages");
          }}
        >
          <Radio size={12} /> Broadcast to Group
        </button>
        <button
          className="group-detail__action-btn group-detail__action-btn--danger"
          onClick={() => {
            removeGroup(groupId);
            navigateTo("networks", { networkId });
          }}
        >
          <Trash2 size={12} /> Remove Group
        </button>
      </div>
    </div>
  );
}
