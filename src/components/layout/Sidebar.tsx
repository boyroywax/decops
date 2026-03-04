import React, { useRef, useState, useEffect } from "react";
import type { ViewId, Network, Message, BridgeMessage } from "@/types";
import type { LucideIcon } from "lucide-react";
import {
  Sparkles, Globe, Bot, ArrowLeftRight,
  Hexagon, MessageSquare, Clapperboard,
  ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight,
  Activity, Zap, FileText, ChevronDown, Layers, Wrench,
} from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
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
  ecosystemName?: string;
  totalUnread?: number;
}

const EDITOR_ITEM = { id: "editor" as ViewId, label: "Editor", icon: FileText, accent: "#38bdf8", gradient: ["#38bdf8", "#60a5fa"] as [string, string] };
const ARCHITECT_ITEM = { id: "architect" as ViewId, label: "Architect", icon: Sparkles, accent: "#fbbf24", gradient: ["#fbbf24", "#fb923c"] as [string, string] };
const STUDIO_ITEM = { id: "jobs" as ViewId, label: "Studio", icon: Clapperboard, accent: "#8b5cf6", gradient: ["#8b5cf6", "#a78bfa"] as [string, string] };
const TOOLKITS_ITEM = { id: "toolkits" as ViewId, label: "Tool Kits", icon: Wrench, accent: "#f97316", gradient: ["#f97316", "#fb923c"] as [string, string] };

const NAV_ITEMS: { id: ViewId; label: string; icon: LucideIcon; accent: string; gradient: [string, string] }[] = [
  { id: "networks", label: "Networks", icon: Globe, accent: "#38bdf8", gradient: ["#38bdf8", "#60a5fa"] },
  { id: "agents", label: "Agents", icon: Bot, accent: "#00e5a0", gradient: ["#00e5a0", "#34d399"] },
  { id: "channels", label: "Channels", icon: ArrowLeftRight, accent: "#a78bfa", gradient: ["#a78bfa", "#c084fc"] },
  { id: "groups", label: "Groups", icon: Hexagon, accent: "#f472b6", gradient: ["#f472b6", "#fb7185"] },
  { id: "messages", label: "Messages", icon: MessageSquare, accent: "#fbbf24", gradient: ["#fbbf24", "#fb923c"] },
];

const ECOSYSTEM_VIEWS: Set<ViewId> = new Set(["networks", "agents", "channels", "groups", "messages"]);

export function Sidebar({ view, setView, ecosystems, messages, bridgeMessages, agents, channels, groups, collapsed, setCollapsed, isMobile, ecosystemName, totalUnread }: SidebarProps) {
  const navRef = useRef<HTMLElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [ecoExpanded, setEcoExpanded] = useState(() => ECOSYSTEM_VIEWS.has(view));

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
      case "editor":
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
        {/* ─── Ecosystem Expandable Menu ─── */}
        <button
          onClick={() => {
            if (collapsed && !isMobile) {
              setCollapsed(false);
              setEcoExpanded(true);
            } else {
              setEcoExpanded(!ecoExpanded);
            }
          }}
          title={collapsed && !isMobile ? (ecosystemName || "Ecosystem") : undefined}
          className={`sidebar-nav-item sidebar-eco-toggle ${ECOSYSTEM_VIEWS.has(view) ? 'active' : ''}`}
          data-accent="accent"
        >
          {ECOSYSTEM_VIEWS.has(view)
            ? <GradientIcon icon={Layers} size={14} gradient={["#00e5a0", "#38bdf8"]} />
            : <Layers size={14} />
          }
          {collapsed && !isMobile && (
            <>
              {(ecosystems.length + agents.length + channels.length + groups.length) > 0 && (
                <span className="sidebar-badge accent">{ecosystems.length + agents.length + channels.length + groups.length}</span>
              )}
            </>
          )}
          {(!collapsed || isMobile) && (
            <>
              <span className="sidebar-eco-name">{ecosystemName || "Ecosystem"}</span>
              <ChevronDown size={12} className={`sidebar-eco-chevron${ecoExpanded ? ' sidebar-eco-chevron--open' : ''}`} />
            </>
          )}
        </button>

        {/* ─── Ecosystem Sub-items ─── */}
        {ecoExpanded && (!collapsed || isMobile) && (
          <div className="sidebar-eco-subitems">
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
                  className={`sidebar-nav-item sidebar-nav-subitem ${view === tab.id ? 'active' : ''}`}
                  data-accent={getAccentType(tab.id)}
                  style={view === tab.id ? { color: tab.accent } : undefined}
                >
                  {view === tab.id
                    ? <GradientIcon icon={tab.icon} size={13} gradient={tab.gradient} />
                    : <tab.icon size={13} />
                  }
                  {tab.label}
                  {tab.id === "messages" && (totalUnread || 0) > 0 ? (
                    <span className="sidebar-count sidebar-count--unread warning">{totalUnread}</span>
                  ) : badgeCount > 0 ? (
                    <span className={`sidebar-count ${getAccentType(tab.id)}`}>{badgeCount}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
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

      <button
        onClick={() => setView(EDITOR_ITEM.id)}
        title={collapsed && !isMobile ? EDITOR_ITEM.label : undefined}
        className={`sidebar-nav-item sidebar-nav-item--editor ${view === EDITOR_ITEM.id ? 'active' : ''}`}
        data-accent={getAccentType(EDITOR_ITEM.id)}
        style={view === EDITOR_ITEM.id ? { color: EDITOR_ITEM.accent } : undefined}
      >
        {view === EDITOR_ITEM.id
          ? <GradientIcon icon={EDITOR_ITEM.icon} size={14} gradient={EDITOR_ITEM.gradient} />
          : <EDITOR_ITEM.icon size={14} />
        }
        {(!collapsed || isMobile) && (
          <>
            {EDITOR_ITEM.label}
          </>
        )}
      </button>

      <button
        onClick={() => setView(STUDIO_ITEM.id)}
        title={collapsed && !isMobile ? STUDIO_ITEM.label : undefined}
        className={`sidebar-nav-item sidebar-nav-item--studio ${view === STUDIO_ITEM.id ? 'active' : ''}`}
        data-accent={getAccentType(STUDIO_ITEM.id)}
        style={view === STUDIO_ITEM.id ? { color: STUDIO_ITEM.accent } : undefined}
      >
        {view === STUDIO_ITEM.id
          ? <GradientIcon icon={STUDIO_ITEM.icon} size={14} gradient={STUDIO_ITEM.gradient} />
          : <STUDIO_ITEM.icon size={14} />
        }
        {(!collapsed || isMobile) && (
          <>
            {STUDIO_ITEM.label}
          </>
        )}
      </button>

      <button
        onClick={() => setView(TOOLKITS_ITEM.id)}
        title={collapsed && !isMobile ? TOOLKITS_ITEM.label : undefined}
        className={`sidebar-nav-item sidebar-nav-item--toolkits ${view === TOOLKITS_ITEM.id ? 'active' : ''}`}
        data-accent="warning"
        style={view === TOOLKITS_ITEM.id ? { color: TOOLKITS_ITEM.accent } : undefined}
      >
        {view === TOOLKITS_ITEM.id
          ? <GradientIcon icon={TOOLKITS_ITEM.icon} size={14} gradient={TOOLKITS_ITEM.gradient} />
          : <TOOLKITS_ITEM.icon size={14} />
        }
        {(!collapsed || isMobile) && (
          <>
            {TOOLKITS_ITEM.label}
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
