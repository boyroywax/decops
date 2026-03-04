import type { ViewId, NavContext, Network, Agent, Group, Channel } from "@/types";
import { ChevronRight, Globe, Bot } from "lucide-react";
import { TOOLKITS } from "@/constants";
import "../../styles/components/breadcrumb.css";

interface BreadcrumbProps {
  navContext: NavContext;
  navigateTo: (view: ViewId, ctx: NavContext) => void;
  ecosystems: Network[];
  agents: Agent[];
  groups: Group[];
  channels?: Channel[];
  /** When true, the trail starts from "Agents" instead of "Networks" */
  agentRoot?: boolean;
}

export function Breadcrumb({ navContext, navigateTo, ecosystems, agents, groups, channels = [], agentRoot }: BreadcrumbProps) {
  const network = ecosystems.find(n => n.id === navContext.networkId);
  const group = groups.find(g => g.id === navContext.groupId);
  const agent = agents.find(a => a.id === navContext.agentId);
  const channel = channels.find(c => c.id === navContext.channelId);
  const toolkit = navContext.toolkitId ? TOOLKITS.find(t => t.id === navContext.toolkitId) : null;

  const items: { label: string; color?: string; icon?: React.ReactNode; onClick?: () => void }[] = [];

  if (agentRoot) {
    // Agent-rooted breadcrumb: Agents → Agent Name → Toolkit
    items.push({
      label: "Agents",
      icon: <Bot size={12} />,
      onClick: () => navigateTo("agents", {}),
    });

    if (agent) {
      const isActive = !navContext.toolkitId;
      items.push({
        label: agent.name,
        color: "#00e5a0",
        onClick: isActive ? undefined : () => navigateTo("agents", { agentId: agent.id }),
      });
    }

    if (toolkit) {
      items.push({
        label: toolkit.name,
        color: toolkit.color,
      });
    }
  } else {
    // Network-rooted breadcrumb: Networks → Network → Group → Agent → Toolkit
    items.push({
      label: "Networks",
      icon: <Globe size={12} />,
      onClick: () => navigateTo("networks", {}),
    });

    if (network) {
      const isActive = !navContext.groupId && !navContext.agentId;
      items.push({
        label: network.name,
        color: network.color,
        onClick: isActive ? undefined : () => navigateTo("networks", { networkId: network.id }),
      });
    }

    if (group && navContext.networkId) {
      const isActive = !navContext.agentId;
      items.push({
        label: group.name,
        color: group.color,
        onClick: isActive ? undefined : () => navigateTo("networks", { networkId: navContext.networkId!, groupId: group.id }),
      });
    }

    if (agent) {
      const isActive = !navContext.toolkitId;
      items.push({
        label: agent.name,
        onClick: isActive ? undefined : () => navigateTo("networks", { networkId: navContext.networkId!, groupId: navContext.groupId, agentId: agent.id }),
      });
    }

    if (toolkit) {
      items.push({
        label: toolkit.name,
        color: toolkit.color,
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
              {item.icon}
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
