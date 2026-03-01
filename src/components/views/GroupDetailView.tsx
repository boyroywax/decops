import { useState } from "react";
import type { Agent, Group, Network, ViewId, NavContext } from "../../types";
import { ROLES, GOVERNANCE_MODELS } from "../../constants";
import {
  Users, Calendar, Trash2, Radio, Cpu, ChevronDown, X,
} from "lucide-react";
import { CopyableId } from "../shared/CopyableId";
import { GroupBadge } from "../shared/GroupBadge";
import { GroupTradingCard } from "../shared/GroupTradingCard";
import { useDeleteConfirm } from "../../hooks/useDeleteConfirm";
import { DeleteConfirmInline } from "../shared/DeleteConfirmInline";
import { useLLM } from "../../context/LLMContext";
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

// ── Group LLM Model Picker ──

function GroupModelPicker({ groupId, recommendedModel }: { groupId: string; recommendedModel?: string }) {
  const { allModels, getGroupModel, setGroupModel, clearGroupModel, getModelById, globalModel } = useLLM();
  const [open, setOpen] = useState(false);
  const resolvedId = getGroupModel(groupId, recommendedModel);
  const resolved = getModelById(resolvedId);
  const hasOverride = !!getModelById(resolvedId) && resolvedId !== (recommendedModel || globalModel);
  const textModels = allModels.filter(m => m.tier !== "image");

  return (
    <div className="group-detail__model-picker">
      <div className="group-detail__model-picker-label">
        <Cpu size={11} /> LLM Model
      </div>
      <button
        className={`group-detail__model-picker-btn${hasOverride ? " group-detail__model-picker-btn--override" : ""}`}
        onClick={() => setOpen(o => !o)}
      >
        <span className="group-detail__model-picker-name">{resolved?.label || resolvedId}</span>
        {hasOverride && (
          <span className="group-detail__model-picker-badge">override</span>
        )}
        <ChevronDown size={12} style={{ opacity: 0.5, transform: open ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }} />
      </button>
      {open && (
        <div className="group-detail__model-dropdown">
          {/* Reset option */}
          {hasOverride && (
            <button
              className="group-detail__model-option group-detail__model-option--reset"
              onClick={() => { clearGroupModel(groupId); setOpen(false); }}
            >
              <X size={11} /> Reset to {recommendedModel ? "recommended" : "global default"}
            </button>
          )}
          {textModels.map(m => (
            <button
              key={m.id}
              className={`group-detail__model-option${m.id === resolvedId ? " group-detail__model-option--active" : ""}`}
              onClick={() => { setGroupModel(groupId, m.id); setOpen(false); }}
            >
              <span className="group-detail__model-option-label">{m.label}</span>
              <span className="group-detail__model-option-desc">{m.desc}</span>
              <span className={`group-detail__model-option-tier group-detail__model-option-tier--${m.tier}`}>{m.tier}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
  const [showTradingCard, setShowTradingCard] = useState(false);
  const delConfirm = useDeleteConfirm();

  return (
    <div className="group-detail">
      {/* Header */}
      <div className="group-detail__header">
        <div>
          <div className="group-detail__title-row">
            <GroupBadge group={group} members={memberAgents} size={52} onClick={() => setShowTradingCard(true)} />
            <div>
              <h2 className="group-detail__title">{group.name}</h2>
              <div className="group-detail__did"><CopyableId value={group.did} label="DID" /></div>
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

      {/* LLM Model */}
      <GroupModelPicker groupId={group.id} recommendedModel={group.modelId} />

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
              const agentGroup = groups.find(g => g.networkId === networkId && g.members.includes(agent.id));
              return (
                <div
                  key={agent.id}
                  className="group-detail__member"
                  style={{ opacity: 0.6 }}
                  onClick={() => navigateTo("networks", { networkId, ...(agentGroup ? { groupId: agentGroup.id } : {}), agentId: agent.id })}
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
        {delConfirm.isPending(groupId) ? (
          <DeleteConfirmInline
            entityName="Group"
            entityLabel={group.name}
            onConfirm={() => delConfirm.confirm(() => { removeGroup(groupId); navigateTo("networks", { networkId }); })}
            onCancel={delConfirm.cancel}
            compact
          />
        ) : (
          <button
            className="group-detail__action-btn group-detail__action-btn--danger"
            onClick={() => delConfirm.requestDelete(groupId)}
          >
            <Trash2 size={12} /> Remove Group
          </button>
        )}
      </div>

      {/* Trading card modal */}
      <GroupTradingCard
        group={group}
        members={memberAgents}
        networkName={network?.name}
        networkColor={network?.color}
        isOpen={showTradingCard}
        onClose={() => setShowTradingCard(false)}
      />
    </div>
  );
}
