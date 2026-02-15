import type { Agent, Group, GroupForm, GovernanceModelId, Channel, Message, ViewId, Keystone } from "../../types";
import { Hexagon, X, MessageSquare, Check, Plus } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import { ROLES, GOVERNANCE_MODELS } from "../../constants";
import { inputStyle, SectionTitle, BulkCheckbox, BulkActionBar } from "../shared/ui";
import { useBulkSelect } from "../../hooks/useBulkSelect";

interface GroupsViewProps {
  agents: Agent[];
  groups: Group[];
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
  updateGroup: (id: string, updates: Partial<Group>) => void;
}

export function GroupsView({
  agents, groups,
  showGroupCreate, setShowGroupCreate, groupForm, setGroupForm,
  selectedGroup, setSelectedGroup,
  createGroup, removeGroup, removeGroups, toggleGroupMember,
  setBroadcastGroup, setView, updateGroup
}: GroupsViewProps) {
  const bulk = useBulkSelect();

  const handleBulkDelete = () => {
    removeGroups(bulk.selected);
    bulk.clearSelection();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 600, margin: 0 }}><GradientIcon icon={Hexagon} size={18} gradient={["#f472b6", "#fb7185"]} /> Group Governance</h2>
          {groups.length > 0 && (
            <BulkCheckbox
              checked={bulk.isAllSelected(groups.map(g => g.id))}
              onChange={() => bulk.toggleAll(groups.map(g => g.id))}
              color="#f472b6"
            />
          )}
        </div>
        <button onClick={() => setShowGroupCreate(!showGroupCreate)} style={{ background: showGroupCreate ? "rgba(239,68,68,0.15)" : "rgba(244,114,182,0.12)", color: showGroupCreate ? "#ef4444" : "#f472b6", border: `1px solid ${showGroupCreate ? "rgba(239,68,68,0.3)" : "rgba(244,114,182,0.25)"}`, padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>{showGroupCreate ? <><X size={12} /> Cancel</> : "+ Form Group"}</button>
      </div>

      {showGroupCreate && (
        <div style={{ background: "rgba(244,114,182,0.04)", border: "1px solid rgba(244,114,182,0.12)", borderRadius: 10, padding: 20, marginBottom: 20 }}>
          <SectionTitle text="Group Identity" />
          <input placeholder="Group name" value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} style={{ ...inputStyle, border: "1px solid rgba(244,114,182,0.15)", marginBottom: 16 }} />
          <SectionTitle text="Governance Model" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8, marginBottom: 16 }}>
            {GOVERNANCE_MODELS.map((g) => (
              <button key={g.id} onClick={() => setGroupForm({ ...groupForm, governance: g.id })} style={{
                background: groupForm.governance === g.id ? "rgba(244,114,182,0.1)" : "rgba(0,0,0,0.3)",
                border: `1px solid ${groupForm.governance === g.id ? "rgba(244,114,182,0.35)" : "rgba(255,255,255,0.06)"}`,
                color: groupForm.governance === g.id ? "#f472b6" : "#71717a",
                padding: "10px 14px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              }}>
                <div style={{ fontSize: 13, marginBottom: 4 }}>{g.icon} {g.label}</div>
                <div style={{ fontSize: 9, color: "#52525b" }}>{g.desc}</div>
              </button>
            ))}
          </div>
          {groupForm.governance === "threshold" && (
            <div style={{ marginBottom: 16 }}>
              <SectionTitle text="Threshold (M-of-N)" />
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input type="number" min={1} max={groupForm.members.length || 10} value={groupForm.threshold} onChange={(e) => setGroupForm({ ...groupForm, threshold: parseInt(e.target.value) || 2 })} style={{ ...inputStyle, width: 60, textAlign: "center", border: "1px solid rgba(244,114,182,0.15)" }} />
                <span style={{ fontSize: 11, color: "#71717a" }}>of {groupForm.members.length} required</span>
              </div>
            </div>
          )}
          <SectionTitle text="Select Members" />
          {agents.length === 0 ? (
            <div style={{ fontSize: 11, color: "#3f3f46", padding: 16 }}>Create agents first.</div>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              {agents.map((a) => {
                const role = ROLES.find((r) => r.id === a.role)!;
                const selected = groupForm.members.includes(a.id);
                return (
                  <button key={a.id} onClick={() => toggleGroupMember(a.id)} style={{
                    background: selected ? role.color + "15" : "rgba(0,0,0,0.3)",
                    border: `1px solid ${selected ? role.color + "40" : "rgba(255,255,255,0.06)"}`,
                    color: selected ? role.color : "#71717a",
                    padding: "8px 14px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 11,
                  }}>
                    {selected ? "✓ " : ""}{role.icon} {a.name}
                  </button>
                );
              })}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 10, color: "#52525b" }}>{groupForm.members.length} selected</span>
            <button onClick={createGroup} disabled={groupForm.members.length < 2 || !groupForm.name.trim()} style={{ background: groupForm.members.length >= 2 && groupForm.name.trim() ? "#f472b6" : "#3f3f46", color: "#0a0a0f", border: "none", padding: "10px 20px", borderRadius: 6, cursor: groupForm.members.length >= 2 ? "pointer" : "not-allowed", fontFamily: "inherit", fontSize: 12, fontWeight: 500 }}>Form Group</button>
          </div>
        </div>
      )}

      {groups.length === 0 && !showGroupCreate && (
        <div style={{ textAlign: "center", padding: 60, color: "#3f3f46", border: "1px dashed rgba(244,114,182,0.1)", borderRadius: 12 }}>
          <GradientIcon icon={Hexagon} size={32} gradient={["#f472b6", "#fb7185"]} />
          <div style={{ fontSize: 12 }}>No groups yet.</div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {groups.map((g) => {
          const gov = GOVERNANCE_MODELS.find((m) => m.id === g.governance);
          const memberAgents = g.members.map((mid) => agents.find((a) => a.id === mid)).filter(Boolean) as Agent[];
          const isSelected = selectedGroup === g.id;
          const isChecked = bulk.has(g.id);
          return (
            <div key={g.id} onClick={() => setSelectedGroup(isSelected ? null : g.id)} style={{ background: isChecked ? "rgba(239,68,68,0.06)" : isSelected ? g.color + "08" : "rgba(255,255,255,0.02)", border: `1px solid ${isChecked ? "rgba(239,68,68,0.25)" : isSelected ? g.color + "35" : "rgba(255,255,255,0.05)"}`, borderRadius: 10, padding: 18, cursor: "pointer", transition: "all 0.2s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <BulkCheckbox checked={isChecked} onChange={() => bulk.toggle(g.id)} color={g.color} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, fontFamily: "'Space Grotesk', sans-serif", color: g.color, display: "flex", alignItems: "center", gap: 6 }}><Hexagon size={14} /> {g.name}</div>
                    <div style={{ fontSize: 10, color: "#71717a", marginTop: 2 }}>{gov?.icon} {gov?.label}</div>
                  </div>
                </div>
                <span style={{ fontSize: 10, color: "#52525b", background: "rgba(255,255,255,0.04)", padding: "3px 8px", borderRadius: 4 }}>{memberAgents.length} members</span>
              </div>
              <div style={{ marginTop: 12, fontSize: 10 }}><div style={{ color: "#52525b", marginBottom: 4, letterSpacing: "0.05em" }}>GROUP DID</div><div style={{ color: "#a1a1aa", wordBreak: "break-all" }}>{g.did}</div></div>
              {g.governance === "threshold" && <div style={{ marginTop: 10, fontSize: 10, color: "#71717a" }}>Threshold: <span style={{ color: g.color }}>{g.threshold}</span> of {memberAgents.length}</div>}
              <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {memberAgents.map((a) => {
                  const role = ROLES.find((r) => r.id === a.role)!;
                  return (
                    <span key={a.id} style={{ fontSize: 10, padding: "3px 10px", borderRadius: 10, background: role.color + "12", color: role.color, border: `1px solid ${role.color}25`, display: "flex", alignItems: "center", gap: 4 }}>
                      {role.icon} {a.name}{a.prompt && <span style={{ fontSize: 8, opacity: 0.6 }}><MessageSquare size={6} /></span>}
                    </span>
                  );
                })}
              </div>
              {isSelected && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${g.color}15` }}>
                  <SectionTitle text="Strategic Keystones" />
                  <div style={{ marginBottom: 12 }}>
                    {g.keystones && g.keystones.length > 0 ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                        {g.keystones.map((k, idx) => (
                          <div key={k.id} style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 6, padding: "4px 8px", display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 10, color: "#fbbf24", fontWeight: 600 }}>{k.label}</span>
                            <span style={{ fontSize: 9, color: "rgba(251,191,36,0.7)" }}>{k.weight}%</span>
                            <button onClick={(e) => {
                              e.stopPropagation();
                              const newKeys = g.keystones?.filter(nk => nk.id !== k.id) || [];
                              updateGroup(g.id, { keystones: newKeys });
                            }} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#fbbf24", opacity: 0.6 }}>×</button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 10, color: "#52525b", fontStyle: "italic", marginBottom: 8 }}>No active keystones.</div>
                    )}

                    {/* Add Keystone Inline Form */}
                    <div onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        placeholder="New Concept..."
                        id={`new-key-${g.id}`}
                        style={{ ...inputStyle, padding: "4px 8px", fontSize: 10, height: 24, width: 100 }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const input = e.currentTarget;
                            const val = input.value.trim();
                            if (val) {
                              const newKey: Keystone = {
                                id: `k-${Date.now()}`,
                                label: val,
                                description: "",
                                weight: 50,
                                tags: [],
                                createdAt: Date.now()
                              };
                              updateGroup(g.id, { keystones: [...(g.keystones || []), newKey] });
                              input.value = "";
                            }
                          }
                        }}
                      />
                      <button onClick={(e) => {
                        e.stopPropagation();
                        const input = document.getElementById(`new-key-${g.id}`) as HTMLInputElement;
                        if (input && input.value.trim()) {
                          const newKey: Keystone = {
                            id: `k-${Date.now()}`,
                            label: input.value.trim(),
                            description: "",
                            weight: 50,
                            tags: [],
                            createdAt: Date.now()
                          };
                          updateGroup(g.id, { keystones: [...(g.keystones || []), newKey] });
                          input.value = "";
                        }
                      }} style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 4, height: 24, padding: "0 8px", fontSize: 10, cursor: "pointer" }}>+</button>
                    </div>
                  </div>

                  <SectionTitle text="Member Capabilities" />
                  {memberAgents.map((a) => (
                    <div key={a.id} style={{ padding: "8px 10px", marginBottom: 6, borderRadius: 6, background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.04)" }}>
                      <div style={{ fontSize: 10, fontWeight: 500, marginBottom: 3 }}>{a.name}</div>
                      <div style={{ fontSize: 9, color: a.prompt ? "#a1a1aa" : "#3f3f46", lineHeight: 1.5 }}>{a.prompt || "No prompt defined"}</div>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button onClick={(e) => { e.stopPropagation(); setBroadcastGroup(g.id); setView("messages"); }} style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)", color: "#fbbf24", padding: "6px 12px", borderRadius: 4, fontFamily: "inherit", fontSize: 10, cursor: "pointer" }}>Broadcast</button>
                    <button onClick={(e) => { e.stopPropagation(); removeGroup(g.id); }} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", padding: "6px 12px", borderRadius: 4, fontFamily: "inherit", fontSize: 10, cursor: "pointer" }}>Dissolve</button>
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
