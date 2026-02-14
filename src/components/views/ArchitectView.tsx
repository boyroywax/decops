import type { Agent, Channel, Group, Message, MeshConfig, ArchPhase, DeployProgress, ViewId } from "../../types";
import { ROLES, CHANNEL_TYPES, GOVERNANCE_MODELS, SCENARIO_PRESETS } from "../../constants";
import { inputStyle, SectionTitle } from "../shared/ui";
import { ArrowLeftRight, Hexagon, Globe, Bot, Sparkles, CheckCircle } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";

interface ArchitectViewProps {
  agents: Agent[];
  channels: Channel[];
  groups: Group[];
  messages: Message[];
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

export function ArchitectView({
  agents, channels, groups, messages,
  archPrompt, setArchPrompt, archGenerating, archPreview, archError,
  archPhase, deployProgress, generateNetwork, deployNetwork, resetArchitect, setView,
}: ArchitectViewProps) {
  return (
    <div style={{ width: "100%", boxSizing: "border-box" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 600, margin: 0 }}>
          <GradientIcon icon={Sparkles} size={16} gradient={["#fbbf24", "#fcd34d"]} /> Workspace Architect
        </h2>
        {(archPhase === "preview" || archPhase === "done") && (
          <button onClick={resetArchitect} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#71717a", padding: "6px 14px", borderRadius: 6, fontFamily: "inherit", fontSize: 10, cursor: "pointer" }}>
            New Design
          </button>
        )}
      </div>
      <div style={{ fontSize: 11, color: "#71717a", marginBottom: 24, lineHeight: 1.6 }}>
        Describe a network and the AI architect will generate agents, channels, groups, and example conversations.
      </div>

      {/* Input Phase */}
      {archPhase === "input" && (
        <>
          <SectionTitle text="Quick Scenarios" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 10, marginBottom: 24 }}>
            {SCENARIO_PRESETS.map((s) => (
              <button key={s.id} onClick={() => setArchPrompt(s.desc)} style={{
                background: archPrompt === s.desc ? s.color + "10" : "rgba(255,255,255,0.02)",
                border: `1px solid ${archPrompt === s.desc ? s.color + "35" : "rgba(255,255,255,0.05)"}`,
                borderRadius: 10, padding: 14, cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "all 0.15s",
              }}>
                <div style={{ fontSize: 18, marginBottom: 6 }}>{s.icon}</div>
                <div style={{ fontSize: 12, fontWeight: 500, color: archPrompt === s.desc ? s.color : "#d4d4d8", marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 9, color: "#52525b", lineHeight: 1.5 }}>{s.desc}</div>
              </button>
            ))}
          </div>

          <SectionTitle text="Or describe your own network" />
          <textarea
            placeholder="Describe the mesh network you want to build. Be specific about agent roles, how they should collaborate, what kind of decisions need group governance, and what problems they're solving together..."
            value={archPrompt}
            onChange={(e) => setArchPrompt(e.target.value)}
            rows={5}
            style={{ ...inputStyle, border: "1px solid rgba(251,191,36,0.15)", lineHeight: 1.6, marginBottom: 16 }}
          />

          {archError && (
            <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "10px 14px", fontSize: 11, color: "#ef4444", marginBottom: 16 }}>
              {archError}
            </div>
          )}

          <button
            onClick={() => archPrompt.trim() && generateNetwork(archPrompt.trim())}
            disabled={archGenerating || !archPrompt.trim()}
            style={{
              background: archGenerating ? "rgba(251,191,36,0.15)" : archPrompt.trim() ? "#fbbf24" : "#3f3f46",
              color: archGenerating ? "#fbbf24" : "#0a0a0f",
              border: archGenerating ? "1px solid rgba(251,191,36,0.3)" : "none",
              padding: "12px 28px", borderRadius: 8, cursor: archGenerating || !archPrompt.trim() ? "not-allowed" : "pointer",
              fontFamily: "inherit", fontSize: 13, fontWeight: 600,
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            {archGenerating && <span style={{ animation: "pulse 1.5s infinite" }}><GradientIcon icon={Sparkles} size={16} gradient={["#fbbf24", "#fcd34d"]} /></span>}
            {archGenerating ? "Architecting mesh network…" : <><GradientIcon icon={Sparkles} size={16} gradient={["#fbbf24", "#fcd34d"]} /> Generate Network</>}
          </button>
        </>
      )}

      {/* Preview Phase */}
      {archPhase === "preview" && archPreview && (
        <div>
          <div style={{ background: "rgba(251,191,36,0.04)", border: "1px solid rgba(251,191,36,0.12)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#fbbf24" }}><GradientIcon icon={Sparkles} size={16} gradient={["#fbbf24", "#fcd34d"]} /> Network Blueprint</div>
              <div style={{ fontSize: 10, color: "#52525b" }}>
                {archPreview.agents.length} agents · {archPreview.channels.length} channels · {archPreview.groups?.length || 0} groups · {archPreview.exampleMessages?.length || 0} messages
              </div>
            </div>

            <SectionTitle text="Agents" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10, marginBottom: 20 }}>
              {archPreview.agents.map((a, i) => {
                const role = ROLES.find(r => r.id === a.role) || ROLES[0];
                return (
                  <div key={i} style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${role.color}20`, borderRadius: 8, padding: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 14 }}>{role.icon}</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>{a.name}</div>
                        <div style={{ fontSize: 9, color: role.color }}>{role.label}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 9, color: "#a1a1aa", lineHeight: 1.5, maxHeight: 54, overflow: "hidden" }}>{a.prompt}</div>
                  </div>
                );
              })}
            </div>

            <SectionTitle text="Channels" />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
              {archPreview.channels.map((c, i) => {
                const from = archPreview.agents[c.from];
                const to = archPreview.agents[c.to];
                const cType = CHANNEL_TYPES.find(t => t.id === c.type) || CHANNEL_TYPES[0];
                if (!from || !to) return null;
                return (
                  <div key={i} style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(167,139,250,0.15)", borderRadius: 6, padding: "8px 12px", fontSize: 10 }}>
                    <span style={{ color: "#d4d4d8" }}>{from.name}</span>
                    <span style={{ color: "#52525b", margin: "0 6px" }}><ArrowLeftRight size={12} color="#52525b" /></span>
                    <span style={{ color: "#d4d4d8" }}>{to.name}</span>
                    <span style={{ color: "#a78bfa", marginLeft: 8 }}>{cType.icon} {cType.label}</span>
                  </div>
                );
              })}
            </div>

            {archPreview.groups && archPreview.groups.length > 0 && (
              <>
                <SectionTitle text="Groups" />
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
                  {archPreview.groups.map((g, i) => {
                    const gov = GOVERNANCE_MODELS.find(m => m.id === g.governance) || GOVERNANCE_MODELS[0];
                    return (
                      <div key={i} style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(244,114,182,0.15)", borderRadius: 8, padding: 12, minWidth: "min(200px, 100%)" }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: "#f472b6", marginBottom: 4 }}><GradientIcon icon={Hexagon} size={16} gradient={["#f472b6", "#ec4899"]} /> {g.name}</div>
                        <div style={{ fontSize: 9, color: "#71717a", marginBottom: 6 }}>{gov.icon} {gov.label}</div>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {g.members.map((idx) => {
                            const a = archPreview.agents[idx];
                            if (!a) return null;
                            return <span key={idx} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,0.04)", color: "#a1a1aa" }}>{a.name}</span>;
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {archPreview.exampleMessages && archPreview.exampleMessages.length > 0 && (
              <>
                <SectionTitle text="Example Messages (will trigger AI responses)" />
                {archPreview.exampleMessages.map((em, i) => {
                  const ch = archPreview.channels[em.channelIdx];
                  const from = ch ? archPreview.agents[ch.from] : null;
                  const to = ch ? archPreview.agents[ch.to] : null;
                  if (!from || !to) return null;
                  return (
                    <div key={i} style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 6, padding: "10px 12px", marginBottom: 8 }}>
                      <div style={{ fontSize: 9, color: "#52525b", marginBottom: 4 }}>{from.name} → {to.name}</div>
                      <div style={{ fontSize: 11, color: "#d4d4d8", lineHeight: 1.5 }}>{em.message}</div>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={deployNetwork} style={{
              background: "#fbbf24", color: "#0a0a0f", border: "none",
              padding: "12px 28px", borderRadius: 8, cursor: "pointer",
              fontFamily: "inherit", fontSize: 13, fontWeight: 600,
            }}><GradientIcon icon={Hexagon} size={16} gradient={["#f472b6", "#ec4899"]} /> Deploy Network</button>
            <button onClick={resetArchitect} style={{
              background: "transparent", border: "1px solid rgba(255,255,255,0.08)",
              color: "#71717a", padding: "12px 20px", borderRadius: 8, cursor: "pointer",
              fontFamily: "inherit", fontSize: 12,
            }}>Discard</button>
          </div>
        </div>
      )}

      {/* Deploying Phase */}
      {archPhase === "deploying" && (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div style={{ fontSize: 40, marginBottom: 16, animation: "pulse 1.5s infinite" }}><GradientIcon icon={Hexagon} size={40} gradient={["#f472b6", "#ec4899"]} /></div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 600, color: "#fbbf24", marginBottom: 8 }}>Deploying Mesh Network</div>
          <div style={{ fontSize: 11, color: "#71717a", marginBottom: 20 }}>{deployProgress.step}</div>
          <div style={{ maxWidth: 300, margin: "0 auto", background: "rgba(255,255,255,0.04)", borderRadius: 6, height: 6, overflow: "hidden" }}>
            <div style={{
              height: "100%", background: "#fbbf24", borderRadius: 6,
              width: `${deployProgress.total > 0 ? (deployProgress.count / deployProgress.total) * 100 : 0}%`,
              transition: "width 0.3s",
            }} />
          </div>
          <div style={{ fontSize: 10, color: "#52525b", marginTop: 8 }}>{deployProgress.count} / {deployProgress.total}</div>
        </div>
      )}

      {/* Done Phase */}
      {archPhase === "done" && (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 600, color: "#00e5a0", marginBottom: 8 }}>Network Deployed</div>
          <div style={{ fontSize: 11, color: "#71717a", marginBottom: 24 }}>
            {agents.length} agents · {channels.length} channels · {groups.length} groups · {messages.length} messages
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => setView("network")} style={{ background: "rgba(0,229,160,0.12)", border: "1px solid rgba(0,229,160,0.25)", color: "#00e5a0", padding: "10px 20px", borderRadius: 8, fontFamily: "inherit", fontSize: 11, cursor: "pointer" }}>◈ View Network</button>
            <button onClick={() => setView("ecosystem")} style={{ background: "rgba(56,189,248,0.12)", border: "1px solid rgba(56,189,248,0.25)", color: "#38bdf8", padding: "10px 20px", borderRadius: 8, fontFamily: "inherit", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><Globe size={14} /> Save to Ecosystem</button>
            <button onClick={() => setView("agents")} style={{ background: "rgba(0,229,160,0.08)", border: "1px solid rgba(0,229,160,0.15)", color: "#00e5a0", padding: "10px 20px", borderRadius: 8, fontFamily: "inherit", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><Bot size={14} /> Browse Agents</button>
            <button onClick={resetArchitect} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#71717a", padding: "10px 20px", borderRadius: 8, fontFamily: "inherit", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><Sparkles size={14} /> Build Another</button>
          </div>
        </div>
      )}
    </div>
  );
}
