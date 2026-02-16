import React, { useRef, useState, useEffect } from "react";
import type { ViewId, Network, Message, BridgeMessage } from "../../types";
import type { LucideIcon } from "lucide-react";
import {
  Sparkles, Globe, Bot, ArrowLeftRight,
  Hexagon, MessageSquare, Network as NetworkIcon, Gem,
  ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight,
  Activity, Zap,
} from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";

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
  { id: "artifacts", label: "Artifacts", icon: Gem, accent: "#818cf8", gradient: ["#818cf8", "#a78bfa"] },
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

  const navContent = (
    <nav
      ref={navRef}
      className={isMobile ? "no-scrollbar" : ""}
      style={{
        width: isMobile ? "100%" : (collapsed ? 60 : 200),
        height: isMobile ? "auto" : "100%",
        borderRight: isMobile ? "none" : "1px solid rgba(0,229,160,0.08)",
        borderBottom: isMobile ? "none" : "none",
        padding: isMobile ? "4px 32px 4px 4px" : "12px 0",
        display: "flex",
        flexDirection: isMobile ? "row" : "column",
        gap: 2,
        background: isMobile ? "transparent" : "rgba(0,0,0,0.3)",
        flexShrink: 0,
        transition: "all 0.2s ease-in-out",
        overflowX: isMobile ? "auto" : "hidden",
        whiteSpace: isMobile ? "nowrap" : "normal",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
    >
      {isMobile && (
        <style>{`
          .no-scrollbar::-webkit-scrollbar { display: none; }
        `}</style>
      )}

      {NAV_ITEMS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setView(tab.id)}
          title={collapsed ? tab.label : undefined}
          style={{
            background: view === tab.id ? tab.accent + "10" : "transparent",
            border: "none",
            color: view === tab.id ? tab.accent : "#71717a",
            padding: isMobile ? "8px 12px" : (collapsed ? "10px 0" : "10px 16px"),
            textAlign: collapsed ? "center" : "left",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 12,
            display: "flex",
            justifyContent: isMobile || collapsed ? "center" : "flex-start",
            alignItems: "center",
            gap: 8,
            borderLeft: !isMobile && view === tab.id ? `2px solid ${tab.accent}` : "2px solid transparent",
            borderBottom: isMobile && view === tab.id ? `2px solid ${tab.accent}` : "2px solid transparent",
            transition: "all 0.15s",
            flexShrink: 0,
          }}
        >
          {view === tab.id
            ? <GradientIcon icon={tab.icon} size={14} gradient={tab.gradient} />
            : <tab.icon size={14} />
          }
          {(!collapsed || isMobile) && (
            <>
              {tab.label}
              {tab.id === "networks" && ecosystems.length > 0 && (
                <span style={{ marginLeft: "auto", fontSize: 9, background: "rgba(56,189,248,0.15)", color: "#38bdf8", padding: "1px 6px", borderRadius: 8 }}>{ecosystems.length}</span>
              )}
              {tab.id === "agents" && agents.length > 0 && (
                <span style={{ marginLeft: "auto", fontSize: 9, background: "rgba(0,229,160,0.15)", color: "#00e5a0", padding: "1px 6px", borderRadius: 8 }}>{agents.length}</span>
              )}
              {tab.id === "channels" && channels.length > 0 && (
                <span style={{ marginLeft: "auto", fontSize: 9, background: "rgba(167,139,250,0.15)", color: "#a78bfa", padding: "1px 6px", borderRadius: 8 }}>{channels.length}</span>
              )}
              {tab.id === "groups" && groups.length > 0 && (
                <span style={{ marginLeft: "auto", fontSize: 9, background: "rgba(244,114,182,0.15)", color: "#f472b6", padding: "1px 6px", borderRadius: 8 }}>{groups.length}</span>
              )}
              {tab.id === "messages" && (messages.length + bridgeMessages.length) > 0 && (
                <span style={{ marginLeft: "auto", fontSize: 9, background: "rgba(251,191,36,0.15)", color: "#fbbf24", padding: "1px 6px", borderRadius: 8 }}>{messages.length + bridgeMessages.length}</span>
              )}
            </>
          )}
        </button>
      ))}

      {!isMobile && (
        <div style={{ marginTop: "auto", padding: collapsed ? "12px 0" : "12px 16px" }}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{
              background: "none",
              border: "none",
              color: "#52525b",
              cursor: "pointer",
              width: "100%",
              display: "flex",
              justifyContent: collapsed ? "center" : "flex-end",
              padding: 4,
              fontSize: 12,
            }}
          >
            {collapsed ? <ChevronsRight size={14} /> : <><ChevronsLeft size={14} /> Collapse</>}
          </button>
        </div>
      )}
    </nav>
  );

  if (isMobile) {
    return (
      <div style={{ position: "relative", width: "100%", background: "rgba(0,0,0,0.3)", borderBottom: "1px solid rgba(0,229,160,0.08)" }}>
        {canScrollLeft && (
          <button
            onClick={() => scroll("left")}
            style={{
              position: "absolute", left: 0, top: 0, bottom: 0, width: 32,
              background: "linear-gradient(to right, #0a0a0f 40%, transparent)",
              border: "none", color: "#e4e4e7", cursor: "pointer", zIndex: 10,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16
            }}
          >
            <ChevronLeft size={14} />
          </button>
        )}

        {navContent}

        {canScrollRight && (
          <button
            onClick={() => scroll("right")}
            style={{
              position: "absolute", right: 0, top: 0, bottom: 0, width: 32,
              background: "linear-gradient(to left, #0a0a0f 40%, transparent)",
              border: "none", color: "#e4e4e7", cursor: "pointer", zIndex: 10,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16
            }}
          >
            <ChevronRight size={14} />
          </button>
        )}
      </div>
    );
  }

  return navContent;
}
