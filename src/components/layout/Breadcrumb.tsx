import type { ViewId, NavContext, Network, Agent, Group, Channel } from "@/types";
import { ChevronRight, Globe } from "lucide-react";
import "../../styles/components/breadcrumb.css";

interface BreadcrumbProps {
  navContext: NavContext;
  navigateTo: (view: ViewId, ctx: NavContext) => void;
  ecosystems: Network[];
  agents: Agent[];
  groups: Group[];
  channels?: Channel[];
}

export function Breadcrumb({ navContext, navigateTo, ecosystems, agents, groups, channels = [] }: BreadcrumbProps) {
  const network = ecosystems.find(n => n.id === navContext.networkId);
  const group = groups.find(g => g.id === navContext.groupId);
  const agent = agents.find(a => a.id === navContext.agentId);
  const channel = channels.find(c => c.id === navContext.channelId);

  const items: { label: string; color?: string; onClick?: () => void }[] = [];

  // Root: "Networks"
  items.push({
    label: "Networks",
    onClick: () => navigateTo("networks", {}),
  });

  // Network level
  if (network) {
    const isActive = !navContext.groupId && !navContext.agentId;
    items.push({
      label: network.name,
      color: network.color,
      onClick: isActive ? undefined : () => navigateTo("networks", { networkId: network.id }),
    });
  }

  // Group level
  if (group && navContext.networkId) {
    const isActive = !navContext.agentId;
    items.push({
      label: group.name,
      color: group.color,
      onClick: isActive ? undefined : () => navigateTo("networks", { networkId: navContext.networkId!, groupId: group.id }),
    });
  }

  // Agent level (always the active/leaf node)
  if (agent) {
    items.push({
      label: agent.name,
    });
  }

  // Channel level (leaf node from network → channel path)
  if (channel && navContext.networkId) {
    const fromAgent = agents.find(a => a.id === channel.from);
    const toAgent = agents.find(a => a.id === channel.to);
    items.push({
      label: `${fromAgent?.name || "?"} → ${toAgent?.name || "?"}`,
      color: "#a78bfa",
    });
  }

  return (
    <nav className="breadcrumb" aria-label="Navigation">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: "var(--space-xs)" }}>
            {i > 0 && (
              <span className="breadcrumb__separator">
                <ChevronRight size={12} />
              </span>
            )}
            <button
              className={`breadcrumb__item${isLast ? " breadcrumb__item--active" : ""}`}
              onClick={item.onClick}
              disabled={!item.onClick}
            >
              {i === 0 && <Globe size={12} />}
              {item.color && (
                <span
                  className="breadcrumb__color-dot"
                  style={{ background: item.color, boxShadow: `0 0 6px ${item.color}40` }}
                />
              )}
              {item.label}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
