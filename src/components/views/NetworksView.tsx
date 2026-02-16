import { useState } from "react";
import type {
  Agent, Channel, Group, Network, Bridge,
  BridgeMessage, BridgeForm, ViewId, ChannelTypeId,
} from "../../types";
import { ROLES, CHANNEL_TYPES } from "../../constants";
import { inputStyle, SectionTitle, PillButton } from "../shared/ui";
import {
  Globe, Plus, ArrowLeftRight, X, Sparkles,
  Trash2, Download, Layers, Link2,
  ChevronDown, ChevronUp, Zap,
} from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import { EcosystemCanvas } from "../canvas/EcosystemCanvas";

interface NetworksViewProps {
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
  bridgeFromNet: Network | null | undefined;
  bridgeToNet: Network | null | undefined;
  saveCurrentNetwork: () => void;
  loadNetwork: (id: string) => void;
  dissolveNetwork: (id: string) => void;
  clearWorkspace: () => void;
  createBridge: () => void;
  removeBridge: (id: string) => void;
  setView: (v: ViewId) => void;
  addJob: (job: any) => void;
}

type ManagerTab = "networks" | "bridges" | "topology";

export function NetworksView({
  agents, channels, groups,
  ecosystems, bridges, bridgeMessages, activeBridges,
  ecoSaveName, setEcoSaveName, bridgeForm, setBridgeForm,
  bridgeFromNet, bridgeToNet,
  saveCurrentNetwork, loadNetwork, dissolveNetwork, clearWorkspace,
  createBridge, removeBridge, setView,
  addJob,
}: NetworksViewProps) {
  const [activeTab, setActiveTab] = useState<ManagerTab>("networks");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBridgeBuilder, setShowBridgeBuilder] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createWithArchitect, setCreateWithArchitect] = useState(false);
  const [architectPrompt, setArchitectPrompt] = useState("");
  const [expandedNetwork, setExpandedNetwork] = useState<string | null>(null);

  const tabs: { id: ManagerTab; label: string; icon: any; count?: number }[] = [
    { id: "networks", label: "Networks", icon: Globe, count: ecosystems.length },
    { id: "bridges", label: "Bridges", icon: Link2, count: bridges.length },
    { id: "topology", label: "Topology", icon: Layers },
  ];

  const handleCreateNetwork = () => {
    if (createWithArchitect && architectPrompt.trim()) {
      // Create network via Architect prompt
      addJob({
        type: "create_network",
        request: {
          name: createName.trim() || "New Network",
          description: createDesc.trim(),
          architectPrompt: architectPrompt.trim(),
        },
      });
    } else if (agents.length > 0 && createName.trim()) {
      // Save current workspace as a network
      setEcoSaveName(createName.trim());
      // We need to call saveCurrentNetwork after setting the name
      // Since saveCurrentNetwork reads ecoSaveName, let's use addJob directly
      addJob({
        type: "save_ecosystem",
        request: { name: createName.trim() },
      });
    }
    setShowCreateModal(false);
    setCreateName("");
    setCreateDesc("");
    setArchitectPrompt("");
    setCreateWithArchitect(false);
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h2 style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 20,
            fontWeight: 700,
            marginBottom: 4,
            display: "flex",
            alignItems: "center",
            gap: 10,
            letterSpacing: "-0.01em",
          }}>
            <GradientIcon icon={Globe} size={20} gradient={["#38bdf8", "#60a5fa"]} />
            Network Manager
          </h2>
          <p style={{ fontSize: 12, color: "#71717a", margin: 0, lineHeight: 1.6 }}>
            Create and manage isolated networks. Bridge agents across networks for cross-mesh communication.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            background: "linear-gradient(135deg, #38bdf8 0%, #60a5fa 100%)",
            border: "none",
            color: "#0a0a0f",
            padding: "10px 20px",
            borderRadius: 8,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 12,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
          }}
        >
          <Plus size={14} strokeWidth={2.5} /> New Network
        </button>
      </div>

      {/* Tab Bar */}
      <div style={{
        display: "flex",
        gap: 2,
        marginBottom: 20,
        background: "rgba(0,0,0,0.2)",
        borderRadius: 10,
        padding: 3,
        border: "1px solid rgba(255,255,255,0.04)",
      }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              background: activeTab === tab.id ? "rgba(56,189,248,0.1)" : "transparent",
              border: activeTab === tab.id ? "1px solid rgba(56,189,248,0.2)" : "1px solid transparent",
              color: activeTab === tab.id ? "#38bdf8" : "#71717a",
              padding: "8px 16px",
              borderRadius: 8,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 11,
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              transition: "all 0.15s",
            }}
          >
            <tab.icon size={13} />
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span style={{
                fontSize: 9,
                background: activeTab === tab.id ? "rgba(56,189,248,0.2)" : "rgba(255,255,255,0.06)",
                color: activeTab === tab.id ? "#38bdf8" : "#52525b",
                padding: "1px 6px",
                borderRadius: 8,
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Networks Tab */}
      {activeTab === "networks" && (
        <div style={{ flex: 1, overflow: "auto" }}>
          {/* Save Current Workspace Section */}
          {agents.length > 0 && (
            <div style={{
              background: "rgba(56,189,248,0.03)",
              border: "1px solid rgba(56,189,248,0.1)",
              borderRadius: 12,
              padding: 16,
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: "rgba(56,189,248,0.08)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <Download size={18} color="#38bdf8" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "#e4e4e7", marginBottom: 2 }}>Save Active Workspace as Network</div>
                <div style={{ fontSize: 10, color: "#52525b" }}>
                  Snapshot {agents.length} agents, {channels.length} channels, {groups.length} groups
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  placeholder="Network name..."
                  value={ecoSaveName}
                  onChange={(e) => setEcoSaveName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveCurrentNetwork()}
                  style={{
                    ...inputStyle,
                    border: "1px solid rgba(56,189,248,0.15)",
                    width: 200,
                  }}
                />
                <button
                  onClick={saveCurrentNetwork}
                  disabled={!ecoSaveName.trim()}
                  style={{
                    background: ecoSaveName.trim() ? "#38bdf8" : "#3f3f46",
                    color: "#0a0a0f",
                    border: "none",
                    padding: "8px 16px",
                    borderRadius: 6,
                    cursor: ecoSaveName.trim() ? "pointer" : "not-allowed",
                    fontFamily: "inherit",
                    fontSize: 11,
                    fontWeight: 500,
                    flexShrink: 0,
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {/* Network Cards Grid */}
          {ecosystems.length > 0 ? (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 16,
            }}>
              {ecosystems.map((net) => {
                const isExpanded = expandedNetwork === net.id;
                const netBridges = bridges.filter(
                  (b) => b.fromNetworkId === net.id || b.toNetworkId === net.id
                );
                return (
                  <div
                    key={net.id}
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: `1px solid ${net.color}20`,
                      borderRadius: 14,
                      overflow: "hidden",
                      transition: "all 0.2s",
                    }}
                  >
                    {/* Card Header */}
                    <div style={{ padding: 18 }}>
                      <div style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: 12,
                      }}>
                        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                          <div style={{
                            width: 38, height: 38, borderRadius: 10,
                            background: `${net.color}15`,
                            border: `1px solid ${net.color}30`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            <Globe size={18} color={net.color} />
                          </div>
                          <div>
                            <div style={{
                              fontFamily: "'Space Grotesk', sans-serif",
                              fontWeight: 600,
                              fontSize: 14,
                              color: "#e4e4e7",
                            }}>
                              {net.name}
                            </div>
                            <div style={{ fontSize: 9, color: "#52525b", marginTop: 2 }}>
                              {net.agents.length} agents · {net.channels.length} ch · {net.groups.length} groups
                              {netBridges.length > 0 && <span style={{ color: "#fbbf24" }}> · {netBridges.length} bridges</span>}
                            </div>
                          </div>
                        </div>
                        <div style={{
                          width: 10, height: 10, borderRadius: "50%",
                          background: net.color,
                          boxShadow: `0 0 10px ${net.color}60`,
                        }} />
                      </div>

                      {/* Agent pills */}
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
                        {net.agents.slice(0, 5).map((a) => {
                          const r = ROLES.find((x) => x.id === a.role);
                          return (
                            <span
                              key={a.id}
                              style={{
                                fontSize: 9,
                                padding: "3px 8px",
                                borderRadius: 4,
                                background: (r?.color || "#555") + "10",
                                color: r?.color || "#555",
                                border: `1px solid ${(r?.color || "#555")}15`,
                              }}
                            >
                              {r?.char} {a.name}
                            </span>
                          );
                        })}
                        {net.agents.length > 5 && (
                          <span style={{ fontSize: 9, padding: "3px 8px", color: "#52525b" }}>
                            +{net.agents.length - 5}
                          </span>
                        )}
                      </div>

                      {/* DID */}
                      <div style={{ fontSize: 9, color: "#3f3f46", fontFamily: "monospace", marginBottom: 12, wordBreak: "break-all" }}>
                        {net.did}
                      </div>

                      {/* Actions */}
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => loadNetwork(net.id)}
                          style={{
                            background: `${net.color}10`,
                            border: `1px solid ${net.color}25`,
                            color: net.color,
                            padding: "6px 14px",
                            borderRadius: 6,
                            fontFamily: "inherit",
                            fontSize: 10,
                            cursor: "pointer",
                            fontWeight: 500,
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Download size={11} /> Load
                        </button>
                        <button
                          onClick={() => setExpandedNetwork(isExpanded ? null : net.id)}
                          style={{
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.06)",
                            color: "#71717a",
                            padding: "6px 10px",
                            borderRadius: 6,
                            fontFamily: "inherit",
                            fontSize: 10,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 3,
                          }}
                        >
                          {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                          Details
                        </button>
                        <button
                          onClick={() => dissolveNetwork(net.id)}
                          style={{
                            background: "rgba(239,68,68,0.06)",
                            border: "1px solid rgba(239,68,68,0.12)",
                            color: "#71717a",
                            padding: "6px 10px",
                            borderRadius: 6,
                            fontFamily: "inherit",
                            fontSize: 10,
                            cursor: "pointer",
                            marginLeft: "auto",
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>

                    {/* Expanded Detail */}
                    {isExpanded && (
                      <div style={{
                        borderTop: `1px solid ${net.color}15`,
                        padding: 16,
                        background: "rgba(0,0,0,0.15)",
                      }}>
                        <div style={{ fontSize: 10, color: "#71717a", marginBottom: 8, fontWeight: 500 }}>AGENTS</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
                          {net.agents.map((a) => {
                            const r = ROLES.find((x) => x.id === a.role);
                            return (
                              <div key={a.id} style={{
                                display: "flex", alignItems: "center", gap: 8,
                                fontSize: 11, color: "#a1a1aa",
                                padding: "4px 8px",
                                background: "rgba(255,255,255,0.02)",
                                borderRadius: 4,
                              }}>
                                <span style={{ color: r?.color }}>{r?.icon}</span>
                                <span>{a.name}</span>
                                <span style={{ fontSize: 9, color: "#52525b", marginLeft: "auto" }}>{r?.label}</span>
                              </div>
                            );
                          })}
                        </div>

                        {net.channels.length > 0 && (
                          <>
                            <div style={{ fontSize: 10, color: "#71717a", marginBottom: 8, fontWeight: 500 }}>CHANNELS ({net.channels.length})</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
                              {net.channels.map((ch) => {
                                const t = CHANNEL_TYPES.find((x) => x.id === ch.type);
                                const fromA = net.agents.find((a) => a.id === ch.from);
                                const toA = net.agents.find((a) => a.id === ch.to);
                                return (
                                  <span key={ch.id} style={{
                                    fontSize: 9, padding: "3px 8px", borderRadius: 4,
                                    background: "rgba(167,139,250,0.06)",
                                    color: "#a78bfa",
                                    border: "1px solid rgba(167,139,250,0.12)",
                                  }}>
                                    {fromA?.name} → {toA?.name} ({t?.label})
                                  </span>
                                );
                              })}
                            </div>
                          </>
                        )}

                        {netBridges.length > 0 && (
                          <>
                            <div style={{ fontSize: 10, color: "#71717a", marginBottom: 8, fontWeight: 500 }}>BRIDGES ({netBridges.length})</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {netBridges.map((b) => {
                                const otherNet = ecosystems.find((n) =>
                                  n.id === (b.fromNetworkId === net.id ? b.toNetworkId : b.fromNetworkId)
                                );
                                return (
                                  <span key={b.id} style={{
                                    fontSize: 9, padding: "3px 8px", borderRadius: 4,
                                    background: "rgba(251,191,36,0.06)",
                                    color: "#fbbf24",
                                    border: "1px solid rgba(251,191,36,0.12)",
                                  }}>
                                    <Link2 size={9} /> ↔ {otherNet?.name || "?"}
                                  </span>
                                );
                              })}
                            </div>
                          </>
                        )}

                        <div style={{ fontSize: 9, color: "#3f3f46", marginTop: 8 }}>
                          Created {new Date(net.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Empty state */
            <div style={{
              textAlign: "center",
              padding: 60,
              color: "#3f3f46",
              border: "1px dashed rgba(56,189,248,0.12)",
              borderRadius: 14,
            }}>
              <div style={{ marginBottom: 16 }}>
                <GradientIcon icon={Globe} size={36} gradient={["#38bdf8", "#60a5fa"]} />
              </div>
              <div style={{ fontSize: 13, color: "#71717a", fontWeight: 500, marginBottom: 8 }}>
                No networks yet
              </div>
              <div style={{ fontSize: 11, color: "#52525b", marginBottom: 20, maxWidth: 360, margin: "0 auto 20px" }}>
                Create a network using the Architect, or save your current workspace agents as a network snapshot.
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button
                  onClick={() => setShowCreateModal(true)}
                  style={{
                    background: "rgba(56,189,248,0.1)",
                    border: "1px solid rgba(56,189,248,0.2)",
                    color: "#38bdf8",
                    padding: "10px 20px",
                    borderRadius: 8,
                    fontFamily: "inherit",
                    fontSize: 11,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Plus size={14} /> Create Network
                </button>
                <button
                  onClick={() => setView("architect")}
                  style={{
                    background: "rgba(251,191,36,0.1)",
                    border: "1px solid rgba(251,191,36,0.2)",
                    color: "#fbbf24",
                    padding: "10px 20px",
                    borderRadius: 8,
                    fontFamily: "inherit",
                    fontSize: 11,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Sparkles size={14} /> Open Architect
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bridges Tab */}
      {activeTab === "bridges" && (
        <div style={{ flex: 1, overflow: "auto" }}>
          {/* Create Bridge CTA */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 12, color: "#a1a1aa" }}>
              Bridges connect agents across different networks. Bridges are a channel type ({`p2p → bridge`}).
            </div>
            {ecosystems.length >= 2 && (
              <button
                onClick={() => setShowBridgeBuilder(!showBridgeBuilder)}
                style={{
                  background: showBridgeBuilder ? "rgba(251,191,36,0.1)" : "rgba(251,191,36,0.06)",
                  border: `1px solid ${showBridgeBuilder ? "rgba(251,191,36,0.3)" : "rgba(251,191,36,0.15)"}`,
                  color: "#fbbf24",
                  padding: "8px 16px",
                  borderRadius: 8,
                  fontFamily: "inherit",
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexShrink: 0,
                }}
              >
                <Link2 size={13} /> {showBridgeBuilder ? "Hide Builder" : "New Bridge"}
              </button>
            )}
          </div>

          {/* Bridge Builder */}
          {showBridgeBuilder && ecosystems.length >= 2 && (
            <div style={{
              background: "rgba(251,191,36,0.03)",
              border: "1px solid rgba(251,191,36,0.1)",
              borderRadius: 14,
              padding: 18,
              marginBottom: 20,
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#e4e4e7", marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
                <GradientIcon icon={Link2} size={14} gradient={["#fbbf24", "#fb923c"]} />
                Bridge Builder
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 14 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 9, color: "#52525b", marginBottom: 4, fontWeight: 600, letterSpacing: "0.05em" }}>SOURCE NETWORK</div>
                  <select
                    value={bridgeForm.fromNet}
                    onChange={(e) => setBridgeForm({ ...bridgeForm, fromNet: e.target.value, fromAgent: "" })}
                    style={{ ...inputStyle, border: "1px solid rgba(251,191,36,0.15)" }}
                  >
                    <option value="">Select network…</option>
                    {ecosystems.map((n) => (
                      <option key={n.id} value={n.id}>{n.name} ({n.agents.length} agents)</option>
                    ))}
                  </select>
                  {bridgeFromNet && (
                    <select
                      value={bridgeForm.fromAgent}
                      onChange={(e) => setBridgeForm({ ...bridgeForm, fromAgent: e.target.value })}
                      style={{ ...inputStyle, border: "1px solid rgba(251,191,36,0.1)", marginTop: 6 }}
                    >
                      <option value="">Select agent…</option>
                      {bridgeFromNet.agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({ROLES.find((r) => r.id === a.role)?.label})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div style={{ alignSelf: "center", flexShrink: 0, padding: "10px 0" }}>
                  <ArrowLeftRight size={18} color="#fbbf24" />
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 9, color: "#52525b", marginBottom: 4, fontWeight: 600, letterSpacing: "0.05em" }}>TARGET NETWORK</div>
                  <select
                    value={bridgeForm.toNet}
                    onChange={(e) => setBridgeForm({ ...bridgeForm, toNet: e.target.value, toAgent: "" })}
                    style={{ ...inputStyle, border: "1px solid rgba(251,191,36,0.15)" }}
                  >
                    <option value="">Select network…</option>
                    {ecosystems.filter((n) => n.id !== bridgeForm.fromNet).map((n) => (
                      <option key={n.id} value={n.id}>{n.name} ({n.agents.length} agents)</option>
                    ))}
                  </select>
                  {bridgeToNet && (
                    <select
                      value={bridgeForm.toAgent}
                      onChange={(e) => setBridgeForm({ ...bridgeForm, toAgent: e.target.value })}
                      style={{ ...inputStyle, border: "1px solid rgba(251,191,36,0.1)", marginTop: 6 }}
                    >
                      <option value="">Select agent…</option>
                      {bridgeToNet.agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({ROLES.find((r) => r.id === a.role)?.label})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ display: "flex", gap: 4 }}>
                  {CHANNEL_TYPES.map((t) => (
                    <PillButton
                      key={t.id}
                      active={bridgeForm.type === t.id}
                      activeColor="#fbbf24"
                      onClick={() => setBridgeForm({ ...bridgeForm, type: t.id })}
                    >
                      {t.icon} {t.label}
                    </PillButton>
                  ))}
                </div>
                <button
                  onClick={() => { createBridge(); setShowBridgeBuilder(false); }}
                  disabled={!bridgeForm.fromAgent || !bridgeForm.toAgent}
                  style={{
                    background: bridgeForm.fromAgent && bridgeForm.toAgent ? "#fbbf24" : "#3f3f46",
                    color: "#0a0a0f",
                    border: "none",
                    padding: "10px 18px",
                    borderRadius: 6,
                    cursor: bridgeForm.fromAgent && bridgeForm.toAgent ? "pointer" : "not-allowed",
                    fontFamily: "inherit",
                    fontSize: 11,
                    fontWeight: 600,
                    marginLeft: "auto",
                  }}
                >
                  Create Bridge
                </button>
              </div>
              <div style={{ fontSize: 9, color: "#52525b", marginTop: 8 }}>
                Bridge channels appear as cross-network connections (mode: bridge)
              </div>
            </div>
          )}

          {/* Bridge List */}
          {bridges.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {bridges.map((b) => {
                const fNet = ecosystems.find((n) => n.id === b.fromNetworkId);
                const tNet = ecosystems.find((n) => n.id === b.toNetworkId);
                const fA = fNet?.agents.find((a) => a.id === b.fromAgentId);
                const tA = tNet?.agents.find((a) => a.id === b.toAgentId);
                const bmCount = bridgeMessages.filter((m) => m.bridgeId === b.id).length;
                return (
                  <div
                    key={b.id}
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.05)",
                      borderRadius: 10,
                      padding: 14,
                      transition: "all 0.15s",
                    }}
                  >
                    <div style={{ fontSize: 12, color: "#a1a1aa", marginBottom: 4, fontWeight: 500 }}>
                      {fA?.name || "?"} <ArrowLeftRight size={10} color="#fbbf24" style={{ margin: "0 4px" }} /> {tA?.name || "?"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#52525b" }}>
                      <span style={{ color: fNet?.color }}>{fNet?.name}</span>
                      <span>→</span>
                      <span style={{ color: tNet?.color }}>{tNet?.name}</span>
                      {bmCount > 0 && <span style={{ color: "#38bdf8", marginLeft: 6 }}>{bmCount} msgs</span>}
                    </div>
                    <div style={{ display: "flex", gap: 4, marginTop: 8, alignItems: "center" }}>
                      <span style={{
                        fontSize: 9, padding: "2px 8px", borderRadius: 4,
                        background: "rgba(56,189,248,0.06)", color: "#38bdf8",
                        border: "1px solid rgba(56,189,248,0.1)",
                      }}>
                        bridge
                      </span>
                      <span style={{
                        fontSize: 9, padding: "2px 8px", borderRadius: 4,
                        background: "rgba(251,191,36,0.06)", color: "#fbbf24",
                      }}>
                        {CHANNEL_TYPES.find((t) => t.id === b.type)?.label || "Data"}
                      </span>
                      <button
                        onClick={() => removeBridge(b.id)}
                        style={{
                          background: "transparent",
                          border: "1px solid rgba(239,68,68,0.12)",
                          color: "#52525b",
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontFamily: "inherit",
                          fontSize: 9,
                          cursor: "pointer",
                          marginLeft: "auto",
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        <X size={10} />
                      </button>
                    </div>
                    <div style={{ fontSize: 9, color: "#3f3f46", marginTop: 8, fontStyle: "italic" }}>
                      Send messages via the Messages page
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{
              textAlign: "center",
              padding: 50,
              color: "#3f3f46",
              border: "1px dashed rgba(251,191,36,0.1)",
              borderRadius: 14,
            }}>
              <Link2 size={28} color="#3f3f46" style={{ marginBottom: 8 }} />
              <div style={{ fontSize: 12, marginBottom: 8, color: "#52525b" }}>No bridges yet</div>
              <div style={{ fontSize: 11, color: "#3f3f46", maxWidth: 300, margin: "0 auto" }}>
                {ecosystems.length < 2
                  ? "You need at least 2 saved networks to create bridges between them."
                  : "Create a bridge to connect agents across different networks."}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Topology Tab */}
      {activeTab === "topology" && (
        <div style={{ flex: 1 }}>
          {ecosystems.length >= 2 ? (
            <div style={{
              background: "rgba(0,0,0,0.3)",
              border: "1px solid rgba(56,189,248,0.08)",
              borderRadius: 14,
              height: "calc(100vh - 260px)",
              overflow: "hidden",
            }}>
              <EcosystemCanvas networks={ecosystems} bridges={bridges} activeBridges={activeBridges} />
            </div>
          ) : (
            <div style={{
              textAlign: "center",
              padding: 60,
              color: "#3f3f46",
              border: "1px dashed rgba(56,189,248,0.1)",
              borderRadius: 14,
              height: 300,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <div>
                <Layers size={28} color="#3f3f46" style={{ marginBottom: 8 }} />
                <div style={{ fontSize: 12, marginBottom: 8, color: "#52525b" }}>
                  Topology requires at least 2 networks
                </div>
                <div style={{ fontSize: 11, color: "#3f3f46" }}>
                  Save or create networks to visualize the ecosystem topology.
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Network Modal */}
      {showCreateModal && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.8)",
          backdropFilter: "blur(6px)",
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          animation: "fadeIn 0.2s",
        }}>
          <div style={{
            width: 500,
            background: "#18181b",
            border: "1px solid rgba(56,189,248,0.15)",
            borderRadius: 18,
            padding: 32,
            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h3 style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 600,
                color: "#e4e4e7",
                fontFamily: "'Space Grotesk', sans-serif",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
                <GradientIcon icon={Globe} size={20} gradient={["#38bdf8", "#60a5fa"]} />
                Create Network
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 6,
                  color: "#52525b",
                  cursor: "pointer",
                  width: 28, height: 28,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, color: "#a1a1aa", marginBottom: 6, fontWeight: 500 }}>
                  Network Name
                </label>
                <input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g., Research Cluster Alpha"
                  autoFocus
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(56,189,248,0.12)",
                    borderRadius: 8,
                    color: "white",
                    outline: "none",
                    fontSize: 13,
                    fontFamily: "inherit",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, color: "#a1a1aa", marginBottom: 6, fontWeight: 500 }}>
                  Description (Optional)
                </label>
                <input
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  placeholder="Describe what this network does..."
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 8,
                    color: "white",
                    outline: "none",
                    fontSize: 13,
                    fontFamily: "inherit",
                  }}
                />
              </div>

              {/* Architect Toggle */}
              <div
                onClick={() => setCreateWithArchitect(!createWithArchitect)}
                style={{
                  background: createWithArchitect ? "rgba(251,191,36,0.06)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${createWithArchitect ? "rgba(251,191,36,0.2)" : "rgba(255,255,255,0.06)"}`,
                  borderRadius: 10,
                  padding: 14,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: createWithArchitect ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.04)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Sparkles size={16} color={createWithArchitect ? "#fbbf24" : "#52525b"} />
                  </div>
                  <div>
                    <div style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: createWithArchitect ? "#fbbf24" : "#a1a1aa",
                    }}>
                      Create with Architect
                    </div>
                    <div style={{ fontSize: 10, color: "#52525b" }}>
                      Describe your network and let AI generate agents, channels, and groups
                    </div>
                  </div>
                  <div style={{
                    marginLeft: "auto",
                    width: 36, height: 20, borderRadius: 10,
                    background: createWithArchitect ? "#fbbf24" : "rgba(255,255,255,0.08)",
                    padding: 2,
                    transition: "all 0.2s",
                    display: "flex",
                    alignItems: createWithArchitect ? "center" : "center",
                    justifyContent: createWithArchitect ? "flex-end" : "flex-start",
                  }}>
                    <div style={{
                      width: 16, height: 16, borderRadius: "50%",
                      background: createWithArchitect ? "#0a0a0f" : "#52525b",
                      transition: "all 0.2s",
                    }} />
                  </div>
                </div>
              </div>

              {/* Architect Prompt */}
              {createWithArchitect && (
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "#fbbf24", marginBottom: 6, fontWeight: 500 }}>
                    <Sparkles size={11} style={{ marginRight: 4 }} />
                    Architect Prompt
                  </label>
                  <textarea
                    value={architectPrompt}
                    onChange={(e) => setArchitectPrompt(e.target.value)}
                    placeholder="e.g., Create a DeFi security audit team with 4 agents specialized in smart contract analysis, on-chain forensics, governance review, and reporting..."
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      background: "rgba(0,0,0,0.3)",
                      border: "1px solid rgba(251,191,36,0.15)",
                      borderRadius: 8,
                      color: "white",
                      outline: "none",
                      minHeight: 100,
                      resize: "none",
                      fontSize: 12,
                      fontFamily: "inherit",
                      lineHeight: 1.5,
                    }}
                  />
                </div>
              )}

              {/* Save current notice */}
              {!createWithArchitect && agents.length > 0 && (
                <div style={{
                  fontSize: 10,
                  color: "#52525b",
                  background: "rgba(56,189,248,0.04)",
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid rgba(56,189,248,0.08)",
                }}>
                  This will save your current workspace ({agents.length} agents, {channels.length} channels, {groups.length} groups) as a new network.
                </div>
              )}

              {!createWithArchitect && agents.length === 0 && (
                <div style={{
                  fontSize: 10,
                  color: "#ef4444",
                  background: "rgba(239,68,68,0.04)",
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid rgba(239,68,68,0.08)",
                }}>
                  No agents in workspace. Use the Architect toggle above to generate a network, or create agents first.
                </div>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                <button
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    flex: 1,
                    padding: "12px",
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "#a1a1aa",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontWeight: 500,
                    fontSize: 13,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateNetwork}
                  disabled={
                    createWithArchitect
                      ? !architectPrompt.trim()
                      : (!createName.trim() || agents.length === 0)
                  }
                  style={{
                    flex: 1,
                    padding: "12px",
                    background:
                      (createWithArchitect ? architectPrompt.trim() : (createName.trim() && agents.length > 0))
                        ? "linear-gradient(135deg, #38bdf8 0%, #60a5fa 100%)"
                        : "rgba(255,255,255,0.06)",
                    border: "none",
                    color:
                      (createWithArchitect ? architectPrompt.trim() : (createName.trim() && agents.length > 0))
                        ? "#0a0a0f"
                        : "rgba(255,255,255,0.2)",
                    fontWeight: 600,
                    borderRadius: 8,
                    cursor:
                      (createWithArchitect ? architectPrompt.trim() : (createName.trim() && agents.length > 0))
                        ? "pointer"
                        : "not-allowed",
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  {createWithArchitect ? <><Sparkles size={14} /> Generate Network</> : <><Plus size={14} /> Create Network</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
