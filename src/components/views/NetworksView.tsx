import { useState } from "react";
import type {
  Agent, Channel, Group, Network, Bridge,
  BridgeMessage, BridgeForm, ViewId,
} from "../../types";
import {
  Globe, Plus, Sparkles, Link2, Layers,
} from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import { NetworkCard } from "./networks/NetworkCard";
import { BridgeBuilder } from "./networks/BridgeBuilder";
import { BridgeCard } from "./networks/BridgeCard";
import { CreateNetworkModal } from "./networks/CreateNetworkModal";
import { TopologyPanel } from "./networks/TopologyPanel";
import "../../styles/components/networks.css";

interface NetworksViewProps {
  agents: Agent[];
  channels: Channel[];
  groups: Group[];
  ecosystems: Network[];
  bridges: Bridge[];
  bridgeMessages: BridgeMessage[];
  activeBridges: Set<string>;
  bridgeForm: BridgeForm;
  setBridgeForm: (v: BridgeForm) => void;
  bridgeFromNet: Network | null | undefined;
  bridgeToNet: Network | null | undefined;
  dissolveNetwork: (id: string) => void;
  createBridge: () => void;
  removeBridge: (id: string) => void;
  setView: (v: ViewId) => void;
  addJob: (job: any) => void;
}

type ManagerTab = "networks" | "bridges" | "topology";

export function NetworksView({
  agents, channels, groups,
  ecosystems, bridges, bridgeMessages, activeBridges,
  bridgeForm, setBridgeForm,
  bridgeFromNet, bridgeToNet,
  dissolveNetwork,
  createBridge, removeBridge, setView,
  addJob,
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
    <div className="networks-root">
      {/* Header */}
      <div className="networks-header">
        <div>
          <h2 className="networks-title">
            <GradientIcon icon={Globe} size={20} gradient={["#38bdf8", "#60a5fa"]} />
            Network Manager
          </h2>
          <p className="networks-subtitle">
            Create and manage isolated networks. Bridge agents across networks for cross-mesh communication.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="networks-create-btn"
        >
          <Plus size={14} strokeWidth={2.5} /> New Network
        </button>
      </div>

      {/* Tab Bar */}
      <div className="networks-tab-bar">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`networks-tab${activeTab === tab.id ? " networks-tab--active" : ""}`}
          >
            <tab.icon size={13} />
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="networks-tab__count">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ─── Networks Tab ─── */}
      {activeTab === "networks" && (
        <div className="networks-tab-content">
          {/* Network Cards Grid */}
          {ecosystems.length > 0 ? (
            <div className="networks-grid">
              {ecosystems.map((net) => (
                <NetworkCard
                  key={net.id}
                  net={net}
                  bridges={bridges}
                  ecosystems={ecosystems}
                  workspaceAgents={agents}
                  workspaceChannels={channels}
                  workspaceGroups={groups}
                  isExpanded={expandedNetwork === net.id}
                  onToggleExpand={() => setExpandedNetwork(expandedNetwork === net.id ? null : net.id)}
                  dissolveNetwork={dissolveNetwork}
                />
              ))}
            </div>
          ) : (
            /* Empty state */
            <div className="networks-empty">
              <div className="networks-empty__icon">
                <GradientIcon icon={Globe} size={36} gradient={["#38bdf8", "#60a5fa"]} />
              </div>
              <div className="networks-empty__title">
                No networks yet
              </div>
              <div className="networks-empty__desc">
                Create a network to organize your agents, channels, and groups. Use the Architect for AI-powered network generation.
              </div>
              <div className="networks-empty__actions">
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="networks-empty__create-btn"
                >
                  <Plus size={14} /> Create Network
                </button>
                <button
                  onClick={() => setView("architect")}
                  className="networks-empty__architect-btn"
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
        <div className="networks-tab-content">
          {/* Create Bridge CTA */}
          <div className="bridges-header">
            <div className="bridges-desc">
              Bridges connect agents across different networks. Bridges are a channel type ({`p2p → bridge`}).
            </div>
            {ecosystems.length >= 2 && (
              <button
                onClick={() => setShowBridgeBuilder(!showBridgeBuilder)}
                className={`bridges-new-btn${showBridgeBuilder ? " bridges-new-btn--active" : ""}`}
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
            <div className="bridges-grid">
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
            <div className="bridges-empty">
              <Link2 size={28} color="#3f3f46" className="bridges-empty__icon" />
              <div className="bridges-empty__title">No bridges yet</div>
              <div className="bridges-empty__desc">
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
        <div className="networks-tab-content--no-scroll">
          <TopologyPanel ecosystems={ecosystems} bridges={bridges} activeBridges={activeBridges} />
        </div>
      )}

      {/* Create Network Modal */}
      {showCreateModal && (
        <CreateNetworkModal
          addJob={addJob}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}
