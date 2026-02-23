import { useState, useRef } from "react";
import type { Agent, Channel, Group, Message, Network, ViewId, NavContext, AieosEntity } from "../../types";
import { ROLES, CHANNEL_TYPES } from "../../constants";
import {
  Users, Calendar, Trash2, Radio,
  MessageSquare, Key, FileText, Edit3, Check, X,
  Download, Upload, ChevronDown, ChevronUp,
  Brain, Sparkles, Compass, BookOpen, Heart, Mic,
  Shield, Target,
} from "lucide-react";
import { AgentChat } from "../chat/AgentChat";
import { CopyableId } from "../shared/CopyableId";
import { AgentPortrait } from "../shared/AgentPortrait";
import { AgentTradingCard } from "../shared/AgentTradingCard";
import { downloadAgentAieos, aieosToAgent, validateAieos } from "../../utils/aieos";
import { AieosEditor } from "./AieosEditor";
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
  updateAgent?: (id: string, patch: Partial<Agent>) => void;
  importAgentFromAieos?: (json: unknown) => { success: boolean; message: string };
  removeAgent: (id: string) => void;
}

// ── Neural matrix bar component ──

function NeuralBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="aieos-neural__bar">
      <div className="aieos-neural__bar-label">{label}</div>
      <div className="aieos-neural__bar-track">
        <div
          className="aieos-neural__bar-fill"
          style={{ width: `${Math.round(value * 100)}%`, background: color }}
        />
      </div>
      <div className="aieos-neural__bar-value">{(value * 100).toFixed(0)}%</div>
    </div>
  );
}

// ── AIEOS coverage badge ──

function CoverageBadge({ coverage }: { coverage: number }) {
  const pct = Math.round(coverage * 100);
  const color = pct > 60 ? "#00e5a0" : pct > 30 ? "#fbbf24" : "#ef4444";
  return (
    <span className="aieos-coverage" style={{ color, borderColor: `${color}40` }}>
      {pct}% populated
    </span>
  );
}

export function AgentDetailView({
  agentId, networkId, groupId,
  agents, channels, groups, messages,
  ecosystems, navigateTo,
  updateAgentPrompt, updateAgent, importAgentFromAieos, removeAgent,
}: AgentDetailViewProps) {
  const agent = agents.find(a => a.id === agentId);
  const network = ecosystems.find(n => n.id === networkId);

  const [editingPrompt, setEditingPrompt] = useState(false);
  const [promptText, setPromptText] = useState(agent?.prompt || "");
  const [aieosOpen, setAieosOpen] = useState(false);
  const [aieosEditing, setAieosEditing] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showTradingCard, setShowTradingCard] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

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

  const handleExportAieos = () => {
    downloadAgentAieos(agent);
  };

  const handleSaveAieos = (updated: AieosEntity) => {
    if (updateAgent) {
      updateAgent(agentId, { aieos: updated });
      setAieosEditing(false);
      setImportMsg({ ok: true, text: "AIEOS profile saved." });
      setTimeout(() => setImportMsg(null), 3000);
    }
  };

  const handleImportAieos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string);
        const result = aieosToAgent(json);
        if (result.success && result.agent?.aieos && updateAgent) {
          updateAgent(agentId, { aieos: result.agent.aieos });
          setImportMsg({ ok: true, text: result.message });
        } else {
          setImportMsg({ ok: false, text: result.message });
        }
      } catch {
        setImportMsg({ ok: false, text: "Failed to parse JSON file." });
      }
      setTimeout(() => setImportMsg(null), 4000);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const aieosValidation = validateAieos(agent.aieos);
  const entity = agent.aieos;

  return (
    <div className="agent-detail">
      {/* Header */}
      <div className="agent-detail__header">
        <div>
          <div className="agent-detail__title-row">
            <div className="agent-detail__portrait" onClick={() => setShowTradingCard(true)} style={{ cursor: "pointer" }}>
              <AgentPortrait agent={agent} size={72} />
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
        <div className="agent-detail__identity-value"><CopyableId value={agent.did} label="DID" /></div>
        <div className="agent-detail__identity-label">Public Key</div>
        <div className="agent-detail__identity-value"><CopyableId value={agent.keys.pub} label="Key" /></div>
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
                  onClick={() => {
                    const peerGroup = groups.find(g => g.networkId === networkId && g.members.includes(peer.id));
                    navigateTo("networks", {
                      networkId,
                      ...(peerGroup ? { groupId: peerGroup.id } : {}),
                      agentId: peer.id,
                    });
                  }}
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

      {/* Direct Chat */}
      <div className="agent-detail__section">
        <div className="agent-detail__section-title">
          <MessageSquare size={11} style={{ display: "inline", verticalAlign: "middle" }} /> Direct Chat
        </div>
        <AgentChat agent={agent} />
      </div>

      {/* ── AIEOS Entity Specification ── */}
      <div className="agent-detail__section aieos-section">
        <button
          className="aieos-section__toggle"
          onClick={() => setAieosOpen(!aieosOpen)}
        >
          <div className="aieos-section__toggle-left">
            <Sparkles size={12} color="#fbbf24" />
            <span className="aieos-section__title">AIEOS Entity Spec</span>
            <span className="aieos-section__version">v1.1.0</span>
            {entity && <CoverageBadge coverage={aieosValidation.coverage} />}
          </div>
          {aieosOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {aieosOpen && (
          <div className="aieos-panel">
            {/* Export / Import / Edit bar */}
            <div className="aieos-panel__actions">
              <button className="aieos-panel__btn" onClick={handleExportAieos}>
                <Download size={12} /> Export .aieos.json
              </button>
              <button className="aieos-panel__btn" onClick={() => importRef.current?.click()}>
                <Upload size={12} /> Import AIEOS
              </button>
              {entity && updateAgent && !aieosEditing && (
                <button className="aieos-panel__btn" onClick={() => setAieosEditing(true)}>
                  <Edit3 size={12} /> Edit Profile
                </button>
              )}
              <input
                ref={importRef}
                type="file"
                accept=".json,.aieos.json"
                style={{ display: "none" }}
                onChange={handleImportAieos}
              />
              {importMsg && (
                <span className={`aieos-panel__msg ${importMsg.ok ? "aieos-panel__msg--ok" : "aieos-panel__msg--err"}`}>
                  {importMsg.text}
                </span>
              )}
            </div>

            {!entity ? (
              <div className="aieos-panel__empty">
                No AIEOS entity attached. Export to create one, or import from another platform.
              </div>
            ) : aieosEditing ? (
              <AieosEditor
                entity={entity}
                onSave={handleSaveAieos}
                onCancel={() => setAieosEditing(false)}
              />
            ) : (
              <>
                {/* Metadata */}
                <div className="aieos-block">
                  <div className="aieos-block__header">
                    <Key size={11} /> Metadata
                  </div>
                  <div className="aieos-kv-grid">
                    <span className="aieos-kv__label">Instance ID</span>
                    <span className="aieos-kv__value mono">{entity.metadata.instance_id}</span>
                    <span className="aieos-kv__label">Generator</span>
                    <span className="aieos-kv__value">{entity.metadata.generator}</span>
                    <span className="aieos-kv__label">Created</span>
                    <span className="aieos-kv__value">{entity.metadata.created_at}</span>
                    <span className="aieos-kv__label">Updated</span>
                    <span className="aieos-kv__value">{entity.metadata.last_updated}</span>
                  </div>
                </div>

                {/* Capabilities */}
                {entity.capabilities?.skills && entity.capabilities.skills.length > 0 && (
                  <div className="aieos-block">
                    <div className="aieos-block__header">
                      <Target size={11} /> Capabilities ({entity.capabilities.skills.length} skills)
                    </div>
                    <div className="aieos-skills">
                      {entity.capabilities.skills.map((s, i) => (
                        <div key={i} className="aieos-skill">
                          <span className="aieos-skill__name">{s.name}</span>
                          <span className="aieos-skill__desc">{s.description}</span>
                          {s.priority && (
                            <span className="aieos-skill__priority">P{s.priority}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Identity */}
                {entity.identity && (
                  <div className="aieos-block">
                    <div className="aieos-block__header">
                      <Users size={11} /> Identity
                    </div>
                    <div className="aieos-kv-grid">
                      {entity.identity.names?.first && (
                        <><span className="aieos-kv__label">Name</span>
                        <span className="aieos-kv__value">
                          {[entity.identity.names.first, entity.identity.names.middle, entity.identity.names.last].filter(Boolean).join(" ")}
                          {entity.identity.names.nickname ? ` "${entity.identity.names.nickname}"` : ""}
                        </span></>
                      )}
                      {entity.identity.bio?.gender && (
                        <><span className="aieos-kv__label">Gender</span>
                        <span className="aieos-kv__value">{entity.identity.bio.gender}</span></>
                      )}
                      {entity.identity.bio?.birthday && (
                        <><span className="aieos-kv__label">Birthday</span>
                        <span className="aieos-kv__value">{entity.identity.bio.birthday}</span></>
                      )}
                      {entity.identity.origin?.nationality && (
                        <><span className="aieos-kv__label">Nationality</span>
                        <span className="aieos-kv__value">{entity.identity.origin.nationality}</span></>
                      )}
                      {entity.identity.origin?.birthplace?.city && (
                        <><span className="aieos-kv__label">Origin</span>
                        <span className="aieos-kv__value">
                          {entity.identity.origin.birthplace.city}{entity.identity.origin.birthplace.country ? `, ${entity.identity.origin.birthplace.country}` : ""}
                        </span></>
                      )}
                      {entity.identity.residence?.current_city && (
                        <><span className="aieos-kv__label">Residence</span>
                        <span className="aieos-kv__value">
                          {entity.identity.residence.current_city}{entity.identity.residence.current_country ? `, ${entity.identity.residence.current_country}` : ""}
                        </span></>
                      )}
                    </div>
                  </div>
                )}

                {/* Neural Matrix */}
                {entity.psychology?.neural_matrix && (
                  <div className="aieos-block">
                    <div className="aieos-block__header">
                      <Brain size={11} /> Neural Matrix
                    </div>
                    <div className="aieos-neural">
                      <NeuralBar label="Creativity" value={entity.psychology.neural_matrix.creativity || 0} color="#f472b6" />
                      <NeuralBar label="Empathy" value={entity.psychology.neural_matrix.empathy || 0} color="#a78bfa" />
                      <NeuralBar label="Logic" value={entity.psychology.neural_matrix.logic || 0} color="#38bdf8" />
                      <NeuralBar label="Adaptability" value={entity.psychology.neural_matrix.adaptability || 0} color="#34d399" />
                      <NeuralBar label="Charisma" value={entity.psychology.neural_matrix.charisma || 0} color="#fbbf24" />
                      <NeuralBar label="Reliability" value={entity.psychology.neural_matrix.reliability || 0} color="#60a5fa" />
                    </div>
                  </div>
                )}

                {/* Psychology traits */}
                {entity.psychology?.traits && (
                  <div className="aieos-block">
                    <div className="aieos-block__header">
                      <Compass size={11} /> Personality Traits
                    </div>
                    <div className="aieos-tags">
                      {entity.psychology.traits.mbti && (
                        <span className="aieos-tag aieos-tag--accent">{entity.psychology.traits.mbti}</span>
                      )}
                      {entity.psychology.traits.enneagram && (
                        <span className="aieos-tag">{entity.psychology.traits.enneagram}</span>
                      )}
                      {entity.psychology.traits.temperament && (
                        <span className="aieos-tag">{entity.psychology.traits.temperament}</span>
                      )}
                    </div>
                    {entity.psychology.traits.ocean && (
                      <div className="aieos-neural" style={{ marginTop: 8 }}>
                        <NeuralBar label="Openness" value={entity.psychology.traits.ocean.openness || 0} color="#c084fc" />
                        <NeuralBar label="Conscientious" value={entity.psychology.traits.ocean.conscientiousness || 0} color="#34d399" />
                        <NeuralBar label="Extraversion" value={entity.psychology.traits.ocean.extraversion || 0} color="#fbbf24" />
                        <NeuralBar label="Agreeable" value={entity.psychology.traits.ocean.agreeableness || 0} color="#38bdf8" />
                        <NeuralBar label="Neuroticism" value={entity.psychology.traits.ocean.neuroticism || 0} color="#f87171" />
                      </div>
                    )}
                  </div>
                )}

                {/* Moral Compass */}
                {entity.psychology?.moral_compass && (
                  <div className="aieos-block">
                    <div className="aieos-block__header">
                      <Shield size={11} /> Moral Compass
                    </div>
                    <div className="aieos-kv-grid">
                      {entity.psychology.moral_compass.alignment && (
                        <><span className="aieos-kv__label">Alignment</span>
                        <span className="aieos-kv__value">{entity.psychology.moral_compass.alignment}</span></>
                      )}
                    </div>
                    {entity.psychology.moral_compass.core_values && entity.psychology.moral_compass.core_values.length > 0 && (
                      <div className="aieos-tags" style={{ marginTop: 6 }}>
                        {entity.psychology.moral_compass.core_values.map((v, i) => (
                          <span key={i} className="aieos-tag">{v}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Linguistics */}
                {entity.linguistics && (
                  <div className="aieos-block">
                    <div className="aieos-block__header">
                      <Mic size={11} /> Linguistics
                    </div>
                    <div className="aieos-kv-grid">
                      {entity.linguistics.text_style?.vocabulary_level && (
                        <><span className="aieos-kv__label">Vocabulary</span>
                        <span className="aieos-kv__value">{entity.linguistics.text_style.vocabulary_level}</span></>
                      )}
                      {entity.linguistics.text_style?.formality_level != null && (
                        <><span className="aieos-kv__label">Formality</span>
                        <span className="aieos-kv__value">{Math.round(entity.linguistics.text_style.formality_level * 100)}%</span></>
                      )}
                      {entity.linguistics.voice?.accent?.region && (
                        <><span className="aieos-kv__label">Accent</span>
                        <span className="aieos-kv__value">{entity.linguistics.voice.accent.region}</span></>
                      )}
                    </div>
                    {entity.linguistics.text_style?.style_descriptors && entity.linguistics.text_style.style_descriptors.length > 0 && (
                      <div className="aieos-tags" style={{ marginTop: 6 }}>
                        {entity.linguistics.text_style.style_descriptors.map((d, i) => (
                          <span key={i} className="aieos-tag">{d}</span>
                        ))}
                      </div>
                    )}
                    {entity.linguistics.idiolect?.catchphrases && entity.linguistics.idiolect.catchphrases.length > 0 && (
                      <div className="aieos-catchphrases">
                        {entity.linguistics.idiolect.catchphrases.map((p, i) => (
                          <div key={i} className="aieos-catchphrase">"{p}"</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* History */}
                {entity.history && (entity.history.origin_story || entity.history.occupation?.title) && (
                  <div className="aieos-block">
                    <div className="aieos-block__header">
                      <BookOpen size={11} /> History
                    </div>
                    {entity.history.origin_story && (
                      <div className="aieos-block__text">{entity.history.origin_story}</div>
                    )}
                    <div className="aieos-kv-grid">
                      {entity.history.occupation?.title && (
                        <><span className="aieos-kv__label">Occupation</span>
                        <span className="aieos-kv__value">{entity.history.occupation.title}</span></>
                      )}
                      {entity.history.occupation?.industry && (
                        <><span className="aieos-kv__label">Industry</span>
                        <span className="aieos-kv__value">{entity.history.occupation.industry}</span></>
                      )}
                      {entity.history.education?.field && (
                        <><span className="aieos-kv__label">Education</span>
                        <span className="aieos-kv__value">{entity.history.education.field}{entity.history.education.institution ? ` @ ${entity.history.education.institution}` : ""}</span></>
                      )}
                    </div>
                  </div>
                )}

                {/* Interests */}
                {entity.interests && (entity.interests.hobbies?.length || entity.interests.aversions?.length) && (
                  <div className="aieos-block">
                    <div className="aieos-block__header">
                      <Heart size={11} /> Interests
                    </div>
                    {entity.interests.hobbies && entity.interests.hobbies.length > 0 && (
                      <div className="aieos-tags">
                        {entity.interests.hobbies.map((h, i) => (
                          <span key={i} className="aieos-tag aieos-tag--green">{h}</span>
                        ))}
                      </div>
                    )}
                    {entity.interests.aversions && entity.interests.aversions.length > 0 && (
                      <div className="aieos-tags" style={{ marginTop: 6 }}>
                        {entity.interests.aversions.map((a, i) => (
                          <span key={i} className="aieos-tag aieos-tag--red">{a}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Motivations */}
                {entity.motivations && (
                  <div className="aieos-block">
                    <div className="aieos-block__header">
                      <Target size={11} /> Motivations
                    </div>
                    {entity.motivations.core_drive && (
                      <div className="aieos-block__text">{entity.motivations.core_drive}</div>
                    )}
                    {entity.motivations.goals?.short_term && entity.motivations.goals.short_term.length > 0 && (
                      <div className="aieos-goals">
                        <span className="aieos-goals__label">Short-term</span>
                        {entity.motivations.goals.short_term.map((g, i) => (
                          <span key={i} className="aieos-tag">{g}</span>
                        ))}
                      </div>
                    )}
                    {entity.motivations.goals?.long_term && entity.motivations.goals.long_term.length > 0 && (
                      <div className="aieos-goals">
                        <span className="aieos-goals__label">Long-term</span>
                        {entity.motivations.goals.long_term.map((g, i) => (
                          <span key={i} className="aieos-tag">{g}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Validation warnings */}
                {aieosValidation.warnings.length > 0 && (
                  <div className="aieos-validation">
                    <div className="aieos-validation__title">Schema Coverage</div>
                    {aieosValidation.warnings.map((w, i) => (
                      <div key={i} className="aieos-validation__warn">⚠ {w}</div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
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

      {/* Trading card modal */}
      <AgentTradingCard
        agent={agent}
        isOpen={showTradingCard}
        onClose={() => setShowTradingCard(false)}
      />
    </div>
  );
}
