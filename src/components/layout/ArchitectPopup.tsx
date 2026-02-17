import { useState, useRef, useEffect } from "react";
import { Sparkles, ChevronLeft, ChevronRight, Hexagon, ArrowLeftRight, Globe, Bot, GitBranch, Network } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import { SCENARIO_PRESETS, ROLES, CHANNEL_TYPES, GOVERNANCE_MODELS, NETWORK_COLORS } from "../../constants";
import { useWorkspaceContext } from "../../context/WorkspaceContext";
import type { MeshConfig, ArchPhase, DeployProgress, ViewId } from "../../types";
import "../../styles/components/architect-popup.css";

interface ArchitectPopupProps {
  isOpen: boolean;
  onClose: () => void;
  archPrompt: string;
  setArchPrompt: (v: string) => void;
  archGenerating: boolean;
  archPreview: MeshConfig | null;
  archError: string | null;
  archPhase: ArchPhase;
  deployProgress: DeployProgress;
  generateNetwork: (desc: string) => void;
  deployNetwork: () => void;
  resetArchitect: () => void;
  setView: (v: ViewId) => void;
}

export function ArchitectPopup({
  isOpen, onClose,
  archPrompt, setArchPrompt,
  archGenerating, archPreview, archError, archPhase, deployProgress,
  generateNetwork, deployNetwork, resetArchitect, setView,
}: ArchitectPopupProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Auto-resize textarea based on content
  const autoResize = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px"; // max ~4 lines
  };

  // Focus input when popup opens
  useEffect(() => {
    if (isOpen && archPhase === "input") {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, archPhase]);

  // Auto-resize when prompt changes (e.g., preset selection)
  useEffect(() => {
    if (isOpen) setTimeout(autoResize, 0);
  }, [isOpen, archPrompt]);

  // Escape to close (unless deploying)
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && archPhase !== "deploying") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose, archPhase]);

  // Track scroll state on the card deck
  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };

  useEffect(() => {
    if (isOpen) setTimeout(updateScrollState, 150);
  }, [isOpen]);

  const scroll = (dir: number) => {
    scrollRef.current?.scrollBy({ left: dir * 240, behavior: "smooth" });
    setTimeout(updateScrollState, 350);
  };

  const handleSubmit = () => {
    if (archPrompt.trim() && !archGenerating) {
      generateNetwork(archPrompt.trim());
    }
  };

  const handleNavigate = (v: ViewId) => {
    setView(v);
    onClose();
  };

  if (!isOpen) return null;

  // Determine if we're in a phase that needs more space
  const isExpanded = archPhase === "preview" || archPhase === "deploying" || archPhase === "done";

  return (
    <div
      ref={backdropRef}
      onClick={(e) => {
        if (e.target === backdropRef.current && archPhase !== "deploying") onClose();
      }}
      className={`architect-popup-backdrop${isExpanded ? " architect-popup-backdrop--expanded" : ""}`}
    >
      <div className={`architect-popup${isExpanded ? " architect-popup--expanded" : ""}`}>
        {/* Header bar */}
        <div className={`architect-popup__header${archPhase !== "input" ? " architect-popup__header--bordered" : ""}`}>
          <div className="architect-popup__header-left">
            <GradientIcon icon={Sparkles} size={16} gradient={["#fbbf24", "#fcd34d"]} />
            <span className="architect-popup__title">
              Architect
            </span>
            <span className="architect-popup__phase-label">
              {archPhase === "input" ? "⌘K" : archPhase === "preview" ? "Blueprint" : archPhase === "deploying" ? "Deploying…" : "Complete"}
            </span>
          </div>
          {(archPhase === "preview" || archPhase === "done") && (
            <button onClick={() => { resetArchitect(); }} className="architect-popup__new-btn">
              New Design
            </button>
          )}
        </div>

        {/* ─── INPUT PHASE ─── */}
        {archPhase === "input" && (
          <div className="architect-popup__input-phase">
            {/* Template Card Deck */}
            <div className="architect-popup__deck-wrap">
              {canScrollLeft && (
                <button onClick={() => scroll(-1)} className="architect-popup__deck-arrow architect-popup__deck-arrow--left">
                  <ChevronLeft size={14} />
                </button>
              )}
              <div
                ref={scrollRef}
                onScroll={updateScrollState}
                className="architect-popup__deck"
              >
                {SCENARIO_PRESETS.map((s) => {
                  const isSelected = archPrompt === s.desc;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setArchPrompt(s.desc)}
                      className="architect-popup__preset"
                      style={isSelected ? { background: `${s.color}10`, borderColor: `${s.color}35` } : undefined}
                    >
                      <div className="architect-popup__preset-icon">{s.icon}</div>
                      <div className="architect-popup__preset-label" style={isSelected ? { color: s.color } : undefined}>
                        {s.label}
                      </div>
                      <div className="architect-popup__preset-desc">
                        {s.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
              {canScrollRight && (
                <button onClick={() => scroll(1)} className="architect-popup__deck-arrow architect-popup__deck-arrow--right">
                  <ChevronRight size={14} />
                </button>
              )}
            </div>

            {/* Command Input Bar */}
            <div className="architect-popup__input-bar">
              <Sparkles size={14} color="#fbbf24" className={`architect-popup__input-icon${archGenerating ? " architect-popup__input-icon--generating" : ""}`} />
              <textarea
                ref={inputRef}
                value={archPrompt}
                onChange={(e) => { setArchPrompt(e.target.value); autoResize(); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="Describe a network to build…"
                disabled={archGenerating}
                rows={1}
                className="architect-popup__textarea"
              />
              <button
                onClick={handleSubmit}
                disabled={archGenerating || !archPrompt.trim()}
                className={`architect-popup__submit-btn ${archGenerating ? "architect-popup__submit-btn--generating" : archPrompt.trim() ? "architect-popup__submit-btn--ready" : "architect-popup__submit-btn--disabled"}`}
              >
                {archGenerating ? (
                  <span className="architect-popup__generating-text">
                    <GradientIcon icon={Sparkles} size={13} gradient={["#fbbf24", "#fcd34d"]} /> Generating…
                  </span>
                ) : (
                  <>Generate</>
                )}
              </button>
            </div>

            {archError && (
              <div className="architect-popup__error">
                {archError}
              </div>
            )}

            {/* Keyboard hint */}
            <div className="architect-popup__kbd-hints">
              <kbd className="architect-popup__kbd">Enter</kbd> generate · <kbd className="architect-popup__kbd">Shift+Enter</kbd> newline · <kbd className="architect-popup__kbd">Esc</kbd> close
            </div>
          </div>
        )}

        {/* ─── PREVIEW PHASE ─── */}
        {archPhase === "preview" && archPreview && (
          <PreviewContent preview={archPreview} deployNetwork={deployNetwork} resetArchitect={resetArchitect} />
        )}

        {/* ─── DEPLOYING PHASE ─── */}
        {archPhase === "deploying" && (
          <div className="architect-popup__deploying">
            <div className="architect-popup__deploying-icon">
              <GradientIcon icon={Hexagon} size={36} gradient={["#f472b6", "#ec4899"]} />
            </div>
            <div className="architect-popup__deploying-title">
              Deploying Network
            </div>
            <div className="architect-popup__deploying-step">{deployProgress.step}</div>
            <div className="architect-popup__progress-track">
              <div className="architect-popup__progress-bar" style={{
                width: `${deployProgress.total > 0 ? (deployProgress.count / deployProgress.total) * 100 : 0}%`,
              }} />
            </div>
            <div className="architect-popup__progress-count">{deployProgress.count} / {deployProgress.total}</div>
          </div>
        )}

        {/* ─── DONE PHASE ─── */}
        {archPhase === "done" && (
          <DoneContent onNavigate={handleNavigate} resetArchitect={resetArchitect} />
        )}
      </div>

    </div>
  );
}

/* ─── Preview sub-component (scrollable) ─── */
function PreviewContent({ preview, deployNetwork, resetArchitect }: { preview: MeshConfig; deployNetwork: () => void; resetArchitect: () => void }) {
  const networkCount = preview.networks?.length || 0;
  const bridgeCount = preview.bridges?.length || 0;
  
  return (
    <div className="architect-review">
      <div className="architect-review__blueprint">
        <div className="architect-review__blueprint-header">
          <div className="architect-review__blueprint-title">
            <GradientIcon icon={Sparkles} size={14} gradient={["#fbbf24", "#fcd34d"]} /> Blueprint
          </div>
          <div className="architect-review__blueprint-stats">
            {networkCount > 0 && `${networkCount} network${networkCount !== 1 ? 's' : ''} · `}
            {preview.agents.length} agents · {preview.channels.length} ch · {preview.groups?.length || 0} groups
            {bridgeCount > 0 && ` · ${bridgeCount} bridge${bridgeCount !== 1 ? 's' : ''}`}
          </div>
        </div>

        {/* Networks */}
        {preview.networks && preview.networks.length > 0 && (
          <>
            <div className="architect-review__section-label">Networks</div>
            <div className="architect-review__networks-grid">
              {preview.networks.map((n, i) => {
                const color = NETWORK_COLORS[i % NETWORK_COLORS.length];
                const agentCount = n.agents?.length || 0;
                return (
                  <div key={i} className="architect-review__network-card" style={{ borderColor: `${color}30` }}>
                    <div className="architect-review__network-header">
                      <Globe size={14} color={color} />
                      <div className="architect-review__network-name" style={{ color }}>
                        {n.name}
                      </div>
                    </div>
                    {n.description && (
                      <div className="architect-review__network-desc">{n.description}</div>
                    )}
                    <div className="architect-review__network-count">{agentCount} agent{agentCount !== 1 ? 's' : ''}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Agents */}
        <div className="architect-review__section-label">Agents</div>
        <div className="architect-review__agents-grid">
          {preview.agents.map((a, i) => {
            const role = ROLES.find(r => r.id === a.role) || ROLES[0];
            // Find which network this agent belongs to
            const networkIdx = preview.networks?.findIndex(n => n.agents?.includes(i)) ?? -1;
            const networkColor = networkIdx >= 0 ? NETWORK_COLORS[networkIdx % NETWORK_COLORS.length] : undefined;
            const networkName = networkIdx >= 0 ? preview.networks![networkIdx].name : undefined;
            
            return (
              <div key={i} className="architect-review__agent-card" style={{ borderColor: `${role.color}20` }}>
                <div className="architect-review__agent-header">
                  <span className="architect-review__agent-icon">{role.icon}</span>
                  <div className="architect-review__agent-info">
                    <div className="architect-review__agent-name">{a.name}</div>
                    <div className="architect-review__agent-role" style={{ color: role.color }}>{role.label}</div>
                  </div>
                  {networkName && (
                    <div className="architect-review__agent-network-badge" style={{ background: `${networkColor}15`, color: networkColor }}>
                      <Globe size={9} color={networkColor} />
                      <span className="architect-review__agent-network-label">{networkName}</span>
                    </div>
                  )}
                </div>
                <div className="architect-review__agent-prompt">{a.prompt}</div>
              </div>
            );
          })}
        </div>

        {/* Channels */}
        <div className="architect-review__section-label">Channels</div>
        <div className="architect-review__channels-grid">
          {preview.channels.map((c, i) => {
            const from = preview.agents[c.from];
            const to = preview.agents[c.to];
            const cType = CHANNEL_TYPES.find(t => t.id === c.type) || CHANNEL_TYPES[0];
            if (!from || !to) return null;
            return (
              <div key={i} className="architect-review__channel-card">
                <span className="architect-review__channel-agent">{from.name}</span>
                <ArrowLeftRight size={10} color="#52525b" className="architect-review__channel-arrow" />
                <span className="architect-review__channel-agent">{to.name}</span>
                <span className="architect-review__channel-type">{cType.icon} {cType.label}</span>
              </div>
            );
          })}
        </div>

        {/* Groups */}
        {preview.groups && preview.groups.length > 0 && (
          <>
            <div className="architect-review__section-label">Groups</div>
            <div className="architect-review__groups-grid">
              {preview.groups.map((g, i) => {
                const gov = GOVERNANCE_MODELS.find(m => m.id === g.governance) || GOVERNANCE_MODELS[0];
                return (
                  <div key={i} className="architect-review__group-card">
                    <div className="architect-review__group-name">
                      <GradientIcon icon={Hexagon} size={12} gradient={["#f472b6", "#ec4899"]} /> {g.name}
                    </div>
                    <div className="architect-review__group-gov">{gov.icon} {gov.label}</div>
                    <div className="architect-review__group-members">
                      {g.members.map((idx) => {
                        const a = preview.agents[idx];
                        if (!a) return null;
                        return <span key={idx} className="architect-review__member-badge">{a.name}</span>;
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Bridges */}
        {preview.bridges && preview.bridges.length > 0 && (
          <>
            <div className="architect-review__section-label">Bridges</div>
            <div className="architect-review__bridges-grid">
              {preview.bridges.map((b, i) => {
                const fromNet = preview.networks?.[b.fromNetwork];
                const toNet = preview.networks?.[b.toNetwork];
                const fromAgent = preview.agents[b.fromAgent];
                const toAgent = preview.agents[b.toAgent];
                const fromColor = NETWORK_COLORS[b.fromNetwork % NETWORK_COLORS.length];
                const toColor = NETWORK_COLORS[b.toNetwork % NETWORK_COLORS.length];
                const cType = CHANNEL_TYPES.find(t => t.id === b.type) || CHANNEL_TYPES[0];
                
                if (!fromNet || !toNet || !fromAgent || !toAgent) return null;
                
                return (
                  <div key={i} className="architect-review__bridge-card">
                    <div className="architect-review__bridge-layout">
                      <div className="architect-review__bridge-endpoint">
                        <div className="architect-review__bridge-net-name" style={{ color: fromColor }}>{fromNet.name}</div>
                        <div className="architect-review__bridge-agent-name">{fromAgent.name}</div>
                      </div>
                      <div className="architect-review__bridge-icon">
                        <GitBranch size={12} color="#fbbf24" />
                        <span className="architect-review__bridge-type">{cType.label}</span>
                      </div>
                      <div className="architect-review__bridge-endpoint">
                        <div className="architect-review__bridge-net-name" style={{ color: toColor }}>{toNet.name}</div>
                        <div className="architect-review__bridge-agent-name">{toAgent.name}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Example Messages */}
        {preview.exampleMessages && preview.exampleMessages.length > 0 && (
          <>
            <div className="architect-review__section-label">Example Messages</div>
            {preview.exampleMessages.map((em, i) => {
              const ch = preview.channels[em.channelIdx];
              const from = ch ? preview.agents[ch.from] : null;
              const to = ch ? preview.agents[ch.to] : null;
              if (!from || !to) return null;
              return (
                <div key={i} className="architect-review__message-card">
                  <div className="architect-review__message-route">{from.name} → {to.name}</div>
                  <div className="architect-review__message-text">{em.message}</div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Action buttons */}
      <div className="architect-review__actions">
        <button onClick={deployNetwork} className="architect-review__deploy-btn">
          <GradientIcon icon={Hexagon} size={14} gradient={["#f472b6", "#ec4899"]} /> Deploy Network
        </button>
        <button onClick={resetArchitect} className="architect-review__discard-btn">
          Discard
        </button>
      </div>
    </div>
  );
}

/* ─── Done sub-component ─── */
function DoneContent({ onNavigate, resetArchitect }: { onNavigate: (v: ViewId) => void; resetArchitect: () => void }) {
  const { agents, channels, groups, messages } = useWorkspaceContext();

  return (
    <div className="architect-popup__done">
      <div className="architect-popup__done-check">✓</div>
      <div className="architect-popup__done-title">Network Deployed</div>
      <div className="architect-popup__done-summary">
        {agents.length} agents · {channels.length} channels · {groups.length} groups · {messages.length} messages
      </div>
      <div className="architect-popup__done-actions">
        <button onClick={() => onNavigate("network")} className="architect-popup__done-btn" style={{ background: "#00e5a012", border: "1px solid #00e5a025", color: "#00e5a0" }}>
          ◈ View Topology
        </button>
        <button onClick={() => onNavigate("networks")} className="architect-popup__done-btn" style={{ background: "#38bdf812", border: "1px solid #38bdf825", color: "#38bdf8" }}>
          <Globe size={13} /> Save to Ecosystem
        </button>
        <button onClick={() => onNavigate("agents")} className="architect-popup__done-btn" style={{ background: "#00e5a012", border: "1px solid #00e5a025", color: "#00e5a0" }}>
          <Bot size={13} /> Browse Agents
        </button>
        <button onClick={() => { resetArchitect(); }} className="architect-popup__build-another-btn">
          <Sparkles size={13} /> Build Another
        </button>
      </div>
    </div>
  );
}


