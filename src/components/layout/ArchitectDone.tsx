import { Globe, Bot, Sparkles } from "lucide-react";
import { useWorkspaceContext } from "../../context/WorkspaceContext";
import type { ViewId } from "../../types";

interface DoneContentProps {
  onNavigate: (v: ViewId) => void;
  resetArchitect: () => void;
}

export function DoneContent({ onNavigate, resetArchitect }: DoneContentProps) {
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
