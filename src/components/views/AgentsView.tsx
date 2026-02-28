import type { Agent, Channel, Group, Message, NewAgentForm, Network, ViewId, NavContext } from "../../types";
import { ROLES, PROMPT_TEMPLATES } from "../../constants";
import { inputStyle, SectionTitle, PillButton, BulkCheckbox, BulkActionBar } from "../shared/ui";
import { useState, useCallback } from "react";
import { Bot, Hexagon, X, Globe, Download, Sparkles, ExternalLink, MessageSquare, GitBranch, Users, Zap } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import { CopyableId } from "../shared/CopyableId";
import { AgentPortrait } from "../shared/AgentPortrait";
import { AgentTradingCard } from "../shared/AgentTradingCard";
import { useBulkSelect } from "../../hooks/useBulkSelect";
import { useDeleteConfirm } from "../../hooks/useDeleteConfirm";
import { DeleteConfirmInline } from "../shared/DeleteConfirmInline";
import { validateAieos, downloadAgentAieos } from "../../utils/aieos";
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
  navigateTo: (view: ViewId, ctx: NavContext) => void;
}

export function AgentsView({
  agents, channels, groups, messages, ecosystems,
  showCreate, setShowCreate, newAgent, setNewAgent,
  selectedAgent, setSelectedAgent, editingPrompt, setEditingPrompt,
  editPromptText, setEditPromptText,
  createAgent, updateAgentPrompt, removeAgent, removeAgents, navigateTo,
}: AgentsViewProps) {
  const bulk = useBulkSelect();
  const [tradingCardAgent, setTradingCardAgent] = useState<Agent | null>(null);
  const [flippedCards, setFlippedCards] = useState<Set<string>>(new Set());
  const [animStates, setAnimStates] = useState<Record<string, "idle" | "pressing" | "flipping">>({});

  const getAnimState = (id: string) => animStates[id] || "idle";
  const isCardFlipped = (id: string) => flippedCards.has(id);

  const handleCardFlip = useCallback((agentId: string) => {
    const flipped = flippedCards.has(agentId);
    const state = animStates[agentId] || "idle";

    if (flipped) {
      // Flip back
      setAnimStates(prev => ({ ...prev, [agentId]: "flipping" }));
      setFlippedCards(prev => { const s = new Set(prev); s.delete(agentId); return s; });
      setTimeout(() => setAnimStates(prev => ({ ...prev, [agentId]: "idle" })), 600);
      return;
    }
    if (state !== "idle") return;
    setAnimStates(prev => ({ ...prev, [agentId]: "pressing" }));
    setTimeout(() => {
      setFlippedCards(prev => new Set(prev).add(agentId));
      setAnimStates(prev => ({ ...prev, [agentId]: "flipping" }));
      setTimeout(() => setAnimStates(prev => ({ ...prev, [agentId]: "idle" })), 600);
    }, 200);
  }, [flippedCards, animStates]);

  const getTransform = (id: string) => {
    if (isCardFlipped(id)) return "rotateY(180deg)";
    if (getAnimState(id) === "pressing") return "scale(0.92) rotateY(-15deg)";
    return "scale(1) rotateY(0deg)";
  };

  const getTransitionClass = (id: string) => {
    const s = getAnimState(id);
    if (s === "pressing") return "agent-flip__inner--pressing";
    if (s === "flipping" || isCardFlipped(id)) return "agent-flip__inner--flipping";
    return "";
  };

  const getNetworkName = (networkId?: string) => {
    if (!networkId) return null;
    const net = ecosystems.find(n => n.id === networkId);
    return net ? { name: net.name, color: net.color } : null;
  };

  const del = useDeleteConfirm();

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
          const isChecked = bulk.has(a.id);
          const isEditing = editingPrompt === a.id;
          const v = validateAieos(a.aieos);
          const pct = Math.round(v.coverage * 100);
          const aieosColor = pct > 60 ? "#00e5a0" : pct > 30 ? "#fbbf24" : "#ef4444";
          const flipped = isCardFlipped(a.id);
          const elevated = flipped || getAnimState(a.id) !== "idle";
          const personality = a.aieos?.psychology?.traits;
          const topSkills = (a.aieos?.capabilities?.skills || []).slice(0, 3);
          const coreDrive = a.aieos?.motivations?.core_drive;

          return (
            <div
              key={a.id}
              className={`agent-flip ${elevated ? "agent-flip--elevated" : ""} ${isChecked ? "agent-flip--checked" : ""}`}
              onClick={() => { if (!isEditing) handleCardFlip(a.id); }}
            >
              <div
                className={`agent-flip__inner ${getTransitionClass(a.id)}`}
                style={{ transform: getTransform(a.id) }}
              >
                {/* ══════ FRONT FACE ══════ */}
                <div className="agent-flip__front" style={{ borderColor: `${role.color}30` }}>
                  {/* Bulk select checkbox (top-left) */}
                  <div className="agent-flip__bulk" onClick={(e) => e.stopPropagation()}>
                    <BulkCheckbox checked={isChecked} onChange={() => bulk.toggle(a.id)} color={role.color} />
                  </div>

                  {/* Portrait & Identity */}
                  <div className="agent-flip__identity">
                    <div className="agent-flip__portrait" onClick={(e) => { e.stopPropagation(); setTradingCardAgent(a); }}>
                      <AgentPortrait agent={a} size={64} />
                    </div>
                    <div className="agent-flip__name">{a.name}</div>
                    <div className="agent-flip__role" style={{ color: role.color }}>
                      {role.icon} {role.label}
                    </div>
                  </div>

                  {/* Badges row */}
                  <div className="agent-flip__badges">
                    {network && (
                      <span className="agent-flip__badge" style={{ color: network.color, background: `${network.color}15`, borderColor: `${network.color}30` }}>
                        <Globe size={9} /> {network.name}
                      </span>
                    )}
                    <span className="agent-flip__badge agent-flip__badge--aieos" style={{ color: aieosColor, borderColor: `${aieosColor}40` }}>
                      <Sparkles size={9} /> {pct}%
                    </span>
                    <div className="agent-flip__status-dot" />
                  </div>

                  {/* Stats row */}
                  <div className="agent-flip__stats">
                    <div className="agent-flip__stat">
                      <GitBranch size={10} className="agent-flip__stat-icon" />
                      <span>{agentChannels.length}</span>
                    </div>
                    <div className="agent-flip__stat">
                      <Users size={10} className="agent-flip__stat-icon" />
                      <span>{agentGroups.length}</span>
                    </div>
                    <div className="agent-flip__stat">
                      <MessageSquare size={10} className="agent-flip__stat-icon" />
                      <span>{agentMsgs.length}</span>
                    </div>
                  </div>
                </div>

                {/* ══════ BACK FACE ══════ */}
                <div className="agent-flip__back" style={{ borderColor: `${role.color}50`, boxShadow: `0 0 15px ${role.color}10` }}>
                  {/* Header */}
                  <div className="agent-flip__back-header">
                    <span className="agent-flip__back-name">{a.name}</span>
                    <span className="agent-flip__back-dot" style={{ color: role.color }}>●</span>
                  </div>

                  {/* Scrollable content */}
                  <div className="agent-flip__back-content">
                    {/* Prompt */}
                    {a.prompt && !isEditing && (
                      <div className="agent-flip__prompt">
                        <div className="agent-flip__section-label">PROMPT</div>
                        <div className="agent-flip__prompt-text">{a.prompt}</div>
                      </div>
                    )}

                    {/* Inline prompt edit */}
                    {isEditing && (
                      <div className="agent-flip__prompt-edit" onClick={(e) => e.stopPropagation()}>
                        <textarea
                          value={editPromptText}
                          onChange={(e) => setEditPromptText(e.target.value)}
                          rows={4}
                          className="input input-accent agent-flip__prompt-textarea"
                          autoFocus
                        />
                        <div className="agent-flip__prompt-edit-actions">
                          <button onClick={() => updateAgentPrompt(a.id)} className="btn-accent btn-sm">Save</button>
                          <button onClick={() => setEditingPrompt(null)} className="btn-ghost btn-sm">Cancel</button>
                        </div>
                      </div>
                    )}

                    {/* DID */}
                    <div className="agent-flip__did" onClick={(e) => e.stopPropagation()}>
                      <div className="agent-flip__section-label">DID</div>
                      <CopyableId value={a.did} label="DID" truncate={32} />
                    </div>

                    {/* Personality type */}
                    {personality?.mbti && (
                      <div className="agent-flip__personality">
                        <Zap size={10} className="agent-flip__personality-icon" />
                        <span>{personality.mbti}</span>
                        {personality.temperament && <span className="agent-flip__temperament">· {personality.temperament}</span>}
                      </div>
                    )}

                    {/* Top skills */}
                    {topSkills.length > 0 && (
                      <div className="agent-flip__skills">
                        <div className="agent-flip__section-label">SKILLS</div>
                        <div className="agent-flip__skills-list">
                          {topSkills.map((sk, i) => (
                            <span key={i} className="agent-flip__skill" style={{ borderColor: `${role.color}30`, color: role.color }}>
                              {sk.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Groups */}
                    {agentGroups.length > 0 && (
                      <div className="agent-flip__groups">
                        <div className="agent-flip__section-label">GROUPS</div>
                        <div className="agent-flip__groups-list">
                          {agentGroups.map((g) => (
                            <span key={g.id} className="agent-flip__group" style={{ background: `${g.color}15`, color: g.color, borderColor: `${g.color}30` }}>
                              <Hexagon size={8} /> {g.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Core drive */}
                    {coreDrive && (
                      <div className="agent-flip__drive">
                        <em>"{coreDrive}"</em>
                      </div>
                    )}
                  </div>

                  {/* Footer actions */}
                  <div className="agent-flip__back-footer">
                    <div className="agent-flip__actions">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingPrompt(a.id); setEditPromptText(a.prompt || ""); }}
                        className="btn-accent btn-sm"
                      >
                        {a.prompt ? "Edit Prompt" : "Add Prompt"}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); downloadAgentAieos(a); }}
                        className="agent-flip__export-btn"
                        title="Export .aieos.json"
                      >
                        <Download size={10} /> Export
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); del.requestDelete(a.id); }}
                        className="btn-danger btn-sm"
                      >
                        Revoke
                      </button>
                    </div>
                    {del.isPending(a.id) ? (
                      <DeleteConfirmInline
                        entityName="Agent"
                        entityLabel={a.name}
                        onConfirm={() => del.confirm(() => removeAgent(a.id))}
                        onCancel={del.cancel}
                        compact
                      />
                    ) : a.networkId ? (
                      <button
                        className="agent-flip__detail-link"
                        onClick={(e) => { e.stopPropagation(); navigateTo("networks", { networkId: a.networkId!, ...(agentGroups.length > 0 ? { groupId: agentGroups[0].id } : {}), agentId: a.id }); }}
                        title="Go to agent detail page"
                      >
                        <ExternalLink size={10} /> View Detail
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
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

      {/* Trading card modal */}
      <AgentTradingCard
        agent={tradingCardAgent!}
        isOpen={!!tradingCardAgent}
        onClose={() => setTradingCardAgent(null)}
      />
    </div>
  );
}
