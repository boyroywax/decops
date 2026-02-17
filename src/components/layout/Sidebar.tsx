import React, { useRef, useState, useEffect } from "react";
import type { ViewId, Network, Message, BridgeMessage } from "../../types";
import type { LucideIcon } from "lucide-react";
import {
  Sparkles, Globe, Bot, ArrowLeftRight,
  Hexagon, MessageSquare, Network as NetworkIcon,
  ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight,
  Activity, Zap,
} from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import "../../styles/components/sidebar.css";

interface SidebarProps {
  view: ViewId;
  setView: (view: ViewId) => void;
  ecosystems: Network[];
  messages: Message[];
  bridgeMessages: BridgeMessage[];
  agents: any[];
  channels: any[];
  groups: any[];
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  isMobile?: boolean;
}

const NAV_ITEMS: { id: ViewId; label: string; icon: LucideIcon; accent: string; gradient: [string, string] }[] = [
  { id: "architect", label: "Architect", icon: Sparkles, accent: "#fbbf24", gradient: ["#fbbf24", "#fb923c"] },
  { id: "networks", label: "Networks", icon: Globe, accent: "#38bdf8", gradient: ["#38bdf8", "#60a5fa"] },
  { id: "agents", label: "Agents", icon: Bot, accent: "#00e5a0", gradient: ["#00e5a0", "#34d399"] },
  { id: "channels", label: "Channels", icon: ArrowLeftRight, accent: "#a78bfa", gradient: ["#a78bfa", "#c084fc"] },
  { id: "groups", label: "Groups", icon: Hexagon, accent: "#f472b6", gradient: ["#f472b6", "#fb7185"] },
  { id: "messages", label: "Messages", icon: MessageSquare, accent: "#fbbf24", gradient: ["#fbbf24", "#fb923c"] },
  { id: "network", label: "Topology", icon: NetworkIcon, accent: "#00e5a0", gradient: ["#00e5a0", "#38bdf8"] },
];

export function Sidebar({ view, setView, ecosystems, messages, bridgeMessages, agents, channels, groups, collapsed, setCollapsed, isMobile }: SidebarProps) {
  const navRef = useRef<HTMLElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    if (navRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = navRef.current;
      setCanScrollLeft(scrollLeft > 0);
      // Small buffer (1px) for float comparisons
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  };

  useEffect(() => {
    if (isMobile) {
      checkScroll();
      const el = navRef.current;
      if (el) {
        el.addEventListener('scroll', checkScroll);
        window.addEventListener('resize', checkScroll);
        return () => {
          el.removeEventListener('scroll', checkScroll);
          window.removeEventListener('resize', checkScroll);
        };
      }
    }
  }, [isMobile, ecosystems.length, messages.length, bridgeMessages.length, agents.length, channels.length, groups.length]);

  const scroll = (direction: 'left' | 'right') => {
    if (navRef.current) {
      const scrollAmount = 200;
      navRef.current.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
    }
  };

  const getAccentType = (tabId: ViewId): string => {
    switch (tabId) {
      case "architect":
      case "messages":
        return "warning";
      case "networks":
        return "info";
      case "agents":
      case "network":
        return "accent";
      case "channels":
      case "artifacts":
        return "channel";
      case "groups":
        return "group";
      default:
        return "accent";
    }
  };

  const navContent = (
    <nav
      ref={navRef}
      className={`app-sidebar ${isMobile ? 'mobile' : ''} ${collapsed && !isMobile ? 'collapsed' : ''}`}
    >
      {NAV_ITEMS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setView(tab.id)}
          title={collapsed ? tab.label : undefined}
          className={`sidebar-nav-item ${view === tab.id ? 'active' : ''}`}
          data-accent={getAccentType(tab.id)}
          style={view === tab.id ? { color: tab.accent } : undefined}
        >
          {view === tab.id
            ? <GradientIcon icon={tab.icon} size={14} gradient={tab.gradient} />
            : <tab.icon size={14} />
          }
          {(!collapsed || isMobile) && (
            <>
              {tab.label}
              {tab.id === "architect" && (
                <span className="sidebar-shortcut">⌘K</span>
              )}
              {tab.id === "networks" && ecosystems.length > 0 && (
                <span className="sidebar-count info">{ecosystems.length}</span>
              )}
              {tab.id === "agents" && agents.length > 0 && (
                <span className="sidebar-count accent">{agents.length}</span>
              )}
              {tab.id === "channels" && channels.length > 0 && (
                <span className="sidebar-count channel">{channels.length}</span>
              )}
              {tab.id === "groups" && groups.length > 0 && (
                <span className="sidebar-count group">{groups.length}</span>
              )}
              {tab.id === "messages" && (messages.length + bridgeMessages.length) > 0 && (
                <span className="sidebar-count warning">{messages.length + bridgeMessages.length}</span>
              )}
            </>
          )}
        </button>
      ))}

      {!isMobile && (
        <div className="sidebar-collapse-btn">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="btn-ghost"
          >
            {collapsed ? <ChevronsRight size={14} /> : <><ChevronsLeft size={14} /> Collapse</>}
          </button>
        </div>
      )}
    </nav>
  );

  if (isMobile) {
    return (
      <div className="sidebar-mobile-container">
        {canScrollLeft && (
          <button
            onClick={() => scroll("left")}
            className="sidebar-scroll-btn left"
          >
            <ChevronLeft size={14} />
          </button>
        )}

        {navContent}

        {canScrollRight && (
          <button
            onClick={() => scroll("right")}
            className="sidebar-scroll-btn right"
          >
            <ChevronRight size={14} />
          </button>
        )}
      </div>
    );
  }

  return navContent;
}
