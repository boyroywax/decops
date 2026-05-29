import React, { useRef, useState, useEffect } from "react";
import type { ViewId, Network, Message, BridgeMessage } from "@/types";
import type { LucideIcon } from "lucide-react";
import {
  Sparkles, Globe, Bot, ArrowLeftRight,
  Hexagon, Clapperboard,
  ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight,
  Activity, Zap, FileText, ChevronDown, Layers, Wrench, Monitor,
  Workflow, Boxes, Server, Database, HardDrive,
} from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import { useChatAgentsStore } from "@/services/chat/agents";
import "../../styles/components/sidebar.css";

interface SidebarProps {
  view: ViewId;
  setView: (view: ViewId) => void;
  networks: Network[];
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
const ORCHESTRATOR_ITEM = { id: "orchestrator" as ViewId, label: "Orchestrator", icon: Workflow, accent: "#22d3ee", gradient: ["#22d3ee", "#a78bfa"] as [string, string] };
const STUDIO_ITEM = { id: "jobs" as ViewId, label: "Studio", icon: Clapperboard, accent: "#8b5cf6", gradient: ["#8b5cf6", "#a78bfa"] as [string, string] };
const LIBP2P_ITEM = { id: "libp2p" as ViewId, label: "libp2p", icon: Globe, accent: "#38bdf8", gradient: ["#38bdf8", "#a78bfa"] as [string, string] };
const TOOLKITS_ITEM = { id: "toolkits" as ViewId, label: "Tool Kits", icon: Wrench, accent: "#f97316", gradient: ["#f97316", "#fb923c"] as [string, string] };
const SYSTEM_ITEM = { id: "system" as ViewId, label: "System", icon: Monitor, accent: "#64748b", gradient: ["#64748b", "#94a3b8"] as [string, string] };

const ORCHESTRATOR_SUB_ITEMS: { id: ViewId; label: string; icon: LucideIcon; accent: string; gradient: [string, string] }[] = [
  { id: "libp2p", label: "libp2p", icon: Globe, accent: "#38bdf8", gradient: ["#38bdf8", "#a78bfa"] },
  { id: "helia", label: "Helia", icon: Boxes, accent: "#a78bfa", gradient: ["#a78bfa", "#c084fc"] },
  { id: "kubo", label: "Kubo", icon: Server, accent: "#34d399", gradient: ["#34d399", "#10b981"] },
  { id: "orbitdb", label: "OrbitDB", icon: Database, accent: "#fb923c", gradient: ["#fb923c", "#f97316"] },
  { id: "orbitdb-server", label: "Lagrange", icon: HardDrive, accent: "#f472b6", gradient: ["#f472b6", "#fb7185"] },
];

const ORCHESTRATOR_VIEWS: Set<ViewId> = new Set([
  "orchestrator",
  "libp2p",
  "helia",
  "kubo",
  "orbitdb",
  "orbitdb-server",
]);

const NAV_ITEMS: { id: ViewId; label: string; icon: LucideIcon; accent: string; gradient: [string, string] }[] = [
  { id: "networks", label: "Networks", icon: Globe, accent: "#38bdf8", gradient: ["#38bdf8", "#60a5fa"] },
  { id: "agents", label: "Agents", icon: Bot, accent: "#00e5a0", gradient: ["#00e5a0", "#34d399"] },
  { id: "channels", label: "Channels", icon: ArrowLeftRight, accent: "#a78bfa", gradient: ["#a78bfa", "#c084fc"] },
  { id: "groups", label: "Groups", icon: Hexagon, accent: "#f472b6", gradient: ["#f472b6", "#fb7185"] },
];

const ECOSYSTEM_VIEWS: Set<ViewId> = new Set(["networks", "agents", "channels", "groups"]);

export function Sidebar({ view, setView, networks, messages, bridgeMessages, agents, channels, groups, collapsed, setCollapsed, isMobile, ecosystemName, totalUnread }: SidebarProps) {
  const navRef = useRef<HTMLElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [ecoExpanded, setEcoExpanded] = useState(() => ECOSYSTEM_VIEWS.has(view));
  const [orcExpanded, setOrcExpanded] = useState(() => ORCHESTRATOR_VIEWS.has(view));

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
  }, [isMobile, networks.length, messages.length, bridgeMessages.length, agents.length, channels.length, groups.length]);

  const scroll = (direction: 'left' | 'right') => {
    if (navRef.current) {
      const scrollAmount = 200;
      navRef.current.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
    }
  };

  const getAccentType = (tabId: ViewId): string => {
    switch (tabId) {
      case "architect":
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
      case "system":
        return "info";
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
        {/* ─── Ecosystem: label opens Navigator + chat, chevron toggles submenu ─── */}
        <div className="sidebar-split-row">
          <button
            onClick={() => {
              if (collapsed && !isMobile) {
                setCollapsed(false);
              }
              setView("navigator");
              useChatAgentsStore.getState().open("navigator-bot");
            }}
            title={collapsed && !isMobile ? (ecosystemName || "Ecosystem") : undefined}
            className={`sidebar-nav-item sidebar-split-row__main sidebar-eco-toggle ${view === "navigator" || ECOSYSTEM_VIEWS.has(view) ? 'active' : ''}`}
            data-accent="accent"
          >
            {(view === "navigator" || ECOSYSTEM_VIEWS.has(view))
              ? <GradientIcon icon={Layers} size={14} gradient={["#00e5a0", "#38bdf8"]} />
              : <Layers size={14} />
            }
            {collapsed && !isMobile && (
              <>
                {(networks.length + agents.length + channels.length + groups.length) > 0 && (
                  <span className="sidebar-badge accent">{networks.length + agents.length + channels.length + groups.length}</span>
                )}
              </>
            )}
            {(!collapsed || isMobile) && (
              <span className="sidebar-eco-name">{ecosystemName || "Ecosystem"}</span>
            )}
          </button>
          {(!collapsed || isMobile) && (
            <button
              type="button"
              onClick={() => setEcoExpanded((v) => !v)}
              className="sidebar-split-row__chevron"
              title={ecoExpanded ? "Collapse ecosystem" : "Expand ecosystem"}
              aria-expanded={ecoExpanded}
              aria-label={ecoExpanded ? "Collapse ecosystem" : "Expand ecosystem"}
            >
              <ChevronDown size={12} className={`sidebar-eco-chevron${ecoExpanded ? ' sidebar-eco-chevron--open' : ''}`} />
            </button>
          )}
        </div>

        {/* ─── Ecosystem Sub-items ─── */}
        {ecoExpanded && (!collapsed || isMobile) && (
          <div className="sidebar-eco-subitems">
            {NAV_ITEMS.map((tab) => {
              const badgeCount =
                tab.id === "networks" ? networks.length :
                tab.id === "agents" ? agents.length :
                tab.id === "channels" ? channels.length :
                tab.id === "groups" ? groups.length :
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
                  {badgeCount > 0 && (
                    <span className={`sidebar-count ${getAccentType(tab.id)}`}>{badgeCount}</span>
                  )}
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

      {/* ─── Orchestrator: label activates the bot, chevron toggles the submenu ─── */}
      <div className="sidebar-split-row">
        <button
          onClick={() => setView(ORCHESTRATOR_ITEM.id)}
          title={collapsed && !isMobile ? ORCHESTRATOR_ITEM.label : undefined}
          className={`sidebar-nav-item sidebar-split-row__main sidebar-nav-item--orchestrator ${ORCHESTRATOR_VIEWS.has(view) ? 'active' : ''}`}
          data-accent="info"
          style={ORCHESTRATOR_VIEWS.has(view) ? { color: ORCHESTRATOR_ITEM.accent } : undefined}
        >
          {ORCHESTRATOR_VIEWS.has(view)
            ? <GradientIcon icon={ORCHESTRATOR_ITEM.icon} size={14} gradient={ORCHESTRATOR_ITEM.gradient} />
            : <ORCHESTRATOR_ITEM.icon size={14} />
          }
          {(!collapsed || isMobile) && (
            <span className="sidebar-eco-name">{ORCHESTRATOR_ITEM.label}</span>
          )}
        </button>
        {(!collapsed || isMobile) && (
          <button
            type="button"
            onClick={() => setOrcExpanded((v) => !v)}
            className="sidebar-split-row__chevron"
            title={orcExpanded ? "Collapse orchestrator toolkits" : "Expand orchestrator toolkits"}
            aria-expanded={orcExpanded}
            aria-label={orcExpanded ? "Collapse orchestrator toolkits" : "Expand orchestrator toolkits"}
          >
            <ChevronDown size={12} className={`sidebar-eco-chevron${orcExpanded ? ' sidebar-eco-chevron--open' : ''}`} />
          </button>
        )}
      </div>

      {orcExpanded && (!collapsed || isMobile) && (
        <div className="sidebar-eco-subitems">
          {ORCHESTRATOR_SUB_ITEMS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              className={`sidebar-nav-item sidebar-nav-subitem ${view === tab.id ? 'active' : ''}`}
              data-accent="info"
              style={view === tab.id ? { color: tab.accent } : undefined}
              title={tab.label}
            >
              {view === tab.id
                ? <GradientIcon icon={tab.icon} size={13} gradient={tab.gradient} />
                : <tab.icon size={13} />
              }
              {tab.label}
            </button>
          ))}
        </div>
      )}

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
        onClick={() => setView(LIBP2P_ITEM.id)}
        title={collapsed && !isMobile ? LIBP2P_ITEM.label : undefined}
        className={`sidebar-nav-item sidebar-nav-item--libp2p ${view === LIBP2P_ITEM.id ? 'active' : ''}`}
        data-accent="info"
        style={{ display: "none" }}
        hidden
        aria-hidden="true"
      >
        {view === LIBP2P_ITEM.id
          ? <GradientIcon icon={LIBP2P_ITEM.icon} size={14} gradient={LIBP2P_ITEM.gradient} />
          : <LIBP2P_ITEM.icon size={14} />
        }
        {(!collapsed || isMobile) && (
          <>
            {LIBP2P_ITEM.label}
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

      <button
        onClick={() => setView(SYSTEM_ITEM.id)}
        title={collapsed && !isMobile ? SYSTEM_ITEM.label : undefined}
        className={`sidebar-nav-item sidebar-nav-item--system ${view === SYSTEM_ITEM.id ? 'active' : ''}`}
        data-accent="info"
        style={view === SYSTEM_ITEM.id ? { color: SYSTEM_ITEM.accent } : undefined}
      >
        {view === SYSTEM_ITEM.id
          ? <GradientIcon icon={SYSTEM_ITEM.icon} size={14} gradient={SYSTEM_ITEM.gradient} />
          : <SYSTEM_ITEM.icon size={14} />
        }
        {(!collapsed || isMobile) && (
          <>
            {SYSTEM_ITEM.label}
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
