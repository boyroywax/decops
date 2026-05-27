/**
 * EcosystemMessagesList — read-only chat dialogue rendering for any
 * ecosystem selection made in the EcosystemPanel.
 *
 * Renders the appropriate slice of workspace state (p2p channel messages,
 * group broadcast messages, bridge messages, or the unified overview)
 * inside the chat panel body, replacing the LLM ChatMessageList while
 * an ecosystem selection is active.
 *
 * AI agent DMs are intentionally NOT handled here — those route through
 * the regular ChatMessageList via the active chat agent.
 */
import { useMemo, type ReactNode } from "react";
import { Globe, ArrowLeftRight, Hexagon, Link2, X } from "lucide-react";
import type {
  Agent,
  Channel,
  Group,
  Message,
  BridgeMessage,
  Network,
  Bridge,
} from "@/types";
import type { EcosystemSelection } from "./ecosystemSelection";

interface EcosystemMessagesListProps {
  selection: EcosystemSelection;
  onClear: () => void;
  agents: Agent[];
  channels: Channel[];
  groups: Group[];
  messages: Message[];
  networks: Network[];
  bridges: Bridge[];
  bridgeMessages: BridgeMessage[];
}

type Row = {
  id: string;
  fromId: string;
  toId: string;
  content: string;
  response: string | null;
  ts: number;
  source: "p2p" | "broadcast" | "bridge" | "network";
  networkName?: string;
  networkColor?: string;
};

function nameOf(agents: Agent[], networks: Network[], id: string): string {
  const a = agents.find((x) => x.id === id);
  if (a) return a.name;
  for (const n of networks) {
    const na = n.agents.find((x) => x.id === id);
    if (na) return na.name;
  }
  return id.slice(0, 8);
}

export function EcosystemMessagesList({
  selection,
  onClear,
  agents,
  channels,
  groups,
  messages,
  networks,
  bridges,
  bridgeMessages,
}: EcosystemMessagesListProps) {
  const { rows, header } = useMemo(() => {
    const rs: Row[] = [];
    let hdr: { icon: ReactNode; title: string; subtitle?: string } = {
      icon: <Globe size={12} />,
      title: "Ecosystem overview",
    };

    if (selection.kind === "overview") {
      messages.forEach((m) =>
        rs.push({
          id: m.id,
          fromId: m.fromId,
          toId: m.toId,
          content: m.content,
          response: m.response,
          ts: m.ts,
          source: "p2p",
        }),
      );
      bridgeMessages.forEach((m) =>
        rs.push({
          id: m.id,
          fromId: m.fromId,
          toId: m.toId,
          content: m.content,
          response: m.response,
          ts: m.ts,
          source: "bridge",
        }),
      );
      networks.forEach((n) =>
        (n.messages || []).forEach((m) =>
          rs.push({
            id: `${n.id}:${m.id}`,
            fromId: m.fromId,
            toId: m.toId,
            content: m.content,
            response: m.response,
            ts: m.ts,
            source: "network",
            networkName: n.name,
            networkColor: n.color,
          }),
        ),
      );
      rs.sort((a, b) => a.ts - b.ts);
      hdr = {
        icon: <Globe size={12} />,
        title: "Ecosystem overview",
        subtitle: `${rs.length} message${rs.length === 1 ? "" : "s"} across all sources`,
      };
    } else if (selection.kind === "p2p") {
      const ch = channels.find((c) => c.id === selection.channelId);
      const from = ch ? nameOf(agents, networks, ch.from) : "?";
      const to = ch ? nameOf(agents, networks, ch.to) : "?";
      messages
        .filter((m) => m.channelId === selection.channelId)
        .forEach((m) =>
          rs.push({
            id: m.id,
            fromId: m.fromId,
            toId: m.toId,
            content: m.content,
            response: m.response,
            ts: m.ts,
            source: "p2p",
          }),
        );
      hdr = {
        icon: <ArrowLeftRight size={12} />,
        title: `${from} ↔ ${to}`,
        subtitle: `P2P channel · ${rs.length} message${rs.length === 1 ? "" : "s"}`,
      };
    } else if (selection.kind === "broadcast") {
      const g = groups.find((x) => x.id === selection.groupId);
      // Broadcast messages are stored as Messages with channelId === group.id
      // by convention in MessagesView; mirror that filter here.
      messages
        .filter((m) => m.channelId === selection.groupId)
        .forEach((m) =>
          rs.push({
            id: m.id,
            fromId: m.fromId,
            toId: m.toId,
            content: m.content,
            response: m.response,
            ts: m.ts,
            source: "broadcast",
          }),
        );
      hdr = {
        icon: <Hexagon size={12} />,
        title: g?.name ?? "Group broadcast",
        subtitle: `Broadcast · ${g?.members.length ?? 0} members · ${rs.length} message${rs.length === 1 ? "" : "s"}`,
      };
    } else if (selection.kind === "bridge") {
      const b = bridges.find((x) => x.id === selection.bridgeId);
      const fA = b ? nameOf(agents, networks, b.fromAgentId ?? "") : "?";
      const tA = b ? nameOf(agents, networks, b.toAgentId ?? "") : "?";
      bridgeMessages
        .filter((m) => m.bridgeId === selection.bridgeId)
        .forEach((m) =>
          rs.push({
            id: m.id,
            fromId: m.fromId,
            toId: m.toId,
            content: m.content,
            response: m.response,
            ts: m.ts,
            source: "bridge",
          }),
        );
      hdr = {
        icon: <Link2 size={12} />,
        title: `${fA} → ${tA}`,
        subtitle: `Bridge · ${rs.length} message${rs.length === 1 ? "" : "s"}`,
      };
    }

    return { rows: rs, header: hdr };
  }, [selection, agents, channels, groups, messages, networks, bridges, bridgeMessages]);

  return (
    <div className="chat-eco-msgs">
      <div className="chat-eco-msgs__header">
        <div className="chat-eco-msgs__header-title">
          {header.icon}
          <span>{header.title}</span>
        </div>
        <div className="chat-eco-msgs__header-right">
          {header.subtitle && (
            <span className="chat-eco-msgs__header-sub">{header.subtitle}</span>
          )}
          <button
            type="button"
            onClick={onClear}
            className="chat-eco-msgs__close"
            title="Return to chat conversation"
            aria-label="Close ecosystem view"
          >
            <X size={11} />
          </button>
        </div>
      </div>

      <div className="chat-eco-msgs__list">
        {rows.length === 0 ? (
          <div className="chat-eco-msgs__empty">
            No messages yet for this selection.
          </div>
        ) : (
          rows.map((r) => {
            const from = nameOf(agents, networks, r.fromId);
            const to = nameOf(agents, networks, r.toId);
            return (
              <div key={r.id} className={`chat-eco-msgs__row chat-eco-msgs__row--${r.source}`}>
                <div className="chat-eco-msgs__row-meta">
                  <span className="chat-eco-msgs__from">{from}</span>
                  <span className="chat-eco-msgs__arrow">→</span>
                  <span className="chat-eco-msgs__to">{to}</span>
                  {r.networkName && (
                    <span
                      className="chat-eco-msgs__net"
                      style={r.networkColor ? { color: r.networkColor } : undefined}
                    >
                      · {r.networkName}
                    </span>
                  )}
                  <span className="chat-eco-msgs__ts">
                    {new Date(r.ts).toLocaleTimeString()}
                  </span>
                </div>
                <div className="chat-eco-msgs__content">{r.content}</div>
                {r.response && (
                  <div className="chat-eco-msgs__response">
                    <span className="chat-eco-msgs__response-label">reply</span>
                    {r.response}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
