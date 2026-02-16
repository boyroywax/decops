import { useState } from "react";
import { Hexagon, Zap, LogOut, Grid } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import type { ViewId } from "../../types";
import { GemAvatar } from "../shared/GemAvatar";
import { WorkspaceManagerModal } from "./WorkspaceManagerModal";

interface HeaderProps {
  user?: any;
  logout?: () => void;
  setView?: (v: ViewId) => void;
}

export function Header({ user, logout, setView }: HeaderProps) {
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);

  return (
    <header style={{ padding: "10px 20px", borderBottom: "1px solid rgba(0,229,160,0.12)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,229,160,0.02)", position: 'relative' }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #00e5a0 0%, #0a0a0f 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Hexagon size={18} color="#0a0a0f" strokeWidth={2.5} />
        </div>
        <div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em" }}>MESH WORKSPACE</div>
          <div style={{ fontSize: 10, color: "#71717a", letterSpacing: "0.05em" }}>DECENTRALIZED AGENT COLLABORATION</div>
        </div>
      </div>

      {user && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowWorkspaceModal(!showWorkspaceModal)}
              style={{
                background: showWorkspaceModal ? "rgba(0, 229, 160, 0.1)" : "none",
                border: showWorkspaceModal ? "1px solid rgba(0, 229, 160, 0.3)" : "1px solid rgba(255,255,255,0.06)",
                borderRadius: 8,
                width: 38,
                height: 38,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.15s",
                color: showWorkspaceModal ? "#00e5a0" : "#71717a"
              }}
              title="Workspace Manager"
            >
              <Grid size={18} />
            </button>
            {showWorkspaceModal && <WorkspaceManagerModal onClose={() => setShowWorkspaceModal(false)} />}
          </div>

          <button
            onClick={() => setView?.("profile")}
            style={{
              background: "none",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 8,
              padding: "4px 10px 4px 4px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "all 0.15s",
            }}
          >
            <GemAvatar seed={user.email || user.username || "user"} size={28} />
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 11, color: "#e4e4e7", fontWeight: 500, fontFamily: "inherit" }}>{user.firstName || user.username}</div>
              <div style={{ fontSize: 9, color: "#52525b", fontFamily: "inherit" }}>{user.email || "User"}</div>
            </div>
          </button>

          <button
            onClick={logout}
            style={{ background: "none", border: "none", color: "#52525b", cursor: "pointer", padding: 4, transition: "color 0.15s", display: "flex", alignItems: "center" }}
            title="Logout"
          >
            <LogOut size={14} />
          </button>
        </div>
      )}
    </header>
  );
}
