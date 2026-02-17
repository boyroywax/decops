import { useState, useRef, useEffect } from "react";
import { Sparkles, ChevronLeft, ChevronRight, Hexagon, ArrowLeftRight, Globe, Bot, GitBranch, Network } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import { SCENARIO_PRESETS, ROLES, CHANNEL_TYPES, GOVERNANCE_MODELS, NETWORK_COLORS } from "../../constants";
import { useWorkspaceContext } from "../../context/WorkspaceContext";
import type { MeshConfig, ArchPhase, DeployProgress, ViewId } from "../../types";

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
      style={{
        position: "fixed", inset: 0, zIndex: 9500,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: isExpanded ? "center" : "flex-start",
        justifyContent: "center",
        paddingTop: isExpanded ? 0 : "min(15vh, 120px)",
        animation: "archFadeIn 0.12s ease-out",
      }}
    >
      <div style={{
        background: "#0f0f14",
        border: "1px solid rgba(251,191,36,0.15)",
        borderRadius: 16,
        width: isExpanded ? "min(780px, calc(100vw - 48px))" : "min(680px, calc(100vw - 48px))",
        maxHeight: isExpanded ? "calc(100vh - 64px)" : "auto",
        overflow: "hidden",
        display: "flex", flexDirection: "column",
        boxShadow: "0 25px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(251,191,36,0.06)",
        transition: "width 0.2s ease, max-height 0.2s ease",
      }}>
        {/* Header bar */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px 10px",
          borderBottom: archPhase === "input" ? "none" : "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <GradientIcon icon={Sparkles} size={16} gradient={["#fbbf24", "#fcd34d"]} />
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 13, color: "#fbbf24" }}>
              Architect
            </span>
            <span style={{ fontSize: 9, color: "#52525b", fontFamily: "'DM Mono', monospace" }}>
              {archPhase === "input" ? "⌘K" : archPhase === "preview" ? "Blueprint" : archPhase === "deploying" ? "Deploying…" : "Complete"}
            </span>
          </div>
          {(archPhase === "preview" || archPhase === "done") && (
            <button onClick={() => { resetArchitect(); }} style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              color: "#71717a", padding: "4px 12px", borderRadius: 6,
              fontFamily: "inherit", fontSize: 10, cursor: "pointer",
            }}>
              New Design
            </button>
          )}
        </div>

        {/* ─── INPUT PHASE ─── */}
        {archPhase === "input" && (
          <div style={{ padding: "4px 20px 20px" }}>
            {/* Template Card Deck */}
            <div style={{ position: "relative", marginBottom: 16 }}>
              {canScrollLeft && (
                <button onClick={() => scroll(-1)} style={arrowBtnStyle("left")}>
                  <ChevronLeft size={14} />
                </button>
              )}
              <div
                ref={scrollRef}
                onScroll={updateScrollState}
                style={{
                  display: "flex", gap: 10, overflowX: "auto", padding: "4px 0 8px",
                  scrollbarWidth: "none", msOverflowStyle: "none",
                  WebkitOverflowScrolling: "touch",
                }}
              >
                {/* Hide scrollbar */}
                <style>{`.arch-deck::-webkit-scrollbar { display: none; }`}</style>
                {SCENARIO_PRESETS.map((s) => {
                  const isSelected = archPrompt === s.desc;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setArchPrompt(s.desc)}
                      style={{
                        flex: "0 0 auto",
                        width: 180,
                        background: isSelected ? `${s.color}10` : "rgba(255,255,255,0.02)",
                        border: `1px solid ${isSelected ? `${s.color}35` : "rgba(255,255,255,0.05)"}`,
                        borderRadius: 10,
                        padding: "12px 14px",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        textAlign: "left",
                        transition: "all 0.15s",
                      }}
                    >
                      <div style={{ fontSize: 18, marginBottom: 6 }}>{s.icon}</div>
                      <div style={{
                        fontSize: 11, fontWeight: 500,
                        color: isSelected ? s.color : "#d4d4d8",
                        marginBottom: 4,
                        fontFamily: "'Space Grotesk', sans-serif",
                      }}>
                        {s.label}
                      </div>
                      <div style={{ fontSize: 9, color: "#52525b", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {s.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
              {canScrollRight && (
                <button onClick={() => scroll(1)} style={arrowBtnStyle("right")}>
                  <ChevronRight size={14} />
                </button>
              )}
            </div>

            {/* Command Input Bar */}
            <div style={{
              display: "flex", gap: 8, alignItems: "flex-start",
              background: "rgba(0,0,0,0.3)",
              border: "1px solid rgba(251,191,36,0.15)",
              borderRadius: 10,
              padding: "4px 4px 4px 14px",
            }}>
              <Sparkles size={14} color="#fbbf24" style={{ flexShrink: 0, opacity: archGenerating ? 0.5 : 1, marginTop: 11 }} />
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
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "#e4e4e7",
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 13,
                  padding: "10px 0",
                  resize: "none",
                  lineHeight: 1.5,
                  minHeight: 36,
                  maxHeight: 120,
                  overflow: "auto",
                }}
              />
              <button
                onClick={handleSubmit}
                disabled={archGenerating || !archPrompt.trim()}
                style={{
                  background: archGenerating ? "rgba(251,191,36,0.15)" : archPrompt.trim() ? "#fbbf24" : "#3f3f46",
                  color: archGenerating ? "#fbbf24" : "#0a0a0f",
                  border: archGenerating ? "1px solid rgba(251,191,36,0.3)" : "none",
                  padding: "8px 18px",
                  borderRadius: 8,
                  cursor: archGenerating || !archPrompt.trim() ? "not-allowed" : "pointer",
                  fontFamily: "inherit", fontSize: 12, fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 6,
                  flexShrink: 0,
                  transition: "all 0.15s",
                  alignSelf: "flex-start",
                  marginTop: 4,
                }}
              >
                {archGenerating ? (
                  <span style={{ animation: "pulse 1.5s infinite", display: "flex", alignItems: "center", gap: 6 }}>
                    <GradientIcon icon={Sparkles} size={13} gradient={["#fbbf24", "#fcd34d"]} /> Generating…
                  </span>
                ) : (
                  <>Generate</>
                )}
              </button>
            </div>

            {archError && (
              <div style={{
                background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
                borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#ef4444", marginTop: 10,
              }}>
                {archError}
              </div>
            )}

            {/* Keyboard hint */}
            <div style={{ textAlign: "center", marginTop: 12, fontSize: 10, color: "#3f3f46" }}>
              <kbd style={kbdStyle}>Enter</kbd> generate · <kbd style={kbdStyle}>Shift+Enter</kbd> newline · <kbd style={kbdStyle}>Esc</kbd> close
            </div>
          </div>
        )}

        {/* ─── PREVIEW PHASE ─── */}
        {archPhase === "preview" && archPreview && (
          <PreviewContent preview={archPreview} deployNetwork={deployNetwork} resetArchitect={resetArchitect} />
        )}

        {/* ─── DEPLOYING PHASE ─── */}
        {archPhase === "deploying" && (
          <div style={{ padding: "40px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 14, animation: "pulse 1.5s infinite" }}>
              <GradientIcon icon={Hexagon} size={36} gradient={["#f472b6", "#ec4899"]} />
            </div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 600, color: "#fbbf24", marginBottom: 8 }}>
              Deploying Network
            </div>
            <div style={{ fontSize: 11, color: "#71717a", marginBottom: 18 }}>{deployProgress.step}</div>
            <div style={{ maxWidth: 280, margin: "0 auto", background: "rgba(255,255,255,0.04)", borderRadius: 6, height: 5, overflow: "hidden" }}>
              <div style={{
                height: "100%", background: "#fbbf24", borderRadius: 6,
                width: `${deployProgress.total > 0 ? (deployProgress.count / deployProgress.total) * 100 : 0}%`,
                transition: "width 0.3s",
              }} />
            </div>
            <div style={{ fontSize: 10, color: "#52525b", marginTop: 6 }}>{deployProgress.count} / {deployProgress.total}</div>
          </div>
        )}

        {/* ─── DONE PHASE ─── */}
        {archPhase === "done" && (
          <DoneContent onNavigate={handleNavigate} resetArchitect={resetArchitect} />
        )}
      </div>

      <style>{`
        @keyframes archFadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

/* ─── Preview sub-component (scrollable) ─── */
function PreviewContent({ preview, deployNetwork, resetArchitect }: { preview: MeshConfig; deployNetwork: () => void; resetArchitect: () => void }) {
  const networkCount = preview.networks?.length || 0;
  const bridgeCount = preview.bridges?.length || 0;
  
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "16px 20px 20px" }}>
      <div style={{
        background: "rgba(251,191,36,0.04)", border: "1px solid rgba(251,191,36,0.12)",
        borderRadius: 10, padding: 18, marginBottom: 16,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "#fbbf24" }}>
            <GradientIcon icon={Sparkles} size={14} gradient={["#fbbf24", "#fcd34d"]} /> Blueprint
          </div>
          <div style={{ fontSize: 10, color: "#52525b" }}>
            {networkCount > 0 && `${networkCount} network${networkCount !== 1 ? 's' : ''} · `}
            {preview.agents.length} agents · {preview.channels.length} ch · {preview.groups?.length || 0} groups
            {bridgeCount > 0 && ` · ${bridgeCount} bridge${bridgeCount !== 1 ? 's' : ''}`}
          </div>
        </div>

        {/* Networks */}
        {preview.networks && preview.networks.length > 0 && (
          <>
            <div style={{ fontSize: 9, fontWeight: 600, color: "#52525b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Networks</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              {preview.networks.map((n, i) => {
                const color = NETWORK_COLORS[i % NETWORK_COLORS.length];
                const agentCount = n.agents?.length || 0;
                return (
                  <div key={i} style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${color}30`, borderRadius: 8, padding: 10, minWidth: 180 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <Globe size={14} color={color} />
                      <div style={{ fontSize: 11, fontWeight: 500, color }}>
                        {n.name}
                      </div>
                    </div>
                    {n.description && (
                      <div style={{ fontSize: 9, color: "#71717a", marginBottom: 4 }}>{n.description}</div>
                    )}
                    <div style={{ fontSize: 9, color: "#52525b" }}>{agentCount} agent{agentCount !== 1 ? 's' : ''}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Agents */}
        <div style={{ fontSize: 9, fontWeight: 600, color: "#52525b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Agents</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8, marginBottom: 16 }}>
          {preview.agents.map((a, i) => {
            const role = ROLES.find(r => r.id === a.role) || ROLES[0];
            // Find which network this agent belongs to
            const networkIdx = preview.networks?.findIndex(n => n.agents?.includes(i)) ?? -1;
            const networkColor = networkIdx >= 0 ? NETWORK_COLORS[networkIdx % NETWORK_COLORS.length] : undefined;
            const networkName = networkIdx >= 0 ? preview.networks![networkIdx].name : undefined;
            
            return (
              <div key={i} style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${role.color}20`, borderRadius: 8, padding: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 13 }}>{role.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: "#e4e4e7" }}>{a.name}</div>
                    <div style={{ fontSize: 9, color: role.color }}>{role.label}</div>
                  </div>
                  {networkName && (
                    <div style={{ display: "flex", alignItems: "center", gap: 3, padding: "2px 6px", background: `${networkColor}15`, borderRadius: 4 }}>
                      <Globe size={9} color={networkColor} />
                      <span style={{ fontSize: 8, color: networkColor }}>{networkName}</span>
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 9, color: "#71717a", lineHeight: 1.4, maxHeight: 40, overflow: "hidden" }}>{a.prompt}</div>
              </div>
            );
          })}
        </div>

        {/* Channels */}
        <div style={{ fontSize: 9, fontWeight: 600, color: "#52525b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Channels</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
          {preview.channels.map((c, i) => {
            const from = preview.agents[c.from];
            const to = preview.agents[c.to];
            const cType = CHANNEL_TYPES.find(t => t.id === c.type) || CHANNEL_TYPES[0];
            if (!from || !to) return null;
            return (
              <div key={i} style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(167,139,250,0.15)", borderRadius: 6, padding: "6px 10px", fontSize: 10 }}>
                <span style={{ color: "#d4d4d8" }}>{from.name}</span>
                <ArrowLeftRight size={10} color="#52525b" style={{ margin: "0 4px", verticalAlign: "middle" }} />
                <span style={{ color: "#d4d4d8" }}>{to.name}</span>
                <span style={{ color: "#a78bfa", marginLeft: 6 }}>{cType.icon} {cType.label}</span>
              </div>
            );
          })}
        </div>

        {/* Groups */}
        {preview.groups && preview.groups.length > 0 && (
          <>
            <div style={{ fontSize: 9, fontWeight: 600, color: "#52525b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Groups</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              {preview.groups.map((g, i) => {
                const gov = GOVERNANCE_MODELS.find(m => m.id === g.governance) || GOVERNANCE_MODELS[0];
                return (
                  <div key={i} style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(244,114,182,0.15)", borderRadius: 8, padding: 10, minWidth: 160 }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: "#f472b6", marginBottom: 4 }}>
                      <GradientIcon icon={Hexagon} size={12} gradient={["#f472b6", "#ec4899"]} /> {g.name}
                    </div>
                    <div style={{ fontSize: 9, color: "#71717a", marginBottom: 4 }}>{gov.icon} {gov.label}</div>
                    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                      {g.members.map((idx) => {
                        const a = preview.agents[idx];
                        if (!a) return null;
                        return <span key={idx} style={{ fontSize: 9, padding: "2px 5px", borderRadius: 4, background: "rgba(255,255,255,0.04)", color: "#a1a1aa" }}>{a.name}</span>;
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
            <div style={{ fontSize: 9, fontWeight: 600, color: "#52525b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Bridges</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
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
                  <div key={i} style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 8, padding: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 9, color: fromColor, marginBottom: 2 }}>{fromNet.name}</div>
                        <div style={{ fontSize: 10, color: "#d4d4d8" }}>{fromAgent.name}</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <GitBranch size={12} color="#fbbf24" />
                        <span style={{ fontSize: 8, color: "#a78bfa" }}>{cType.label}</span>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 9, color: toColor, marginBottom: 2 }}>{toNet.name}</div>
                        <div style={{ fontSize: 10, color: "#d4d4d8" }}>{toAgent.name}</div>
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
            <div style={{ fontSize: 9, fontWeight: 600, color: "#52525b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Example Messages</div>
            {preview.exampleMessages.map((em, i) => {
              const ch = preview.channels[em.channelIdx];
              const from = ch ? preview.agents[ch.from] : null;
              const to = ch ? preview.agents[ch.to] : null;
              if (!from || !to) return null;
              return (
                <div key={i} style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 6, padding: "8px 10px", marginBottom: 6 }}>
                  <div style={{ fontSize: 9, color: "#52525b", marginBottom: 3 }}>{from.name} → {to.name}</div>
                  <div style={{ fontSize: 11, color: "#d4d4d8", lineHeight: 1.4 }}>{em.message}</div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={deployNetwork} style={{
          background: "#fbbf24", color: "#0a0a0f", border: "none",
          padding: "10px 24px", borderRadius: 8, cursor: "pointer",
          fontFamily: "inherit", fontSize: 12, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <GradientIcon icon={Hexagon} size={14} gradient={["#f472b6", "#ec4899"]} /> Deploy Network
        </button>
        <button onClick={resetArchitect} style={{
          background: "transparent", border: "1px solid rgba(255,255,255,0.08)",
          color: "#71717a", padding: "10px 18px", borderRadius: 8, cursor: "pointer",
          fontFamily: "inherit", fontSize: 11,
        }}>
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
    <div style={{ padding: "36px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 36, marginBottom: 14 }}>✓</div>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 600, color: "#00e5a0", marginBottom: 8 }}>Network Deployed</div>
      <div style={{ fontSize: 11, color: "#71717a", marginBottom: 22 }}>
        {agents.length} agents · {channels.length} channels · {groups.length} groups · {messages.length} messages
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        <button onClick={() => onNavigate("network")} style={doneBtnStyle("#00e5a0")}>
          ◈ View Topology
        </button>
        <button onClick={() => onNavigate("networks")} style={doneBtnStyle("#38bdf8")}>
          <Globe size={13} /> Save to Ecosystem
        </button>
        <button onClick={() => onNavigate("agents")} style={doneBtnStyle("#00e5a0")}>
          <Bot size={13} /> Browse Agents
        </button>
        <button onClick={() => { resetArchitect(); }} style={{
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
          color: "#71717a", padding: "8px 16px", borderRadius: 8,
          fontFamily: "inherit", fontSize: 11, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 5,
        }}>
          <Sparkles size={13} /> Build Another
        </button>
      </div>
    </div>
  );
}

/* ─── Shared styles ─── */
const arrowBtnStyle = (side: "left" | "right"): React.CSSProperties => ({
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
  [side]: -2,
  zIndex: 2,
  width: 28,
  height: 28,
  borderRadius: "50%",
  background: "rgba(15,15,20,0.9)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "#a1a1aa",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});

const kbdStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "1px 5px",
  borderRadius: 3,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  fontFamily: "'DM Mono', monospace",
  fontSize: 9,
};

const doneBtnStyle = (color: string): React.CSSProperties => ({
  background: `${color}12`,
  border: `1px solid ${color}25`,
  color,
  padding: "8px 16px",
  borderRadius: 8,
  fontFamily: "inherit",
  fontSize: 11,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 5,
});
