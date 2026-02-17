import { useState } from "react";
import type {
  Agent, Channel, Group, Network, Bridge,
  BridgeMessage, BridgeForm, ViewId,
} from "../../types";
import { inputStyle } from "../shared/ui";
import {
  Globe, Plus, Sparkles, Link2, Layers, Download,
} from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import { NetworkCard } from "./networks/NetworkCard";
import { BridgeBuilder } from "./networks/BridgeBuilder";
import { BridgeCard } from "./networks/BridgeCard";
import { CreateNetworkModal } from "./networks/CreateNetworkModal";
import { TopologyPanel } from "./networks/TopologyPanel";

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
  activeNetworkId: string | null;
  setActiveNetworkId: (id: string | null) => void;
}

type ManagerTab = "networks" | "bridges" | "topology";

export function NetworksView({
  agents, channels, groups,
  ecosystems, bridges, bridgeMessages, activeBridges,
  ecoSaveName, setEcoSaveName, bridgeForm, setBridgeForm,
  bridgeFromNet, bridgeToNet,
  saveCurrentNetwork, loadNetwork, dissolveNetwork,
  createBridge, removeBridge, setView,
  addJob, activeNetworkId, setActiveNetworkId,
}: NetworksViewProps) {
  const [activeTab, setActiveTab] = useState<ManagerTab>("networks");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBridgeBuilder, setShowBridgeBuilder] = useState(false);
  const [expandedNetwork, setExpandedNetwork] = useState<string | null>(null);

  const tabs: { id: ManagerTab; label: string; icon: any; count?: number }[] = [
    { id: "networks", label: "Networks", icon: Globe, count: ecosystems.length },
    { id: "bridges", label: "Bridges", icon: Link2, count: bridges.length },
    { id: "topology", label: "Topology", icon: Layers },
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h2 style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 20, fontWeight: 700, marginBottom: 4,
            display: "flex", alignItems: "center", gap: 10,
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
            fontSize: 12, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 6,
            flexShrink: 0,
          }}
        >
          <Plus size={14} strokeWidth={2.5} /> New Network
        </button>
      </div>

      {/* Tab Bar */}
      <div style={{
        display: "flex", gap: 2, marginBottom: 20,
        background: "rgba(0,0,0,0.2)", borderRadius: 10,
        padding: 3, border: "1px solid rgba(255,255,255,0.04)",
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
              padding: "8px 16px", borderRadius: 8,
              cursor: "pointer", fontFamily: "inherit",
              fontSize: 11, fontWeight: 500,
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: 6, transition: "all 0.15s",
            }}
          >
            <tab.icon size={13} />
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span style={{
                fontSize: 9,
                background: activeTab === tab.id ? "rgba(56,189,248,0.2)" : "rgba(255,255,255,0.06)",
                color: activeTab === tab.id ? "#38bdf8" : "#52525b",
                padding: "1px 6px", borderRadius: 8,
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ─── Networks Tab ─── */}
      {activeTab === "networks" && (
        <div style={{ flex: 1, overflow: "auto" }}>
          {/* Save Current Workspace Bar */}
          {agents.length > 0 && (
            <div style={{
              background: "rgba(56,189,248,0.03)",
              border: "1px solid rgba(56,189,248,0.1)",
              borderRadius: 12, padding: 16, marginBottom: 20,
              display: "flex", alignItems: "center", gap: 12,
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
                  style={{ ...inputStyle, border: "1px solid rgba(56,189,248,0.15)", width: 200 }}
                />
                <button
                  onClick={saveCurrentNetwork}
                  disabled={!ecoSaveName.trim()}
                  style={{
                    background: ecoSaveName.trim() ? "#38bdf8" : "#3f3f46",
                    color: "#0a0a0f", border: "none",
                    padding: "8px 16px", borderRadius: 6,
                    cursor: ecoSaveName.trim() ? "pointer" : "not-allowed",
                    fontFamily: "inherit", fontSize: 11, fontWeight: 500,
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
              {ecosystems.map((net) => (
                <NetworkCard
                  key={net.id}
                  net={net}
                  bridges={bridges}
                  ecosystems={ecosystems}
                  isExpanded={expandedNetwork === net.id}
                  onToggleExpand={() => setExpandedNetwork(expandedNetwork === net.id ? null : net.id)}
                  loadNetwork={loadNetwork}
                  dissolveNetwork={dissolveNetwork}
                  isActive={activeNetworkId === net.id}
                  onSetActive={() => setActiveNetworkId(activeNetworkId === net.id ? null : net.id)}
                />
              ))}
            </div>
          ) : (
            /* Empty state */
            <div style={{
              textAlign: "center", padding: 60, color: "#3f3f46",
              border: "1px dashed rgba(56,189,248,0.12)", borderRadius: 14,
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
                    color: "#38bdf8", padding: "10px 20px", borderRadius: 8,
                    fontFamily: "inherit", fontSize: 11, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  <Plus size={14} /> Create Network
                </button>
                <button
                  onClick={() => setView("architect")}
                  style={{
                    background: "rgba(251,191,36,0.1)",
                    border: "1px solid rgba(251,191,36,0.2)",
                    color: "#fbbf24", padding: "10px 20px", borderRadius: 8,
                    fontFamily: "inherit", fontSize: 11, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  <Sparkles size={14} /> Open Architect
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Bridges Tab ─── */}
      {activeTab === "bridges" && (
        <div style={{ flex: 1, overflow: "auto" }}>
          {/* Create Bridge CTA */}
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "center", marginBottom: 16,
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
                  color: "#fbbf24", padding: "8px 16px", borderRadius: 8,
                  fontFamily: "inherit", fontSize: 11, fontWeight: 500,
                  cursor: "pointer", display: "flex", alignItems: "center",
                  gap: 6, flexShrink: 0,
                }}
              >
                <Link2 size={13} /> {showBridgeBuilder ? "Hide Builder" : "New Bridge"}
              </button>
            )}
          </div>

          {/* Bridge Builder */}
          {showBridgeBuilder && ecosystems.length >= 2 && (
            <BridgeBuilder
              ecosystems={ecosystems}
              bridgeForm={bridgeForm}
              setBridgeForm={setBridgeForm}
              bridgeFromNet={bridgeFromNet}
              bridgeToNet={bridgeToNet}
              createBridge={createBridge}
              onClose={() => setShowBridgeBuilder(false)}
            />
          )}

          {/* Bridge List */}
          {bridges.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {bridges.map((b) => (
                <BridgeCard
                  key={b.id}
                  bridge={b}
                  ecosystems={ecosystems}
                  bridgeMessages={bridgeMessages}
                  removeBridge={removeBridge}
                />
              ))}
            </div>
          ) : (
            <div style={{
              textAlign: "center", padding: 50, color: "#3f3f46",
              border: "1px dashed rgba(251,191,36,0.1)", borderRadius: 14,
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

      {/* ─── Topology Tab ─── */}
      {activeTab === "topology" && (
        <div style={{ flex: 1 }}>
          <TopologyPanel ecosystems={ecosystems} bridges={bridges} activeBridges={activeBridges} />
        </div>
      )}

      {/* Create Network Modal */}
      {showCreateModal && (
        <CreateNetworkModal
          agents={agents}
          channels={channels}
          groups={groups}
          addJob={addJob}
          setEcoSaveName={setEcoSaveName}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}
