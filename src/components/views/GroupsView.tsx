import type { Agent, Group, GroupForm, GovernanceModelId, Channel, Message, ViewId, Network } from "../../types";
import { Hexagon, X, MessageSquare, Check, Plus, Globe } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import { ROLES, GOVERNANCE_MODELS } from "../../constants";
import { SectionTitle, BulkCheckbox, BulkActionBar } from "../shared/ui";
import { useBulkSelect } from "../../hooks/useBulkSelect";
import "../../styles/components/groups.css";

interface GroupsViewProps {
  agents: Agent[];
  groups: Group[];
  ecosystems: Network[];
  showGroupCreate: boolean;
  setShowGroupCreate: (v: boolean) => void;
  groupForm: GroupForm;
  setGroupForm: (v: GroupForm) => void;
  selectedGroup: string | null;
  setSelectedGroup: (v: string | null) => void;
  createGroup: () => void;
  removeGroup: (id: string) => void;
  removeGroups: (ids: Set<string>) => void;
  toggleGroupMember: (agentId: string) => void;
  setBroadcastGroup: (id: string) => void;
  setView: (v: ViewId) => void;
}

export function GroupsView({
  agents, groups, ecosystems,
  showGroupCreate, setShowGroupCreate, groupForm, setGroupForm,
  selectedGroup, setSelectedGroup,
  createGroup, removeGroup, removeGroups, toggleGroupMember,
  setBroadcastGroup, setView,
}: GroupsViewProps) {
  const bulk = useBulkSelect();

  const getNetworkName = (networkId?: string) => {
    if (!networkId) return null;
    const net = ecosystems.find(n => n.id === networkId);
    return net ? { name: net.name, color: net.color } : null;
  };

  const handleBulkDelete = () => {
    removeGroups(bulk.selected);
    bulk.clearSelection();
  };

  return (
    <div>
      <div className="groups-header">
        <div className="groups-header-left">
          <h2 className="groups-title"><GradientIcon icon={Hexagon} size={18} gradient={["#f472b6", "#fb7185"]} /> Group Governance</h2>
          {groups.length > 0 && (
            <BulkCheckbox
              checked={bulk.isAllSelected(groups.map(g => g.id))}
              onChange={() => bulk.toggleAll(groups.map(g => g.id))}
              color="#f472b6"
            />
          )}
        </div>
        <button onClick={() => setShowGroupCreate(!showGroupCreate)} className={`groups-toggle-btn ${showGroupCreate ? "groups-toggle-btn--cancel" : "groups-toggle-btn--create"}`}>{showGroupCreate ? <><X size={12} /> Cancel</> : "+ Form Group"}</button>
      </div>

      {showGroupCreate && (
        <div className="group-form">
          {ecosystems.length === 0 ? (
            <div className="group-form-no-networks">
              <Globe size={24} className="group-form-no-networks-icon" />
              <div className="group-form-no-networks-title">No networks available</div>
              <div className="group-form-no-networks-subtitle">Create a network first before forming groups.</div>
            </div>
          ) : (
            <>
              <SectionTitle text="Network Assignment" />
              <select
                value={groupForm.networkId}
                onChange={(e) => setGroupForm({ ...groupForm, networkId: e.target.value, members: [] })}
                className="input group-form-select"
              >
                <option value="">Select network...</option>
                {ecosystems.map((n) => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>
              <SectionTitle text="Group Identity" />
              <input placeholder="Group name" value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} className="input group-form-name-input" />
              <SectionTitle text="Governance Model" />
              <div className="group-governance-grid">
                {GOVERNANCE_MODELS.map((g) => (
                  <button key={g.id} onClick={() => setGroupForm({ ...groupForm, governance: g.id })} className={`group-governance-btn ${groupForm.governance === g.id ? "group-governance-btn--selected" : ""}`}>
                    <div className="group-governance-label">{g.icon} {g.label}</div>
                    <div className="group-governance-desc">{g.desc}</div>
                  </button>
                ))}
              </div>
              {groupForm.governance === "threshold" && (
                <div className="group-threshold-section">
                  <SectionTitle text="Threshold (M-of-N)" />
                  <div className="group-threshold-row">
                    <input type="number" min={1} max={groupForm.members.length || 10} value={groupForm.threshold} onChange={(e) => setGroupForm({ ...groupForm, threshold: parseInt(e.target.value) || 2 })} className="input group-threshold-input" />
                    <span className="group-threshold-label">of {groupForm.members.length} required</span>
                  </div>
                </div>
              )}
              <SectionTitle text="Select Members" />
              {!groupForm.networkId ? (
                <div className="group-members-notice">Select a network first to see available agents.</div>
              ) : (() => {
                const networkAgents = agents.filter(a => a.networkId === groupForm.networkId);
                if (networkAgents.length === 0) {
                  return (
                    <div className="group-members-notice">No agents in this network. Create agents first.</div>
                  );
                }
                return (
                  <div className="group-members-list">
                    {networkAgents.map((a) => {
                      const role = ROLES.find((r) => r.id === a.role)!;
                      const selected = groupForm.members.includes(a.id);
                      return (
                        <button key={a.id} onClick={() => toggleGroupMember(a.id)} className="group-member-toggle" style={{
                          background: selected ? role.color + "15" : undefined,
                          borderColor: selected ? role.color + "40" : undefined,
                          color: selected ? role.color : undefined,
                        }}>
                          {selected ? "✓ " : ""}{role.icon} {a.name}
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
              <div className="group-form-footer">
                <span className="group-form-count">{groupForm.members.length} selected</span>
                <button
                  onClick={createGroup}
                  disabled={groupForm.members.length < 2 || !groupForm.name.trim() || !groupForm.networkId}
                  className="group-form-submit"
                >
                  Form Group
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {groups.length === 0 && !showGroupCreate && (
        <div className="groups-empty-state">
          <GradientIcon icon={Hexagon} size={32} gradient={["#f472b6", "#fb7185"]} />
          <div className="groups-empty-text">No groups yet.</div>
        </div>
      )}

      <div className="groups-grid">
        {groups.map((g) => {
          const gov = GOVERNANCE_MODELS.find((m) => m.id === g.governance);
          const memberAgents = g.members.map((mid) => agents.find((a) => a.id === mid)).filter(Boolean) as Agent[];
          const network = getNetworkName(g.networkId);
          const isSelected = selectedGroup === g.id;
          const isChecked = bulk.has(g.id);
          return (
            <div key={g.id} onClick={() => setSelectedGroup(isSelected ? null : g.id)} className={`group-card ${isChecked ? "group-card--checked" : ""}`} style={!isChecked && isSelected ? { background: g.color + "08", borderColor: g.color + "35" } : undefined}>
              <div className="group-card-top">
                <div className="group-card-info">
                  <BulkCheckbox checked={isChecked} onChange={() => bulk.toggle(g.id)} color={g.color} />
                  <div>
                    <div className="group-card-name" style={{ color: g.color }}><Hexagon size={14} /> {g.name}</div>
                    <div className="group-card-governance">{gov?.icon} {gov?.label}</div>
                  </div>
                </div>
                <div className="group-card-badges">
                  {network && <span className="group-network-badge" style={{ color: network.color, background: network.color + "15" }}><Globe size={9} /> {network.name}</span>}
                  <span className="group-member-count">{memberAgents.length} members</span>
                </div>
              </div>
              <div className="group-did"><div className="group-did-label">GROUP DID</div><div className="group-did-value">{g.did}</div></div>
              {g.governance === "threshold" && <div className="group-threshold-info">Threshold: <span style={{ color: g.color }}>{g.threshold}</span> of {memberAgents.length}</div>}
              <div className="group-members-badges">
                {memberAgents.map((a) => {
                  const role = ROLES.find((r) => r.id === a.role)!;
                  return (
                    <span key={a.id} className="group-member-badge" style={{ background: role.color + "12", color: role.color, borderColor: role.color + "25" }}>
                      {role.icon} {a.name}{a.prompt && <span className="group-member-badge-prompt"><MessageSquare size={6} /></span>}
                    </span>
                  );
                })}
              </div>
              {isSelected && (
                <div className="group-details" style={{ borderTopColor: g.color + "15" }}>
                  <SectionTitle text="Member Capabilities" />
                  {memberAgents.map((a) => (
                    <div key={a.id} className="group-capability-card">
                      <div className="group-capability-name">{a.name}</div>
                      <div className={`group-capability-prompt ${a.prompt ? "group-capability-prompt--filled" : "group-capability-prompt--empty"}`}>{a.prompt || "No prompt defined"}</div>
                    </div>
                  ))}
                  <div className="group-actions">
                    <button onClick={(e) => { e.stopPropagation(); setBroadcastGroup(g.id); setView("messages"); }} className="group-action-btn group-action-btn--broadcast">Broadcast</button>
                    <button onClick={(e) => { e.stopPropagation(); removeGroup(g.id); }} className="group-action-btn group-action-btn--dissolve">Dissolve</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <BulkActionBar
        count={bulk.count}
        total={groups.length}
        onSelectAll={() => bulk.selectAll(groups.map(g => g.id))}
        onClear={bulk.clearSelection}
        onDelete={handleBulkDelete}
        allSelected={bulk.isAllSelected(groups.map(g => g.id))}
        entityName="group"
      />
    </div>
  );
}
