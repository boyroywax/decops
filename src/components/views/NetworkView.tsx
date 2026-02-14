import type { Agent, Channel, Group } from "../../types";
import { NetworkCanvas } from "../canvas/NetworkCanvas";
import { Share2 } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";

interface NetworkViewProps {
  agents: Agent[];
  channels: Channel[];
  groups: Group[];
  activeChannels: Set<string>;
}

export function NetworkView({ agents, channels, groups, activeChannels }: NetworkViewProps) {
  return (
    <div style={{ height: "calc(100vh - 120px)" }}>
      <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 600, marginBottom: 16 }}><GradientIcon icon={Share2} size={18} gradient={["#00e5a0", "#34d399"]} /> Network Topology</h2>
      {agents.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#3f3f46", border: "1px dashed rgba(0,229,160,0.1)", borderRadius: 12, height: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 12 }}>Create agents to visualize the mesh.</div>
        </div>
      ) : (
        <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(0,229,160,0.08)", borderRadius: 12, height: "calc(100% - 50px)", overflow: "hidden" }}>
          <NetworkCanvas agents={agents} channels={channels} groups={groups} activeChannels={activeChannels} />
        </div>
      )}
    </div>
  );
}
