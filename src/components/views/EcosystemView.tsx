import type { RefObject } from "react";
import type {
  Agent, Channel, Group, Network, Bridge,
  BridgeMessage, BridgeForm, ViewId,
} from "../../types";
import { ROLES, CHANNEL_TYPES } from "../../constants";
import { SectionTitle, PillButton } from "../shared/ui";
import { Globe, ArrowLeftRight, X, Sparkles } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import { EcosystemCanvas } from "../canvas/EcosystemCanvas";
import "../../styles/components/ecosystem.css";

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
      <h2 className="eco-title">
        <GradientIcon icon={Globe} size={18} gradient={["#38bdf8", "#60a5fa"]} /> Ecosystem
      </h2>
      <div className="eco-subtitle">
        Save networks as independent entities. Bridge agents across networks for cross-mesh communication.
      </div>

      {/* Save Current Workspace */}
      {agents.length > 0 && (
        <div className="eco-save-section">
          <SectionTitle text="Save Current Workspace as Network" />
          <div className="eco-save-row">
            <input placeholder="Network name..." value={ecoSaveName} onChange={(e) => setEcoSaveName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveCurrentNetwork()} className="input eco-save-input" />
            <button onClick={saveCurrentNetwork} disabled={!ecoSaveName.trim()} className="btn btn-sm eco-save-btn">Save</button>
            <button onClick={clearWorkspace} className="btn btn-sm eco-clear-btn">Clear Workspace</button>
          </div>
          <div className="eco-save-meta">Snapshots {agents.length} agents, {channels.length} channels, {groups.length} groups</div>
        </div>
      )}

      {/* Saved Networks Grid */}
      {ecosystems.length > 0 && (
        <>
          <SectionTitle text="Networks" />
          <div className="eco-networks-grid">
            {ecosystems.map((net) => (
              <div key={net.id} className="eco-network-card" style={{ borderColor: net.color + "25" }}>
                <div className="eco-network-card__header">
                  <div>
                    <div className="eco-network-card__name" style={{ color: net.color }}><Globe size={14} /> {net.name}</div>
                    <div className="eco-network-card__stats">{net.agents.length} agents · {net.channels.length} ch · {net.groups.length} groups</div>
                  </div>
                  <div className="eco-network-card__dot" style={{ background: net.color, boxShadow: `0 0 8px ${net.color}` }} />
                </div>
                <div className="eco-network-card__did">{net.did}</div>
                <div className="eco-network-card__agents">
                  {net.agents.slice(0, 6).map((a) => {
                    const r = ROLES.find((x) => x.id === a.role);
                    return <span key={a.id} className="eco-agent-badge" style={{ background: (r?.color || "#555") + "12", color: r?.color || "#555" }}>{r?.icon} {a.name}</span>;
                  })}
                  {net.agents.length > 6 && <span className="eco-agent-badge--overflow">+{net.agents.length - 6}</span>}
                </div>
                <div className="eco-network-card__actions">
                  <button onClick={() => loadNetwork(net.id)} className="btn btn-sm eco-load-btn" style={{ background: net.color + "12", borderColor: net.color + "30", color: net.color }}>Load into Workspace</button>
                  <button onClick={() => dissolveNetwork(net.id)} className="btn btn-sm btn-danger">Dissolve</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Bridge Builder */}
      {ecosystems.length >= 2 && (
        <div className="eco-bridge-builder">
          <SectionTitle text="Create Cross-Network Bridge" />
          <div className="eco-bridge-builder__row">
            <div className="eco-bridge-builder__col">
              <div className="eco-bridge-builder__label">SOURCE NETWORK</div>
              <select value={bridgeForm.fromNet} onChange={(e) => setBridgeForm({ ...bridgeForm, fromNet: e.target.value, fromAgent: "" })} className="input eco-select--warning">
                <option value="">Select network…</option>
                {ecosystems.map((n) => <option key={n.id} value={n.id}>{n.name} ({n.agents.length} agents)</option>)}
              </select>
              {bridgeFromNet && (
                <select value={bridgeForm.fromAgent} onChange={(e) => setBridgeForm({ ...bridgeForm, fromAgent: e.target.value })} className="input eco-select--warning-light eco-select--mt">
                  <option value="">Select agent…</option>
                  {bridgeFromNet.agents.map((a) => <option key={a.id} value={a.id}>{a.name} ({ROLES.find((r) => r.id === a.role)?.label})</option>)}
                </select>
              )}
            </div>
            <ArrowLeftRight size={18} color="#fbbf24" className="eco-bridge-builder__arrow" />
            <div className="eco-bridge-builder__col">
              <div className="eco-bridge-builder__label">TARGET NETWORK</div>
              <select value={bridgeForm.toNet} onChange={(e) => setBridgeForm({ ...bridgeForm, toNet: e.target.value, toAgent: "" })} className="input eco-select--warning">
                <option value="">Select network…</option>
                {ecosystems.filter((n) => n.id !== bridgeForm.fromNet).map((n) => <option key={n.id} value={n.id}>{n.name} ({n.agents.length} agents)</option>)}
              </select>
              {bridgeToNet && (
                <select value={bridgeForm.toAgent} onChange={(e) => setBridgeForm({ ...bridgeForm, toAgent: e.target.value })} className="input eco-select--warning-light eco-select--mt">
                  <option value="">Select agent…</option>
                  {bridgeToNet.agents.map((a) => <option key={a.id} value={a.id}>{a.name} ({ROLES.find((r) => r.id === a.role)?.label})</option>)}
                </select>
              )}
            </div>
          </div>
          <div className="eco-bridge-builder__actions">
            <div className="eco-bridge-builder__pills">
              {CHANNEL_TYPES.map((t) => (
                <PillButton key={t.id} active={bridgeForm.type === t.id} activeColor="#fbbf24" onClick={() => setBridgeForm({ ...bridgeForm, type: t.id })}>
                  {t.icon} {t.label}
                </PillButton>
              ))}
            </div>
            <button onClick={createBridge} disabled={!bridgeForm.fromAgent || !bridgeForm.toAgent} className="btn btn-sm eco-bridge-create-btn">Create Bridge</button>
          </div>
        </div>
      )}

      {/* Bridges + Messaging */}
      {bridges.length > 0 && (
        <div className="eco-bridges-layout">
          {/* Bridge list */}
          <div className="eco-bridge-list">
            <SectionTitle text="Active Bridges" />
            {bridges.map((b) => {
              const fNet = ecosystems.find((n) => n.id === b.fromNetworkId);
              const tNet = ecosystems.find((n) => n.id === b.toNetworkId);
              const fA = fNet?.agents.find((a) => a.id === b.fromAgentId);
              const tA = tNet?.agents.find((a) => a.id === b.toAgentId);
              const bmCount = bridgeMessages.filter((m) => m.bridgeId === b.id).length;
              const isSel = selectedBridge === b.id;
              return (
                <div key={b.id} onClick={() => setSelectedBridge(isSel ? null : b.id)} className={`eco-bridge-card${isSel ? " eco-bridge-card--selected" : ""}`}>
                  <div className={`eco-bridge-card__agents${isSel ? " eco-bridge-card__agents--selected" : ""}`}>
                    {fA?.name || "?"} <ArrowLeftRight size={10} color="#fbbf24" /> {tA?.name || "?"}
                  </div>
                  <div className="eco-bridge-card__networks">
                    {fNet?.name} → {tNet?.name}
                    {bmCount > 0 && <span className="eco-bridge-card__msg-count">{bmCount} msgs</span>}
                  </div>
                  <div className="eco-bridge-card__footer">
                    <span className="eco-bridge-card__type-badge">{CHANNEL_TYPES.find((t) => t.id === b.type)?.label || "Data"}</span>
                    <button onClick={(e) => { e.stopPropagation(); removeBridge(b.id); }} className="eco-bridge-card__remove-btn"><X size={10} /></button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bridge message thread */}
          <div className="eco-bridge-thread">
            {selectedBridge && selBridgeFrom && selBridgeTo ? (
              <>
                <div className="eco-bridge-thread__header">
                  <div className="eco-bridge-thread__title">
                    <span style={{ color: ROLES.find((r) => r.id === selBridgeFrom.role)?.color }}>{selBridgeFrom.name}</span>
                    <ArrowLeftRight size={10} color="#fbbf24" className="eco-bridge-thread__arrow" />
                    <span style={{ color: ROLES.find((r) => r.id === selBridgeTo.role)?.color }}>{selBridgeTo.name}</span>
                  </div>
                  <div className="eco-bridge-thread__subtitle">
                    Cross-network bridge · {selBridgeFromNet?.name} → {selBridgeToNet?.name}
                  </div>
                </div>
                <div className="eco-bridge-thread__body">
                  {bridgeMessages.filter((m) => m.bridgeId === selectedBridge).length === 0 && (
                    <div className="eco-bridge-thread__empty">Send a message across the bridge.</div>
                  )}
                  {bridgeMessages.filter((m) => m.bridgeId === selectedBridge).map((m) => {
                    const sRole = ROLES.find((r) => r.id === selBridgeFrom.role);
                    const rRole = ROLES.find((r) => r.id === selBridgeTo.role);
                    return (
                      <div key={m.id} className="eco-bridge-msg">
                        <div className="eco-bridge-msg__row">
                          <div className="eco-bridge-msg__avatar" style={{ background: (sRole?.color || "#555") + "20", borderColor: (sRole?.color || "#555") + "30" }}>{sRole?.icon}</div>
                          <div className="eco-bridge-msg__content">
                            <div className="eco-bridge-msg__sender" style={{ color: sRole?.color }}>{selBridgeFrom.name} <span className="eco-bridge-msg__net-label">({selBridgeFromNet?.name})</span></div>
                            <div className="eco-bridge-msg__bubble">{m.content}</div>
                          </div>
                        </div>
                        {m.status === "sending" && (
                          <div className="eco-bridge-msg__thinking"><span className="eco-bridge-msg__thinking-dot">●</span> {selBridgeTo.name} is thinking across networks…</div>
                        )}
                        {m.response && (
                          <div className="eco-bridge-msg__response-row">
                            <div className="eco-bridge-msg__avatar" style={{ background: (rRole?.color || "#555") + "20", borderColor: (rRole?.color || "#555") + "30" }}>{rRole?.icon}</div>
                            <div className="eco-bridge-msg__content">
                              <div className="eco-bridge-msg__sender" style={{ color: rRole?.color }}>{selBridgeTo.name} <span className="eco-bridge-msg__net-label">({selBridgeToNet?.name})</span> <span className={`eco-bridge-msg__status${m.status === "no-prompt" ? " eco-bridge-msg__status--error" : ""}`}>{m.status === "no-prompt" ? "no prompt" : "response"}</span></div>
                              <div className={`eco-bridge-msg__bubble eco-bridge-msg__bubble--response${m.status === "no-prompt" ? " eco-bridge-msg__bubble--error" : ""}`} style={m.status !== "no-prompt" ? { background: (rRole?.color || "#555") + "08", borderColor: (rRole?.color || "#555") + "15" } : undefined}>{m.response}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div ref={msgEndRef} />
                </div>
                <div className="eco-bridge-thread__input">
                  <div className="eco-bridge-thread__input-row">
                    <input placeholder={`Message ${selBridgeTo.name} across bridge...`} value={bridgeMsgInput} onChange={(e) => setBridgeMsgInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendBridgeMessage()} disabled={bridgeSending} className={`input eco-thread-input${bridgeSending ? " eco-thread-input--disabled" : ""}`} />
                    <button onClick={sendBridgeMessage} disabled={bridgeSending || !bridgeMsgInput.trim()} className="btn btn-sm eco-bridge-send-btn">{bridgeSending ? "…" : "Send"}</button>
                  </div>
                </div>
              </>
            ) : (
              <div className="eco-bridge-thread__placeholder">
                <div className="eco-bridge-thread__placeholder-inner">
                  <div className="eco-bridge-thread__placeholder-icon"><ArrowLeftRight size={28} color="#fbbf24" /></div>
                  <div className="eco-bridge-thread__placeholder-text">Select a bridge to send cross-network messages.</div>
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
          <div className="eco-canvas">
            <EcosystemCanvas networks={ecosystems} bridges={bridges} activeBridges={activeBridges} />
          </div>
        </>
      )}

      {/* Empty state */}
      {ecosystems.length === 0 && agents.length === 0 && (
        <div className="eco-empty">
          <GradientIcon icon={Globe} size={32} gradient={["#38bdf8", "#60a5fa"]} />
          <div className="eco-empty__text">Build networks with the Architect, then save them here to form an ecosystem.</div>
          <button onClick={() => setView("architect")} className="btn eco-empty__btn"><Sparkles size={14} /> Open Architect</button>
        </div>
      )}
    </div>
  );
}
