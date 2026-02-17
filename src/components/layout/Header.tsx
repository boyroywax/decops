import { useState } from "react";
import { Hexagon, Zap, LogOut, Grid } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import type { ViewId } from "../../types";
import { GemAvatar } from "../shared/GemAvatar";
import { WorkspaceManagerModal } from "./WorkspaceManagerModal";
import "../../styles/components/header.css";

interface HeaderProps {
  user?: any;
  logout?: () => void;
  setView?: (v: ViewId) => void;
  onProfileClick?: () => void;
  activityPulse?: boolean;
  onActivityClick?: () => void;
}

export function Header({ user, logout, setView, onProfileClick, activityPulse, onActivityClick }: HeaderProps) {
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);

  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="header-logo">
          <Hexagon size={18} color="#0a0a0f" strokeWidth={2.5} />
        </div>
        <div>
          <div className="header-title">MESH WORKSPACE</div>
          <div className="header-subtitle">DECENTRALIZED AGENT COLLABORATION</div>
        </div>
      </div>

      {user && (
        <div className="header-actions">
          <div className="header-action-btn">
            <button
              onClick={() => setShowWorkspaceModal(!showWorkspaceModal)}
              className={`header-icon-btn ${showWorkspaceModal ? 'active' : ''}`}
              title="Workspace Manager"
            >
              <Grid size={18} />
            </button>
            {showWorkspaceModal && <WorkspaceManagerModal onClose={() => setShowWorkspaceModal(false)} />}
          </div>

          <button
            onClick={onActivityClick}
            className={`header-icon-btn ${activityPulse ? 'pulsing' : ''}`}
            title="Activity"
          >
            <Zap size={16} color={activityPulse ? "#00e5a0" : "#71717a"} />
          </button>

          <button
            onClick={() => onProfileClick ? onProfileClick() : setView?.("profile")}
            className="header-user-btn"
          >
            <GemAvatar seed={user.email || user.username || "user"} size={28} />
            <div className="header-user-info">
              <div className="header-user-name">{user.firstName || user.username}</div>
              <div className="header-user-email">{user.email || "User"}</div>
            </div>
          </button>

          <button onClick={logout} className="header-logout-btn" title="Logout">
            <LogOut size={14} />
          </button>
        </div>
      )}
    </header>
  );
}
