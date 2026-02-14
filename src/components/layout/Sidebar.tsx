import type { ViewId, Network, Message } from "../../types";

interface SidebarProps {
  view: ViewId;
  setView: (view: ViewId) => void;
  ecosystems: Network[];
  messages: Message[];
  user?: any;
  logout?: () => void;
}

const NAV_ITEMS: { id: ViewId; label: string; icon: string; accent: string }[] = [
  { id: "architect", label: "Architect", icon: "✦", accent: "#fbbf24" },
  { id: "ecosystem", label: "Ecosystem", icon: "◎", accent: "#38bdf8" },
  { id: "agents", label: "Agents", icon: "◉", accent: "#00e5a0" },
  { id: "channels", label: "Channels", icon: "⟷", accent: "#a78bfa" },
  { id: "groups", label: "Groups", icon: "⬡", accent: "#f472b6" },
  { id: "messages", label: "Messages", icon: "◆", accent: "#fbbf24" },
  { id: "network", label: "Topology", icon: "◈", accent: "#00e5a0" },
  { id: "data", label: "Data", icon: "▣", accent: "#ef4444" },
];

export function Sidebar({ view, setView, ecosystems, messages, user, logout }: SidebarProps) {
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
      {user ? (
        <div style={{ marginTop: "auto", padding: "12px 14px", borderTop: "1px solid rgba(0,229,160,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={() => setView("profile")} style={{ background: view === "profile" ? "rgba(161,161,170,0.1)" : "none", border: "none", cursor: "pointer", padding: "4px 6px", borderRadius: 6, textAlign: "left", transition: "all 0.15s" }}>
            <div style={{ fontSize: 11 }}>
              <div style={{ color: view === "profile" ? "#e4e4e7" : "#a1a1aa", fontWeight: 500 }}>{user.firstName || user.username}</div>
              <div style={{ color: "#71717a", fontSize: 9 }}>{user.email || "User"}</div>
            </div>
          </button>
          <button onClick={logout} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16 }} title="Logout">
            ⏻
          </button>
        </div>
      ) : null}
    </nav>
  );
}
