import { Bot, Sparkles } from "lucide-react";
import { useWorkspaceStore, useEcosystemStore } from "@/stores";
import type { ViewId } from "@/types";

interface DoneContentProps {
  onNavigate: (v: ViewId) => void;
  resetArchitect: () => void;
  showActions?: boolean;
}

export function DoneContent({ onNavigate, resetArchitect, showActions = true }: DoneContentProps) {
  const { agents, channels, groups, messages } = useWorkspaceStore();
  const ecosystem = useEcosystemStore((s) => s.ecosystem);
  const networkCount = ecosystem.networks.length;
  const bridgeCount = ecosystem.bridges.length;

  return (
    <div className="architect-popup__done">
      <div className="architect-popup__done-check">✓</div>
      <div className="architect-popup__done-title">Network Deployed</div>
      <div className="architect-popup__done-summary">
        {networkCount} network{networkCount === 1 ? "" : "s"} · {agents.length} agents · {channels.length} channels · {bridgeCount} bridge{bridgeCount === 1 ? "" : "s"} · {groups.length} groups · {messages.length} messages
      </div>
      {showActions && (
        <div className="architect-popup__done-actions">
          <button onClick={() => onNavigate("network")} className="architect-popup__done-btn" style={{ background: "#00e5a012", border: "1px solid #00e5a025", color: "#00e5a0" }}>
            ◈ View Topology
          </button>
          <button onClick={() => onNavigate("agents")} className="architect-popup__done-btn" style={{ background: "#00e5a012", border: "1px solid #00e5a025", color: "#00e5a0" }}>
            <Bot size={13} /> Browse Agents
          </button>
          <button onClick={() => { resetArchitect(); }} className="architect-popup__build-another-btn">
            <Sparkles size={13} /> Build Another
          </button>
        </div>
      )}
    </div>
  );
}
