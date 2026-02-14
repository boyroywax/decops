import type { RefObject } from "react";
import type {
  Agent, Channel, Group, Message, Network, Bridge,
  BridgeMessage, BridgeForm, ViewId,
} from "../../types";
import { ROLES, CHANNEL_TYPES } from "../../constants";
import { inputStyle, SectionTitle, BulkCheckbox, BulkActionBar, PillButton } from "../shared/ui";
import { useBulkSelect } from "../../hooks/useBulkSelect";
import { Globe, ArrowLeftRight, X, Sparkles } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import { EcosystemCanvas } from "../canvas/EcosystemCanvas";

interface EcosystemViewProps {
  agents: Agent[];
  channels: Channel[];
  groups: Group[];
  ecosystems: Network[];
  bridges: Bridge[];
  bridgeMessages: BridgeMessage[];
  activeBridges: Set<string>;
  ecoSaveName: string;
  setEcoSaveName: (v: string) => void;
  bridgeForm: BridgeForm;
  setBridgeForm: (v: BridgeForm) => void;
  selectedBridge: string | null;
  setSelectedBridge: (v: string | null) => void;
  bridgeMsgInput: string;
  setBridgeMsgInput: (v: string) => void;
  bridgeSending: boolean;
  msgEndRef: RefObject<HTMLDivElement | null>;
  selBridgeFrom: Agent | undefined;
  selBridgeTo: Agent | undefined;
  selBridgeFromNet: Network | null | undefined;
  selBridgeToNet: Network | null | undefined;
  bridgeFromNet: Network | null | undefined;
  bridgeToNet: Network | null | undefined;
  saveCurrentNetwork: () => void;
  loadNetwork: (id: string) => void;
  dissolveNetwork: (id: string) => void;
  clearWorkspace: () => void;
  createBridge: () => void;
  removeBridge: (id: string) => void;
  sendBridgeMessage: () => void;
  setView: (v: ViewId) => void;
}

export function EcosystemView({
  agents, channels, groups,
  ecosystems, bridges, bridgeMessages, activeBridges,
  ecoSaveName, setEcoSaveName, bridgeForm, setBridgeForm,
  selectedBridge, setSelectedBridge, bridgeMsgInput, setBridgeMsgInput,
  bridgeSending, msgEndRef,
  selBridgeFrom, selBridgeTo, selBridgeFromNet, selBridgeToNet,
  bridgeFromNet, bridgeToNet,
  saveCurrentNetwork, loadNetwork, dissolveNetwork, clearWorkspace,
  createBridge, removeBridge, sendBridgeMessage, setView,
}: EcosystemViewProps) {
  return (
    <div>
      <h2 style={{ fontFamily: "'Space Grotesky', sans-serif", fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
        <GradientIcon icon={Globe} size={18} gradient={["#38bdf8", "#60a5fa"]} /> Ecosystem
      </h2>
      <div style={{ fontSize: 11, color: "#71717a", marginBottom: 24, lineHeight: 1.6 }}>
        Save networks as independent entities. Bridge agents across networks for cross-mesh communication.
      </div>

      {/* Save Current Workspace */}
      {agents.length > 0 && (
        <div style={{ background: "rgba(56,189,248,0.04)", border: "1px solid rgba(56,189,248,0.12)", borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <SectionTitle text="Save Current Workspace as Network" />
          <div style={{ display: "flex", gap: 10 }}>
            <input placeholder="Network name..." value={ecoSaveName} onChange={(e) => setEcoSaveName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveCurrentNetwork()} style={{ ...inputStyle, border: "1px solid rgba(56,189,248,0.2)" }} />
            <button onClick={saveCurrentNetwork} disabled={!ecoSaveName.trim()} style={{ background: ecoSaveName.trim() ? "#38bdf8" : "#3f3f46", color: "#0a0a0f", border: "none", padding: "10px 20px", borderRadius: 6, cursor: ecoSaveName.trim() ? "pointer" : "not-allowed", fontFamily: "inherit", fontSize: 11, fontWeight: 500, flexShrink: 0 }}>Save</button>
            <button onClick={clearWorkspace} style={{ background: "transparent", border: "1px solid rgba(239,68,68,0.2)", color: "#71717a", padding: "10px 14px", borderRadius: 6, fontFamily: "inherit", fontSize: 10, cursor: "pointer", flexShrink: 0 }}>Clear Workspace</button>
          </div>
          <div style={{ fontSize: 9, color: "#52525b", marginTop: 8 }}>Snapshots {agents.length} agents, {channels.length} channels, {groups.length} groups</div>
        </div>
      )}

      {/* Saved Networks Grid */}
      {ecosystems.length > 0 && (
        <>
          <SectionTitle text="Networks" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12, marginBottom: 24 }}>
            {ecosystems.map((net) => (
              <div key={net.id} style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${net.color}25`, borderRadius: 10, padding: 16, transition: "all 0.2s" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 14, color: net.color, display: "flex", alignItems: "center", gap: 6 }}><Globe size={14} /> {net.name}</div>
                    <div style={{ fontSize: 9, color: "#52525b", marginTop: 2 }}>{net.agents.length} agents · {net.channels.length} ch · {net.groups.length} groups</div>
                  </div>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: net.color, boxShadow: `0 0 8px ${net.color}` }} />
                </div>
                <div style={{ fontSize: 10, color: "#71717a", marginBottom: 8, wordBreak: "break-all" }}>{net.did}</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
                  {net.agents.slice(0, 6).map((a) => {
                    const r = ROLES.find((x) => x.id === a.role);
                    return <span key={a.id} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: (r?.color || "#555") + "12", color: r?.color || "#555" }}>{r?.icon} {a.name}</span>;
                  })}
                  {net.agents.length > 6 && <span style={{ fontSize: 9, padding: "2px 6px", color: "#52525b" }}>+{net.agents.length - 6}</span>}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => loadNetwork(net.id)} style={{ background: net.color + "12", border: `1px solid ${net.color}30`, color: net.color, padding: "5px 12px", borderRadius: 4, fontFamily: "inherit", fontSize: 10, cursor: "pointer" }}>Load into Workspace</button>
                  <button onClick={() => dissolveNetwork(net.id)} style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", color: "#ef4444", padding: "5px 12px", borderRadius: 4, fontFamily: "inherit", fontSize: 10, cursor: "pointer" }}>Dissolve</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Bridge Builder */}
      {ecosystems.length >= 2 && (
        <div style={{ background: "rgba(251,191,36,0.04)", border: "1px solid rgba(251,191,36,0.12)", borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <SectionTitle text="Create Cross-Network Bridge" />
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 9, color: "#52525b", marginBottom: 4 }}>SOURCE NETWORK</div>
              <select value={bridgeForm.fromNet} onChange={(e) => setBridgeForm({ ...bridgeForm, fromNet: e.target.value, fromAgent: "" })} style={{ ...inputStyle, border: "1px solid rgba(251,191,36,0.15)" }}>
                <option value="">Select network…</option>
                {ecosystems.map((n) => <option key={n.id} value={n.id}>{n.name} ({n.agents.length} agents)</option>)}
              </select>
              {bridgeFromNet && (
                <select value={bridgeForm.fromAgent} onChange={(e) => setBridgeForm({ ...bridgeForm, fromAgent: e.target.value })} style={{ ...inputStyle, border: "1px solid rgba(251,191,36,0.1)", marginTop: 6 }}>
                  <option value="">Select agent…</option>
                  {bridgeFromNet.agents.map((a) => <option key={a.id} value={a.id}>{a.name} ({ROLES.find((r) => r.id === a.role)?.label})</option>)}
                </select>
              )}
            </div>
            <ArrowLeftRight size={18} color="#fbbf24" style={{ alignSelf: "center", flexShrink: 0, padding: "12px 0" }} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 9, color: "#52525b", marginBottom: 4 }}>TARGET NETWORK</div>
              <select value={bridgeForm.toNet} onChange={(e) => setBridgeForm({ ...bridgeForm, toNet: e.target.value, toAgent: "" })} style={{ ...inputStyle, border: "1px solid rgba(251,191,36,0.15)" }}>
                <option value="">Select network…</option>
                {ecosystems.filter((n) => n.id !== bridgeForm.fromNet).map((n) => <option key={n.id} value={n.id}>{n.name} ({n.agents.length} agents)</option>)}
              </select>
              {bridgeToNet && (
                <select value={bridgeForm.toAgent} onChange={(e) => setBridgeForm({ ...bridgeForm, toAgent: e.target.value })} style={{ ...inputStyle, border: "1px solid rgba(251,191,36,0.1)", marginTop: 6 }}>
                  <option value="">Select agent…</option>
                  {bridgeToNet.agents.map((a) => <option key={a.id} value={a.id}>{a.name} ({ROLES.find((r) => r.id === a.role)?.label})</option>)}
                </select>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 4 }}>
              {CHANNEL_TYPES.map((t) => (
                <PillButton key={t.id} active={bridgeForm.type === t.id} activeColor="#fbbf24" onClick={() => setBridgeForm({ ...bridgeForm, type: t.id })}>
                  {t.icon} {t.label}
                </PillButton>
              ))}
            </div>
            <button onClick={createBridge} disabled={!bridgeForm.fromAgent || !bridgeForm.toAgent} style={{ background: bridgeForm.fromAgent && bridgeForm.toAgent ? "#fbbf24" : "#3f3f46", color: "#0a0a0f", border: "none", padding: "10px 18px", borderRadius: 6, cursor: bridgeForm.fromAgent && bridgeForm.toAgent ? "pointer" : "not-allowed", fontFamily: "inherit", fontSize: 11, fontWeight: 500 }}>Create Bridge</button>
          </div>
        </div>
      )}

      {/* Bridges + Messaging */}
      {bridges.length > 0 && (
        <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
          {/* Bridge list */}
          <div style={{ width: 260, flexShrink: 0 }}>
            <SectionTitle text="Active Bridges" />
            {bridges.map((b) => {
              const fNet = ecosystems.find((n) => n.id === b.fromNetworkId);
              const tNet = ecosystems.find((n) => n.id === b.toNetworkId);
              const fA = fNet?.agents.find((a) => a.id === b.fromAgentId);
              const tA = tNet?.agents.find((a) => a.id === b.toAgentId);
              const bmCount = bridgeMessages.filter((m) => m.bridgeId === b.id).length;
              const isSel = selectedBridge === b.id;
              return (
                <div key={b.id} onClick={() => setSelectedBridge(isSel ? null : b.id)} style={{ background: isSel ? "rgba(251,191,36,0.08)" : "rgba(255,255,255,0.02)", border: `1px solid ${isSel ? "rgba(251,191,36,0.25)" : "rgba(255,255,255,0.05)"}`, borderRadius: 8, padding: 12, marginBottom: 8, cursor: "pointer", transition: "all 0.15s" }}>
                  <div style={{ fontSize: 11, color: isSel ? "#fbbf24" : "#a1a1aa", marginBottom: 4 }}>
                    {fA?.name || "?"} <ArrowLeftRight size={10} color="#fbbf24" /> {tA?.name || "?"}
                  </div>
                  <div style={{ fontSize: 9, color: "#52525b" }}>
                    {fNet?.name} → {tNet?.name}
                    {bmCount > 0 && <span style={{ color: "#fbbf24", marginLeft: 6 }}>{bmCount} msgs</span>}
                  </div>
                  <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                    <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "rgba(251,191,36,0.08)", color: "#fbbf24" }}>{CHANNEL_TYPES.find((t) => t.id === b.type)?.label || "Data"}</span>
                    <button onClick={(e) => { e.stopPropagation(); removeBridge(b.id); }} style={{ background: "transparent", border: "1px solid rgba(239,68,68,0.15)", color: "#71717a", padding: "2px 8px", borderRadius: 3, fontFamily: "inherit", fontSize: 9, cursor: "pointer", marginLeft: "auto", display: "flex", alignItems: "center" }}><X size={10} /></button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bridge message thread */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "rgba(0,0,0,0.2)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)", overflow: "hidden", maxHeight: 500 }}>
            {selectedBridge && selBridgeFrom && selBridgeTo ? (
              <>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.2)" }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>
                    <span style={{ color: ROLES.find((r) => r.id === selBridgeFrom.role)?.color }}>{selBridgeFrom.name}</span>
                    <ArrowLeftRight size={10} color="#fbbf24" style={{ margin: "0 8px" }} />
                    <span style={{ color: ROLES.find((r) => r.id === selBridgeTo.role)?.color }}>{selBridgeTo.name}</span>
                  </div>
                  <div style={{ fontSize: 9, color: "#52525b", marginTop: 3 }}>
                    Cross-network bridge · {selBridgeFromNet?.name} → {selBridgeToNet?.name}
                  </div>
                </div>
                <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
                  {bridgeMessages.filter((m) => m.bridgeId === selectedBridge).length === 0 && (
                    <div style={{ textAlign: "center", padding: 30, color: "#3f3f46", fontSize: 11 }}>Send a message across the bridge.</div>
                  )}
                  {bridgeMessages.filter((m) => m.bridgeId === selectedBridge).map((m) => {
                    const sRole = ROLES.find((r) => r.id === selBridgeFrom.role);
                    const rRole = ROLES.find((r) => r.id === selBridgeTo.role);
                    return (
                      <div key={m.id} style={{ marginBottom: 16 }}>
                        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                          <div style={{ width: 26, height: 26, borderRadius: 6, background: (sRole?.color || "#555") + "20", border: `1px solid ${sRole?.color || "#555"}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>{sRole?.icon}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 9, color: sRole?.color, marginBottom: 3 }}>{selBridgeFrom.name} <span style={{ color: "#3f3f46", fontSize: 8 }}>({selBridgeFromNet?.name})</span></div>
                            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "2px 10px 10px 10px", padding: "10px 14px", fontSize: 11, lineHeight: 1.6, color: "#d4d4d8" }}>{m.content}</div>
                          </div>
                        </div>
                        {m.status === "sending" && (
                          <div style={{ paddingLeft: 34, fontSize: 10, color: "#fbbf24" }}><span style={{ animation: "pulse 1.5s infinite" }}>●</span> {selBridgeTo.name} is thinking across networks…</div>
                        )}
                        {m.response && (
                          <div style={{ display: "flex", gap: 8, paddingLeft: 34 }}>
                            <div style={{ width: 26, height: 26, borderRadius: 6, background: (rRole?.color || "#555") + "20", border: `1px solid ${rRole?.color || "#555"}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>{rRole?.icon}</div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 9, color: rRole?.color, marginBottom: 3 }}>{selBridgeTo.name} <span style={{ color: "#3f3f46", fontSize: 8 }}>({selBridgeToNet?.name})</span> <span style={{ color: m.status === "no-prompt" ? "#ef4444" : "#3f3f46", fontSize: 8 }}>{m.status === "no-prompt" ? "no prompt" : "response"}</span></div>
                              <div style={{ background: m.status === "no-prompt" ? "rgba(239,68,68,0.05)" : (rRole?.color || "#555") + "08", border: `1px solid ${m.status === "no-prompt" ? "rgba(239,68,68,0.15)" : (rRole?.color || "#555") + "15"}`, borderRadius: "10px 2px 10px 10px", padding: "10px 14px", fontSize: 11, lineHeight: 1.6, color: m.status === "no-prompt" ? "#71717a" : "#d4d4d8", whiteSpace: "pre-wrap" }}>{m.response}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div ref={msgEndRef} />
                </div>
                <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.15)" }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input placeholder={`Message ${selBridgeTo.name} across bridge...`} value={bridgeMsgInput} onChange={(e) => setBridgeMsgInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendBridgeMessage()} disabled={bridgeSending} style={{ ...inputStyle, border: "1px solid rgba(251,191,36,0.15)", opacity: bridgeSending ? 0.5 : 1 }} />
                    <button onClick={sendBridgeMessage} disabled={bridgeSending || !bridgeMsgInput.trim()} style={{ background: bridgeSending ? "#3f3f46" : "#fbbf24", color: "#0a0a0f", border: "none", padding: "10px 16px", borderRadius: 6, cursor: bridgeSending ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 500, flexShrink: 0 }}>{bridgeSending ? "…" : "Send"}</button>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#3f3f46" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}><ArrowLeftRight size={28} color="#fbbf24" /></div>
                  <div style={{ fontSize: 11 }}>Select a bridge to send cross-network messages.</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ecosystem Topology Canvas */}
      {ecosystems.length >= 2 && (
        <>
          <SectionTitle text="Ecosystem Topology" />
          <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(56,189,248,0.08)", borderRadius: 12, height: 350, overflow: "hidden" }}>
            <EcosystemCanvas networks={ecosystems} bridges={bridges} activeBridges={activeBridges} />
          </div>
        </>
      )}

      {/* Empty state */}
      {ecosystems.length === 0 && agents.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: "#3f3f46", border: "1px dashed rgba(56,189,248,0.1)", borderRadius: 12 }}>
          <GradientIcon icon={Globe} size={32} gradient={["#38bdf8", "#60a5fa"]} />
          <div style={{ fontSize: 12, marginBottom: 16 }}>Build networks with the Architect, then save them here to form an ecosystem.</div>
          <button onClick={() => setView("architect")} style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.25)", color: "#fbbf24", padding: "10px 20px", borderRadius: 8, fontFamily: "inherit", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><Sparkles size={14} /> Open Architect</button>
        </div>
      )}
    </div>
  );
}
