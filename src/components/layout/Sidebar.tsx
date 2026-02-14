import type { ViewId, LogEntry, Network, Message } from "../../types";

interface SidebarProps {
  view: ViewId;
  setView: (view: ViewId) => void;
  log: LogEntry[];
  ecosystems: Network[];
  messages: Message[];
}

const NAV_ITEMS: { id: ViewId; label: string; icon: string; accent: string }[] = [
  { id: "architect", label: "Architect", icon: "✦", accent: "#fbbf24" },
  { id: "ecosystem", label: "Ecosystem", icon: "◎", accent: "#38bdf8" },
  { id: "agents", label: "Agents", icon: "◉", accent: "#00e5a0" },
  { id: "channels", label: "Channels", icon: "⟷", accent: "#a78bfa" },
  { id: "groups", label: "Groups", icon: "⬡", accent: "#f472b6" },
  { id: "messages", label: "Messages", icon: "◆", accent: "#fbbf24" },
  { id: "network", label: "Topology", icon: "◈", accent: "#00e5a0" },
];

export function Sidebar({ view, setView, log, ecosystems, messages }: SidebarProps) {
  return (
    <nav style={{ width: 200, borderRight: "1px solid rgba(0,229,160,0.08)", padding: "12px 0", display: "flex", flexDirection: "column", gap: 2, background: "rgba(0,0,0,0.3)", flexShrink: 0 }}>
      {NAV_ITEMS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setView(tab.id)}
          style={{
            background: view === tab.id ? tab.accent + "10" : "transparent",
            border: "none",
            color: view === tab.id ? tab.accent : "#71717a",
            padding: "10px 16px",
            textAlign: "left",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 8,
            borderLeft: view === tab.id ? `2px solid ${tab.accent}` : "2px solid transparent",
            transition: "all 0.15s",
          }}
        >
          <span style={{ fontSize: 14 }}>{tab.icon}</span> {tab.label}
          {tab.id === "ecosystem" && ecosystems.length > 0 && (
            <span style={{ marginLeft: "auto", fontSize: 9, background: "rgba(56,189,248,0.15)", color: "#38bdf8", padding: "1px 6px", borderRadius: 8 }}>{ecosystems.length}</span>
          )}
          {tab.id === "messages" && messages.length > 0 && (
            <span style={{ marginLeft: "auto", fontSize: 9, background: "rgba(251,191,36,0.15)", color: "#fbbf24", padding: "1px 6px", borderRadius: 8 }}>{messages.length}</span>
          )}
        </button>
      ))}
      <div style={{ marginTop: "auto", padding: "12px 14px", borderTop: "1px solid rgba(0,229,160,0.06)" }}>
        <div style={{ fontSize: 9, color: "#52525b", letterSpacing: "0.1em", marginBottom: 8 }}>ACTIVITY LOG</div>
        <div style={{ maxHeight: 200, overflow: "auto" }}>
          {log.length === 0 && <div style={{ fontSize: 10, color: "#3f3f46" }}>No activity yet</div>}
          {log.map((l, i) => (
            <div key={l.ts + "-" + i} style={{ fontSize: 9, color: "#71717a", marginBottom: 6, lineHeight: 1.4 }}>
              <span style={{ color: "#00e5a0", opacity: 0.5 }}>▸</span> {l.msg}
            </div>
          ))}
        </div>
      </div>
    </nav>
  );
}
