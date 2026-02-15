import { useState } from "react";
import type { Agent, Channel, Group, Keystone } from "../../types";
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

      {/* Network Stats / Controls Overlay */}
      <div style={{ position: "absolute", top: 20, right: 20, zIndex: 10, display: "flex", gap: 8 }}>
        {/* We can add filters or view modes here */}
      </div>

      <div style={{ position: "relative", height: "calc(100% - 50px)" }}>

        {/* Canvas Container */}
        <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(0,229,160,0.08)", borderRadius: 12, height: "100%", overflow: "hidden" }}>
          <NetworkCanvas agents={agents} channels={channels} groups={groups} activeChannels={activeChannels} />
        </div>

        {/* Floating Keystone Creator - REMOVED (Moved to Groups) */}
        {/* <div style={{ position: "absolute", bottom: 20, right: 20, background: "rgba(10,10,15,0.9)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 8, padding: 12, width: 220, backdropFilter: "blur(4px)" }}>
           <h4 style={{ margin: "0 0 8px 0", fontSize: 12, color: "#fbbf24", fontFamily: "'Space Grotesk'" }}>Add Keystone</h4>
           <KeystoneCreator addKeystone={addKeystone} />
        </div> */}
      </div>
    </div>
  );
}
