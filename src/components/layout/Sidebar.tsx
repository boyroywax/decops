import React, { useRef, useState, useEffect } from "react";
import type { ViewId, Network, Message, BridgeMessage } from "../../types";
import type { LucideIcon } from "lucide-react";
import {
  Sparkles, Globe, Bot, ArrowLeftRight,
  Hexagon, MessageSquare,
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

const ARCHITECT_ITEM = { id: "architect" as ViewId, label: "Architect", icon: Sparkles, accent: "#fbbf24", gradient: ["#fbbf24", "#fb923c"] as [string, string] };

const NAV_ITEMS: { id: ViewId; label: string; icon: LucideIcon; accent: string; gradient: [string, string] }[] = [
  { id: "networks", label: "Networks", icon: Globe, accent: "#38bdf8", gradient: ["#38bdf8", "#60a5fa"] },
  { id: "agents", label: "Agents", icon: Bot, accent: "#00e5a0", gradient: ["#00e5a0", "#34d399"] },
  { id: "channels", label: "Channels", icon: ArrowLeftRight, accent: "#a78bfa", gradient: ["#a78bfa", "#c084fc"] },
  { id: "groups", label: "Groups", icon: Hexagon, accent: "#f472b6", gradient: ["#f472b6", "#fb7185"] },
  { id: "messages", label: "Messages", icon: MessageSquare, accent: "#fbbf24", gradient: ["#fbbf24", "#fb923c"] },
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
      <div className="sidebar-nav-top">
        {NAV_ITEMS.map((tab) => {
        const badgeCount =
          tab.id === "networks" ? ecosystems.length :
          tab.id === "agents" ? agents.length :
          tab.id === "channels" ? channels.length :
          tab.id === "groups" ? groups.length :
          tab.id === "messages" ? messages.length + bridgeMessages.length :
          0;

        return (
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
          {/* Collapsed badge — small overlay near icon */}
          {collapsed && !isMobile && badgeCount > 0 && (
            <span className={`sidebar-badge ${getAccentType(tab.id)}`}>{badgeCount}</span>
          )}
          {(!collapsed || isMobile) && (
            <>
              {tab.label}
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
        );
      })}
      </div>

      <div className="sidebar-nav-bottom">
      <button
        onClick={() => setView(ARCHITECT_ITEM.id)}
        title={collapsed && !isMobile ? ARCHITECT_ITEM.label : undefined}
        className={`sidebar-nav-item sidebar-nav-item--architect ${view === ARCHITECT_ITEM.id ? 'active' : ''}`}
        data-accent={getAccentType(ARCHITECT_ITEM.id)}
        style={view === ARCHITECT_ITEM.id ? { color: ARCHITECT_ITEM.accent } : undefined}
      >
        {view === ARCHITECT_ITEM.id
          ? <GradientIcon icon={ARCHITECT_ITEM.icon} size={14} gradient={ARCHITECT_ITEM.gradient} />
          : <ARCHITECT_ITEM.icon size={14} />
        }
        {(!collapsed || isMobile) && (
          <>
            {ARCHITECT_ITEM.label}
            <span className="sidebar-shortcut">⌘K</span>
          </>
        )}
      </button>

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
      </div>
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
