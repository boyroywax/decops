import type { Agent, Channel, Group, Message, NewAgentForm, Network } from "../../types";
import { ROLES, PROMPT_TEMPLATES } from "../../constants";
import { inputStyle, SectionTitle, PillButton, BulkCheckbox, BulkActionBar } from "../shared/ui";
import { useState } from "react";
import { Bot, Hexagon, X, Globe } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import { useBulkSelect } from "../../hooks/useBulkSelect";
import "../../styles/components/agents.css";

interface AgentsViewProps {
  agents: Agent[];
  channels: Channel[];
  groups: Group[];
  messages: Message[];
  ecosystems: Network[];
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
  agents, channels, groups, messages, ecosystems,
  showCreate, setShowCreate, newAgent, setNewAgent,
  selectedAgent, setSelectedAgent, editingPrompt, setEditingPrompt,
  editPromptText, setEditPromptText,
  createAgent, updateAgentPrompt, removeAgent, removeAgents,
}: AgentsViewProps) {
  const bulk = useBulkSelect();

  const getNetworkName = (networkId?: string) => {
    if (!networkId) return null;
    const net = ecosystems.find(n => n.id === networkId);
    return net ? { name: net.name, color: net.color } : null;
  };

  const handleBulkDelete = () => {
    removeAgents(bulk.selected);
    bulk.clearSelection();
  };

  return (
    <div>
      <div className="agents-header">
        <div className="agents-header-left">
          <h2 className="agents-title"><GradientIcon icon={Bot} size={18} gradient={["#00e5a0", "#34d399"]} /> Agent Registry</h2>
          {agents.length > 0 && (
            <BulkCheckbox
              checked={bulk.isAllSelected(agents.map(a => a.id))}
              onChange={() => bulk.toggleAll(agents.map(a => a.id))}
              color="#00e5a0"
            />
          )}
        </div>
        <button 
          onClick={() => setShowCreate(!showCreate)} 
          className={`create-agent-toggle ${showCreate ? 'create-agent-toggle--cancel' : ''}`}
        >
          {showCreate ? <><X size={12} /> Cancel</> : "+ Create Agent"}
        </button>
      </div>

      {showCreate && (
        <div className="create-agent-form">
          {ecosystems.length === 0 ? (
            <div className="create-agent-empty">
              <Globe size={24} className="create-agent-empty-icon" />
              <div className="create-agent-empty-title">No networks available</div>
              <div className="create-agent-empty-subtitle">Create a network first before adding agents.</div>
            </div>
          ) : (
            <>
              <SectionTitle text="Network Assignment" />
              <div className="create-agent-field">
                <select 
                  value={newAgent.networkId} 
                  onChange={(e) => setNewAgent({ ...newAgent, networkId: e.target.value })} 
                  className="input input-accent"
                >
                  <option value="">Select network...</option>
                  {ecosystems.map((n) => (
                    <option key={n.id} value={n.id}>{n.name}</option>
                  ))}
                </select>
              </div>
              <SectionTitle text="Identity & Role" />
              <div className="create-agent-identity-row">
                <input 
                  placeholder="Agent name" 
                  value={newAgent.name} 
                  onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })} 
                  className="input input-accent create-agent-name-input" 
                />
                <div className="role-selector">
                  {ROLES.map((r) => (
                    <PillButton key={r.id} active={newAgent.role === r.id} activeColor={r.color} onClick={() => setNewAgent({ ...newAgent, role: r.id })}>
                      {r.icon} {r.label}
                    </PillButton>
                  ))}
                </div>
              </div>
              <SectionTitle text="Agent Prompt" />
              <div className="template-buttons">
                {PROMPT_TEMPLATES.map((t, idx) => (
                  <button 
                    key={t.label} 
                    onClick={() => setNewAgent({ ...newAgent, prompt: t.prompt, templateIdx: idx })} 
                    className={`template-btn ${newAgent.templateIdx === idx ? 'template-btn--active' : ''}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <textarea 
                placeholder="Define behavior..." 
                value={newAgent.prompt} 
                onChange={(e) => setNewAgent({ ...newAgent, prompt: e.target.value, templateIdx: 0 })} 
                rows={4} 
                className="input input-accent create-agent-textarea" 
              />
              <div className="create-agent-footer">
                <span className="create-agent-char-count">
                  {newAgent.prompt.length > 0 ? `${newAgent.prompt.length} chars` : "No prompt"}
                </span>
                <button 
                  onClick={createAgent} 
                  disabled={!newAgent.networkId || !newAgent.name.trim()}
                  className={`btn-primary create-agent-submit ${!newAgent.networkId || !newAgent.name.trim() ? 'btn-disabled' : ''}`}
                >
                  Generate Identity
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {agents.length === 0 && !showCreate && (
        <div className="agents-empty-state">
          <GradientIcon icon={Bot} size={32} gradient={["#00e5a0", "#34d399"]} />
          <div className="agents-empty-text">No agents yet. Use the Architect or create manually.</div>
        </div>
      )}

      <div className="agent-cards-grid">
        {agents.map((a) => {
          const role = ROLES.find((r) => r.id === a.role)!;
          const agentChannels = channels.filter((c) => c.from === a.id || c.to === a.id);
          const agentGroups = groups.filter((g) => g.members.includes(a.id));
          const agentMsgs = messages.filter((m) => m.fromId === a.id || m.toId === a.id);
          const network = getNetworkName(a.networkId);
          const isSelected = selectedAgent === a.id;
          const isEditing = editingPrompt === a.id;
          const isChecked = bulk.has(a.id);
          const cardClasses = `agent-card ${isSelected ? 'agent-card--selected' : ''} ${isChecked ? 'agent-card--checked' : ''} ${isEditing ? 'agent-card--editing' : ''}`;
          return (
            <div 
              key={a.id} 
              onClick={() => { if (!isEditing) setSelectedAgent(isSelected ? null : a.id); }} 
              className={cardClasses}
              style={isSelected && !isChecked ? { borderColor: role.color + '40' } : undefined}
            >
              <div className="agent-card-header">
                <div className="agent-card-identity">
                  <BulkCheckbox checked={isChecked} onChange={() => bulk.toggle(a.id)} color={role.color} />
                  <div className="agent-card-icon" style={{ background: role.color + '15', borderColor: role.color + '30' }}>{role.icon}</div>
                  <div className="agent-card-info">
                    <div className="agent-card-name">{a.name}</div>
                    <div className="agent-card-role" style={{ color: role.color }}>{role.label}</div>
                  </div>
                </div>
                <div className="agent-card-badges">
                  {network && (
                    <span className="agent-card-network-badge" style={{ color: network.color, background: network.color + '15' }}>
                      <Globe size={9} /> {network.name}
                    </span>
                  )}
                  {a.prompt && <span className="agent-card-prompted-badge">PROMPTED</span>}
                  <div className="agent-card-status-dot" />
                </div>
              </div>
              {a.prompt && !isEditing && (
                <div className={`agent-prompt-preview ${isSelected ? 'agent-prompt-preview--expanded' : ''}`}>
                  <span className="agent-prompt-label">PROMPT </span>{a.prompt}
                </div>
              )}
              {isEditing && (
                <div className="prompt-edit-section" onClick={(e) => e.stopPropagation()}>
                  <textarea 
                    value={editPromptText} 
                    onChange={(e) => setEditPromptText(e.target.value)} 
                    rows={5} 
                    className="input input-accent prompt-edit-textarea" 
                    autoFocus 
                  />
                  <div className="prompt-edit-actions">
                    <button onClick={() => updateAgentPrompt(a.id)} className="btn-accent btn-sm">Save</button>
                    <button onClick={() => setEditingPrompt(null)} className="btn-ghost btn-sm">Cancel</button>
                  </div>
                </div>
              )}
              <div className="agent-did-section">
                <div className="agent-did-label">DID</div>
                <div className="agent-did-value">{a.did}</div>
              </div>
              <div className="agent-stats">
                <div><span className="agent-stat-label">CH </span><span className="agent-stat-value">{agentChannels.length}</span></div>
                <div><span className="agent-stat-label">GROUPS </span><span className="agent-stat-value">{agentGroups.length}</span></div>
                <div><span className="agent-stat-label">MSGS </span><span className="agent-stat-value">{agentMsgs.length}</span></div>
              </div>
              {agentGroups.length > 0 && (
                <div className="agent-groups-list">
                  {agentGroups.map((g) => (
                    <span key={g.id} className="agent-group-badge" style={{ background: g.color + '15', color: g.color, borderColor: g.color + '30' }}>
                      <Hexagon size={8} /> {g.name}
                    </span>
                  ))}
                </div>
              )}
              {isSelected && !isEditing && (
                <div className="agent-card-actions">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setEditingPrompt(a.id); setEditPromptText(a.prompt || ""); }} 
                    className="btn-accent btn-sm"
                  >
                    {a.prompt ? "Edit Prompt" : "Add Prompt"}
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); removeAgent(a.id); }} 
                    className="btn-danger btn-sm"
                  >
                    Revoke
                  </button>
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
