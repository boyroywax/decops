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
    <div className="network-view">
      <h2 className="network-view__title"><GradientIcon icon={Share2} size={18} gradient={["#00e5a0", "#34d399"]} /> Network Topology</h2>
      {agents.length === 0 ? (
        <div className="network-view__empty">
          <div className="network-view__empty-text">Create agents to visualize the mesh.</div>
        </div>
      ) : (
        <div className="network-view__canvas">
          <NetworkCanvas agents={agents} channels={channels} groups={groups} activeChannels={activeChannels} />
        </div>
      )}
    </div>
  );
}
