/**
 * EcosystemPanel — chat-panel sibling of ConversationsList.
 *
 * Lists the same selectable surfaces that used to live on the standalone
 * Messages page so the user can drive the chat dialogue display from a
 * single workspace pane:
 *
 *   • Ecosystem overview (unified feed across p2p / broadcast / bridge / network)
 *   • P2P channels
 *   • Group broadcasts
 *   • Cross-network bridges
 *   • AI agent DMs (switches the active chat agent — keeps regular convo
 *     rendering path because the existing LLM conversation IS the agent DM)
 *
 * Picking anything except an AI agent sets `selection` on the parent
 * ChatPanel, which then swaps the dialogue area for EcosystemMessagesList.
 */
import {
  Globe,
  ArrowLeftRight,
  Hexagon,
  Link2,
  Bot,
} from "lucide-react";
import type {
  Agent,
  Channel,
  Group,
  Message,
  BridgeMessage,
  Network,
  Bridge,
} from "@/types";
import type { ChatAgent } from "@/services/chat/agents";
import type { EcosystemSelection } from "./ecosystemSelection";

interface EcosystemPanelProps {
  agents: Agent[];
  channels: Channel[];
  groups: Group[];
  messages: Message[];
  networks: Network[];
  bridges: Bridge[];
  bridgeMessages: BridgeMessage[];

  selection: EcosystemSelection | null;
  onSelect: (sel: EcosystemSelection) => void;

  /** Registered chat agents (LLM-backed). Selecting one calls onSelectAgent. */
  chatAgents: ChatAgent[];
  activeChatAgentId: string | null;
  onSelectAgent: (id: string) => void;

  unreadCounts?: Record<string, number>;
}

function SectionTitle({ text, count }: { text: string; count?: number }) {
  return (
    <div className="chat-eco-panel__section-title">
      <span>{text}</span>
      {count !== undefined && count > 0 && (
        <span className="chat-eco-panel__section-count">{count}</span>
      )}
    </div>
  );
}

export function EcosystemPanel({
  agents,
  channels,
  groups,
  messages,
  networks,
  bridges,
  bridgeMessages,
  selection,
  onSelect,
  chatAgents,
  activeChatAgentId,
  onSelectAgent,
  unreadCounts,
}: EcosystemPanelProps) {
  const totalEcosystemMessages =
    messages.length +
    bridgeMessages.length +
    networks.reduce((s, n) => s + (n.messages?.length || 0), 0);

  const isOverview = selection?.kind === "overview";

  return (
    <div className="chat-eco-panel">
      {/* ── Overview ─────────────────────────────────── */}
      <SectionTitle text="Overview" />
      <button
        type="button"
        onClick={() => onSelect({ kind: "overview" })}
        className={`chat-eco-panel__item${isOverview ? " chat-eco-panel__item--active" : ""}`}
      >
        <div className="chat-eco-panel__item-label">
          <Globe size={11} /> All Messages
        </div>
        <div className="chat-eco-panel__item-meta">
          {totalEcosystemMessages} total
        </div>
      </button>

      {/* ── P2P Channels ─────────────────────────────── */}
      {channels.length > 0 && (
        <>
          <SectionTitle text="P2P Channels" count={channels.length} />
          {channels.map((ch) => {
            const from = agents.find((a) => a.id === ch.from);
            const to = agents.find((a) => a.id === ch.to);
            const count = messages.filter((m) => m.channelId === ch.id).length;
            const unread = unreadCounts?.[ch.id] || 0;
            const isAc = selection?.kind === "p2p" && selection.channelId === ch.id;
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => onSelect({ kind: "p2p", channelId: ch.id })}
                className={`chat-eco-panel__item${isAc ? " chat-eco-panel__item--active" : ""}${unread > 0 ? " chat-eco-panel__item--unread" : ""}`}
              >
                <div className="chat-eco-panel__item-label">
                  {from?.name ?? "?"} <ArrowLeftRight size={9} /> {to?.name ?? "?"}
                  {unread > 0 && (
                    <span className="chat-eco-panel__unread-badge">{unread}</span>
                  )}
                </div>
                <div className="chat-eco-panel__item-meta">
                  {count > 0 ? `${count} msgs` : "no messages"}
                </div>
              </button>
            );
          })}
        </>
      )}

      {/* ── Group Broadcasts ─────────────────────────── */}
      {groups.length > 0 && (
        <>
          <SectionTitle text="Group Broadcasts" count={groups.length} />
          {groups.map((g) => {
            const isAc = selection?.kind === "broadcast" && selection.groupId === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => onSelect({ kind: "broadcast", groupId: g.id })}
                className={`chat-eco-panel__item${isAc ? " chat-eco-panel__item--active" : ""}`}
                style={isAc ? { borderColor: g.color + "60" } : undefined}
              >
                <div className="chat-eco-panel__item-label" style={isAc ? { color: g.color } : undefined}>
                  <Hexagon size={11} /> {g.name}
                </div>
                <div className="chat-eco-panel__item-meta">
                  {g.members.length} members
                </div>
              </button>
            );
          })}
        </>
      )}

      {/* ── Bridges ──────────────────────────────────── */}
      {bridges.length > 0 && (
        <>
          <SectionTitle text="Bridges" count={bridges.length} />
          {bridges.map((b) => {
            const fNet = networks.find((n) => n.id === b.fromNetworkId);
            const tNet = networks.find((n) => n.id === b.toNetworkId);
            const fA = agents.find((a) => a.id === b.fromAgentId)
              || fNet?.agents.find((a) => a.id === b.fromAgentId);
            const tA = agents.find((a) => a.id === b.toAgentId)
              || tNet?.agents.find((a) => a.id === b.toAgentId);
            const count = bridgeMessages.filter((m) => m.bridgeId === b.id).length;
            const isAc = selection?.kind === "bridge" && selection.bridgeId === b.id;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => onSelect({ kind: "bridge", bridgeId: b.id })}
                className={`chat-eco-panel__item${isAc ? " chat-eco-panel__item--active" : ""}`}
              >
                <div className="chat-eco-panel__item-label">
                  {fA?.name ?? "?"} <Link2 size={9} /> {tA?.name ?? "?"}
                </div>
                <div className="chat-eco-panel__item-meta">
                  <span style={{ color: fNet?.color }}>{fNet?.name ?? "?"}</span>
                  <span> → </span>
                  <span style={{ color: tNet?.color }}>{tNet?.name ?? "?"}</span>
                  {count > 0 && <span> · {count} msgs</span>}
                </div>
              </button>
            );
          })}
        </>
      )}

      {/* ── AI Agent DMs ─────────────────────────────── */}
      {chatAgents.length > 0 && (
        <>
          <SectionTitle text="AI Agent DMs" count={chatAgents.length} />
          {chatAgents.map((a) => {
            const isAc = activeChatAgentId === a.id && selection === null;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onSelectAgent(a.id)}
                className={`chat-eco-panel__item${isAc ? " chat-eco-panel__item--active" : ""}`}
              >
                <div className="chat-eco-panel__item-label">
                  <Bot size={11} /> {a.name}
                </div>
                {a.description && (
                  <div className="chat-eco-panel__item-meta">{a.description}</div>
                )}
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}
