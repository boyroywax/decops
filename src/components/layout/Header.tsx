import type { Agent, Channel, Group, Message, Network, Bridge } from "../../types";

interface HeaderProps {
  agents: Agent[];
  channels: Channel[];
  groups: Group[];
  messages: Message[];
  ecosystems: Network[];
  bridges: Bridge[];
}

export function Header({ agents, channels, groups, messages, ecosystems, bridges }: HeaderProps) {
  return (
    <header style={{ padding: "16px 20px", borderBottom: "1px solid rgba(0,229,160,0.12)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,229,160,0.02)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #00e5a0 0%, #0a0a0f 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⬡</div>
        <div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em" }}>MESH WORKSPACE</div>
          <div style={{ fontSize: 10, color: "#71717a", letterSpacing: "0.05em" }}>DECENTRALIZED AGENT COLLABORATION</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, fontSize: 10, color: "#52525b", flexWrap: "wrap" }}>
        <span style={{ color: "#00e5a0" }}>●</span> {agents.length} agents
        <span style={{ margin: "0 4px" }}>|</span>
        <span style={{ color: "#a78bfa" }}>●</span> {channels.length} channels
        <span style={{ margin: "0 4px" }}>|</span>
        <span style={{ color: "#f472b6" }}>●</span> {groups.length} groups
        <span style={{ margin: "0 4px" }}>|</span>
        <span style={{ color: "#fbbf24" }}>●</span> {messages.length} msgs
        {ecosystems.length > 0 && <><span style={{ margin: "0 4px" }}>|</span><span style={{ color: "#38bdf8" }}>●</span> {ecosystems.length} nets</>}
        {bridges.length > 0 && <><span style={{ margin: "0 4px" }}>|</span><span style={{ color: "#fb923c" }}>●</span> {bridges.length} bridges</>}
      </div>
    </header>
  );
}
