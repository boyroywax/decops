import type { Agent, Channel, Group, Message, NewAgentForm } from "../../types";
import { ROLES, PROMPT_TEMPLATES } from "../../constants";
import { inputStyle, SectionTitle, PillButton, BulkCheckbox, BulkActionBar } from "../shared/ui";
import { useState } from "react";
import { Bot, Hexagon, X } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import { useBulkSelect } from "../../hooks/useBulkSelect";

interface AgentsViewProps {
  agents: Agent[];
  channels: Channel[];
  groups: Group[];
  messages: Message[];
  showCreate: boolean;
  setShowCreate: (v: boolean) => void;
  newAgent: NewAgentForm;
  setNewAgent: (v: NewAgentForm) => void;
  selectedAgent: string | null;
  setSelectedAgent: (v: string | null) => void;
  editingPrompt: string | null;
  setEditingPrompt: (v: string | null) => void;
  editPromptText: string;
  setEditPromptText: (v: string) => void;
  createAgent: () => void;
  updateAgentPrompt: (id: string) => void;
  removeAgent: (id: string) => void;
  removeAgents: (ids: Set<string>) => void;
}

export function AgentsView({
  agents, channels, groups, messages,
  showCreate, setShowCreate, newAgent, setNewAgent,
  selectedAgent, setSelectedAgent, editingPrompt, setEditingPrompt,
  editPromptText, setEditPromptText,
  createAgent, updateAgentPrompt, removeAgent, removeAgents,
}: AgentsViewProps) {
  const bulk = useBulkSelect();

  const handleBulkDelete = () => {
    removeAgents(bulk.selected);
    bulk.clearSelection();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 600, margin: 0 }}><GradientIcon icon={Bot} size={18} gradient={["#00e5a0", "#34d399"]} /> Agent Registry</h2>
          {agents.length > 0 && (
            <BulkCheckbox
              checked={bulk.isAllSelected(agents.map(a => a.id))}
              onChange={() => bulk.toggleAll(agents.map(a => a.id))}
              color="#00e5a0"
            />
          )}
        </div>
        <button onClick={() => setShowCreate(!showCreate)} style={{ background: showCreate ? "rgba(239,68,68,0.15)" : "rgba(0,229,160,0.12)", color: showCreate ? "#ef4444" : "#00e5a0", border: `1px solid ${showCreate ? "rgba(239,68,68,0.3)" : "rgba(0,229,160,0.25)"}`, padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>{showCreate ? <><X size={12} /> Cancel</> : "+ Create Agent"}</button>
      </div>

      {showCreate && (
        <div style={{ background: "rgba(0,229,160,0.04)", border: "1px solid rgba(0,229,160,0.12)", borderRadius: 10, padding: 20, marginBottom: 20 }}>
          <SectionTitle text="Identity & Role" />
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <input placeholder="Agent name" value={newAgent.name} onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })} style={{ ...inputStyle, flex: 1, minWidth: 160, border: "1px solid rgba(0,229,160,0.15)" }} />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {ROLES.map((r) => (
                <PillButton key={r.id} active={newAgent.role === r.id} activeColor={r.color} onClick={() => setNewAgent({ ...newAgent, role: r.id })}>
                  {r.icon} {r.label}
                </PillButton>
              ))}
            </div>
          </div>
          <SectionTitle text="Agent Prompt" />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {PROMPT_TEMPLATES.map((t, idx) => (
              <button key={t.label} onClick={() => setNewAgent({ ...newAgent, prompt: t.prompt, templateIdx: idx })} style={{
                background: newAgent.templateIdx === idx ? "rgba(0,229,160,0.12)" : "rgba(0,0,0,0.3)",
                border: `1px solid ${newAgent.templateIdx === idx ? "rgba(0,229,160,0.3)" : "rgba(255,255,255,0.06)"}`,
                color: newAgent.templateIdx === idx ? "#00e5a0" : "#71717a",
                padding: "5px 10px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", fontSize: 10,
              }}>{t.label}</button>
            ))}
          </div>
          <textarea placeholder="Define behavior..." value={newAgent.prompt} onChange={(e) => setNewAgent({ ...newAgent, prompt: e.target.value, templateIdx: 0 })} rows={4} style={{ ...inputStyle, border: "1px solid rgba(0,229,160,0.15)", lineHeight: 1.6 }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
            <span style={{ fontSize: 10, color: "#52525b" }}>{newAgent.prompt.length > 0 ? `${newAgent.prompt.length} chars` : "No prompt"}</span>
            <button onClick={createAgent} style={{ background: "#00e5a0", color: "#0a0a0f", border: "none", padding: "10px 20px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 500 }}>Generate Identity</button>
          </div>
        </div>
      )}

      {agents.length === 0 && !showCreate && (
        <div style={{ textAlign: "center", padding: 60, color: "#3f3f46", border: "1px dashed rgba(0,229,160,0.1)", borderRadius: 12 }}>
          <GradientIcon icon={Bot} size={32} gradient={["#00e5a0", "#34d399"]} />
          <div style={{ fontSize: 12 }}>No agents yet. Use the Architect or create manually.</div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
        {agents.map((a) => {
          const role = ROLES.find((r) => r.id === a.role)!;
          const agentChannels = channels.filter((c) => c.from === a.id || c.to === a.id);
          const agentGroups = groups.filter((g) => g.members.includes(a.id));
          const agentMsgs = messages.filter((m) => m.fromId === a.id || m.toId === a.id);
          const isSelected = selectedAgent === a.id;
          const isEditing = editingPrompt === a.id;
          const isChecked = bulk.has(a.id);
          return (
            <div key={a.id} onClick={() => { if (!isEditing) setSelectedAgent(isSelected ? null : a.id); }} style={{ background: isChecked ? "rgba(239,68,68,0.06)" : isSelected ? "rgba(0,229,160,0.06)" : "rgba(255,255,255,0.02)", border: `1px solid ${isChecked ? "rgba(239,68,68,0.25)" : isSelected ? role.color + "40" : "rgba(255,255,255,0.05)"}`, borderRadius: 10, padding: 16, cursor: isEditing ? "default" : "pointer", transition: "all 0.2s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <BulkCheckbox checked={isChecked} onChange={() => bulk.toggle(a.id)} color={role.color} />
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: role.color + "15", border: `1px solid ${role.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{role.icon}</div>
                  <div><div style={{ fontWeight: 500, fontSize: 13 }}>{a.name}</div><div style={{ fontSize: 10, color: role.color }}>{role.label}</div></div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {a.prompt && <span style={{ fontSize: 9, color: "#52525b", background: "rgba(0,229,160,0.08)", padding: "2px 6px", borderRadius: 3 }}>PROMPTED</span>}
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#00e5a0", boxShadow: "0 0 8px #00e5a0" }} />
                </div>
              </div>
              {a.prompt && !isEditing && <div style={{ marginTop: 12, padding: "8px 10px", borderRadius: 6, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(0,229,160,0.08)", fontSize: 10, color: "#a1a1aa", lineHeight: 1.5, maxHeight: isSelected ? "none" : 42, overflow: "hidden" }}><span style={{ color: "#52525b", fontSize: 9, letterSpacing: "0.05em" }}>PROMPT </span>{a.prompt}</div>}
              {isEditing && (
                <div style={{ marginTop: 12 }} onClick={(e) => e.stopPropagation()}>
                  <textarea value={editPromptText} onChange={(e) => setEditPromptText(e.target.value)} rows={5} style={{ ...inputStyle, border: "1px solid rgba(0,229,160,0.2)", lineHeight: 1.5 }} autoFocus />
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <button onClick={() => updateAgentPrompt(a.id)} style={{ background: "rgba(0,229,160,0.15)", border: "1px solid rgba(0,229,160,0.3)", color: "#00e5a0", padding: "6px 14px", borderRadius: 4, fontFamily: "inherit", fontSize: 10, cursor: "pointer" }}>Save</button>
                    <button onClick={() => setEditingPrompt(null)} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.08)", color: "#71717a", padding: "6px 14px", borderRadius: 4, fontFamily: "inherit", fontSize: 10, cursor: "pointer" }}>Cancel</button>
                  </div>
                </div>
              )}
              <div style={{ marginTop: 12, fontSize: 10 }}><div style={{ color: "#52525b", marginBottom: 4, letterSpacing: "0.05em" }}>DID</div><div style={{ color: "#a1a1aa", fontFamily: "'DM Mono', monospace", wordBreak: "break-all" }}>{a.did}</div></div>
              <div style={{ marginTop: 10, display: "flex", gap: 12, fontSize: 10, flexWrap: "wrap" }}>
                <div><span style={{ color: "#52525b" }}>CH </span><span style={{ color: "#71717a" }}>{agentChannels.length}</span></div>
                <div><span style={{ color: "#52525b" }}>GROUPS </span><span style={{ color: "#71717a" }}>{agentGroups.length}</span></div>
                <div><span style={{ color: "#52525b" }}>MSGS </span><span style={{ color: "#71717a" }}>{agentMsgs.length}</span></div>
              </div>
              {agentGroups.length > 0 && <div style={{ marginTop: 8, display: "flex", gap: 4, flexWrap: "wrap" }}>{agentGroups.map((g) => (<span key={g.id} style={{ fontSize: 9, padding: "2px 8px", borderRadius: 10, background: g.color + "15", color: g.color, border: `1px solid ${g.color}30`, display: "inline-flex", alignItems: "center", gap: 3 }}><Hexagon size={8} /> {g.name}</span>))}</div>}
              {isSelected && !isEditing && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 8 }}>
                  <button onClick={(e) => { e.stopPropagation(); setEditingPrompt(a.id); setEditPromptText(a.prompt || ""); }} style={{ background: "rgba(0,229,160,0.1)", border: "1px solid rgba(0,229,160,0.2)", color: "#00e5a0", padding: "6px 12px", borderRadius: 4, fontFamily: "inherit", fontSize: 10, cursor: "pointer" }}>{a.prompt ? "Edit Prompt" : "Add Prompt"}</button>
                  <button onClick={(e) => { e.stopPropagation(); removeAgent(a.id); }} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", padding: "6px 12px", borderRadius: 4, fontFamily: "inherit", fontSize: 10, cursor: "pointer" }}>Revoke</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <BulkActionBar
        count={bulk.count}
        total={agents.length}
        onSelectAll={() => bulk.selectAll(agents.map(a => a.id))}
        onClear={bulk.clearSelection}
        onDelete={handleBulkDelete}
        allSelected={bulk.isAllSelected(agents.map(a => a.id))}
        entityName="agent"
      />
    </div>
  );
}
