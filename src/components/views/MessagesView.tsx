import type { RefObject } from "react";
import type { Agent, Channel, Group, Message, Network, Bridge, BridgeMessage } from "../../types";
import { MessageSquare, ArrowLeftRight, Hexagon, X, Link2 } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import { ROLES, CHANNEL_TYPES } from "../../constants";
import { SectionTitle, BulkCheckbox, BulkActionBar } from "../shared/ui";
import { useBulkSelect } from "../../hooks/useBulkSelect";
import "../../styles/components/messages.css";

interface MessagesViewProps {
  agents: Agent[];
  channels: Channel[];
  groups: Group[];
  messages: Message[];
  activeChannel: string | null;
  setActiveChannel: (v: string | null) => void;
  msgInput: string;
  setMsgInput: (v: string) => void;
  sending: boolean;
  broadcastGroup: string | null;
  setBroadcastGroup: (v: string | null) => void;
  broadcastInput: string;
  setBroadcastInput: (v: string) => void;
  broadcasting: boolean;
  msgEndRef: RefObject<HTMLDivElement | null>;
  channelMessages: Message[];
  acFrom: Agent | null | undefined;
  acTo: Agent | null | undefined;
  sendMessage: () => void;
  sendBroadcast: () => void;
  removeMessages: (ids: Set<string>) => void;
  // Bridge messaging props
  ecosystems: Network[];
  bridges: Bridge[];
  bridgeMessages: BridgeMessage[];
  selectedBridge: string | null;
  setSelectedBridge: (v: string | null) => void;
  bridgeMsgInput: string;
  setBridgeMsgInput: (v: string) => void;
  bridgeSending: boolean;
  selBridgeFrom: Agent | undefined;
  selBridgeTo: Agent | undefined;
  selBridgeFromNet: Network | null | undefined;
  selBridgeToNet: Network | null | undefined;
  sendBridgeMessage: () => void;
}

import { marked } from "marked";
import { useMemo } from "react";

import DOMPurify from "dompurify";

// Configure marked
marked.setOptions({
  breaks: true,
  gfm: true,
});

const FormattedMessage = ({ content, className, style }: { content: string, className?: string, style?: React.CSSProperties }) => {
  const html = useMemo(() => {
    try {
      const raw = marked.parse(content) as string;
      return DOMPurify.sanitize(raw);
    } catch {
      return content;
    }
  }, [content]);

  return <div className={className} style={style} dangerouslySetInnerHTML={{ __html: html }} />;
};

export function MessagesView({
  agents, channels, groups, messages,
  activeChannel, setActiveChannel, msgInput, setMsgInput, sending,
  broadcastGroup, setBroadcastGroup, broadcastInput, setBroadcastInput, broadcasting,
  msgEndRef, channelMessages, acFrom, acTo,
  sendMessage, sendBroadcast, removeMessages,
  ecosystems, bridges, bridgeMessages,
  selectedBridge, setSelectedBridge, bridgeMsgInput, setBridgeMsgInput,
  bridgeSending, selBridgeFrom, selBridgeTo, selBridgeFromNet, selBridgeToNet,
  sendBridgeMessage,
}: MessagesViewProps) {
  const bulk = useBulkSelect();

  // Determine which messaging mode is active
  const isBridgeMode = !!selectedBridge && !activeChannel && !broadcastGroup;

  const visibleMessages = activeChannel && !broadcastGroup && !selectedBridge
    ? channelMessages
    : broadcastGroup && !selectedBridge
      ? (() => {
        const group = groups.find((g) => g.id === broadcastGroup);
        if (!group) return [];
        return messages.filter((m) => m.content.includes(`[GROUP BROADCAST — ${group.name}]`) && group.members.includes(m.toId));
      })()
      : [];

  const handleBulkDelete = () => {
    removeMessages(bulk.selected);
    bulk.clearSelection();
  };

  return (
    <div className="messages-layout">
      {/* Channel list sidebar */}
      <div className="messages-sidebar">
        <h2 className="messages-sidebar__title"><GradientIcon icon={MessageSquare} size={18} gradient={["#fbbf24", "#fb923c"]} /> Messages</h2>
        <SectionTitle text="P2P Channels" />
        {channels.length === 0 && <div className="messages-sidebar__empty">No channels</div>}
        {channels.map((ch) => {
          const from = agents.find((a) => a.id === ch.from);
          const to = agents.find((a) => a.id === ch.to);
          const msgCount = messages.filter((m) => m.channelId === ch.id).length;
          if (!from || !to) return null;
          const isAc = activeChannel === ch.id && !broadcastGroup && !selectedBridge;
          return (
            <button key={ch.id} onClick={() => { setActiveChannel(ch.id); setBroadcastGroup(null); setSelectedBridge(null); bulk.clearSelection(); }} className={`channel-btn${isAc ? " channel-btn--active-p2p" : ""}`}>
              <div className="channel-btn__label">{from.name} <ArrowLeftRight size={10} /> {to.name}</div>
              <div className="channel-btn__meta">
                {CHANNEL_TYPES.find((t) => t.id === ch.type)?.icon} {CHANNEL_TYPES.find((t) => t.id === ch.type)?.label}
                {msgCount > 0 && <span className="channel-btn__msg-count">{msgCount} msgs</span>}
              </div>
            </button>
          );
        })}
        {groups.length > 0 && (
          <>
            <div className="messages-sidebar__section-gap"><SectionTitle text="Group Broadcast" /></div>
            {groups.map((g) => {
              const isAc = broadcastGroup === g.id && !selectedBridge;
              return (
                <button key={g.id} onClick={() => { setBroadcastGroup(g.id); setActiveChannel(null); setSelectedBridge(null); bulk.clearSelection(); }} className={`channel-btn${isAc ? " channel-btn--active-group" : ""}`} style={isAc ? { background: g.color + "12", borderColor: g.color + "30" } : undefined}>
                  <div className="channel-btn__label" style={isAc ? { color: g.color } : undefined}><Hexagon size={10} /> {g.name}</div>
                  <div className="channel-btn__meta">{g.members.length} members</div>
                </button>
              );
            })}
          </>
        )}
        {bridges.length > 0 && (
          <>
            <div className="messages-sidebar__section-gap"><SectionTitle text="Bridge Channels" /></div>
            {bridges.map((b) => {
              const fNet = ecosystems.find((n) => n.id === b.fromNetworkId);
              const tNet = ecosystems.find((n) => n.id === b.toNetworkId);
              const fA = fNet?.agents.find((a) => a.id === b.fromAgentId);
              const tA = tNet?.agents.find((a) => a.id === b.toAgentId);
              const bmCount = bridgeMessages.filter((m) => m.bridgeId === b.id).length;
              const isAc = selectedBridge === b.id;
              return (
                <button key={b.id} onClick={() => { setSelectedBridge(isAc ? null : b.id); setActiveChannel(null); setBroadcastGroup(null); bulk.clearSelection(); }} className={`channel-btn${isAc ? " channel-btn--active-bridge" : ""}`}>
                  <div className="channel-btn__label">
                    {fA?.name || "?"} <Link2 size={10} /> {tA?.name || "?"}
                  </div>
                  <div className="channel-btn__meta channel-btn__meta--bridge">
                    <span style={{ color: fNet?.color }}>{fNet?.name}</span>
                    <span>→</span>
                    <span style={{ color: tNet?.color }}>{tNet?.name}</span>
                    {bmCount > 0 && <span className="channel-btn__msg-count--bridge">{bmCount} msgs</span>}
                  </div>
                </button>
              );
            })}
          </>
        )}
      </div>

      {/* Message thread */}
      <div className="msg-thread">
        {(activeChannel || broadcastGroup || isBridgeMode) ? (
          <>
            <div className="msg-thread__header">
              <div>
                {activeChannel && !broadcastGroup && !selectedBridge && acFrom && acTo && (
                  <div>
                    <div className="msg-thread__header-title">
                      <span style={{ color: ROLES.find(r => r.id === acFrom.role)?.color }}>{acFrom.name}</span>
                      <span className="msg-thread__header-arrow">→</span>
                      <span style={{ color: ROLES.find(r => r.id === acTo.role)?.color }}>{acTo.name}</span>
                    </div>
                    <div className="msg-thread__header-subtitle">{acTo.prompt ? `${acTo.name} will respond using its prompt` : `${acTo.name} has no prompt`}</div>
                  </div>
                )}
                {broadcastGroup && !selectedBridge && (
                  <div>
                    <div className="msg-thread__header-broadcast" style={{ color: groups.find(g => g.id === broadcastGroup)?.color }}><Hexagon size={12} /> {groups.find(g => g.id === broadcastGroup)?.name} — Broadcast</div>
                  </div>
                )}
                {isBridgeMode && selBridgeFrom && selBridgeTo && (
                  <div>
                    <div className="msg-thread__header-title">
                      <span style={{ color: ROLES.find(r => r.id === selBridgeFrom.role)?.color }}>{selBridgeFrom.name}</span>
                      <Link2 size={12} color="#38bdf8" style={{ margin: "0 8px" }} />
                      <span style={{ color: ROLES.find(r => r.id === selBridgeTo.role)?.color }}>{selBridgeTo.name}</span>
                    </div>
                    <div className="msg-thread__header-subtitle msg-thread__header-subtitle--bridge">
                      Cross-network bridge · <span style={{ color: selBridgeFromNet?.color }}>{selBridgeFromNet?.name}</span> → <span style={{ color: selBridgeToNet?.color }}>{selBridgeToNet?.name}</span>
                    </div>
                  </div>
                )}
              </div>
              {!isBridgeMode && visibleMessages.length > 0 && (
                <BulkCheckbox
                  checked={bulk.isAllSelected(visibleMessages.map(m => m.id))}
                  onChange={() => bulk.toggleAll(visibleMessages.map(m => m.id))}
                  color="#fbbf24"
                />
              )}
            </div>
            <div className="msg-thread__body">
              {/* P2P Channel Messages */}
              {activeChannel && !broadcastGroup && !selectedBridge && channelMessages.length === 0 && (
                <div className="msg-thread__empty">
                  <GradientIcon icon={MessageSquare} size={24} gradient={["#fbbf24", "#fb923c"]} />
                  <div className="msg-thread__empty-text">No messages yet.</div>
                </div>
              )}
              {activeChannel && !broadcastGroup && !selectedBridge && channelMessages.map((m) => {
                const sender = agents.find((a) => a.id === m.fromId);
                const receiver = agents.find((a) => a.id === m.toId);
                const sRole = sender ? ROLES.find(r => r.id === sender.role) : null;
                const rRole = receiver ? ROLES.find(r => r.id === receiver.role) : null;
                const isChecked = bulk.has(m.id);
                return (
                  <div key={m.id} className={`msg-item${isChecked ? " msg-item--checked" : ""}`}>
                    <div className="msg-row">
                      <BulkCheckbox checked={isChecked} onChange={() => bulk.toggle(m.id)} color="#fbbf24" />
                      <div className="msg-avatar" style={{ background: (sRole?.color || "#555") + "20", border: `1px solid ${sRole?.color || "#555"}30` }}>{sRole?.icon}</div>
                      <div className="msg-content">
                        <div className="msg-sender" style={{ color: sRole?.color }}>{sender?.name} <span className="msg-sender__timestamp">{new Date(m.ts).toLocaleTimeString()}</span></div>
                        <FormattedMessage content={m.content} className="chat-md msg-bubble--sent" />
                      </div>
                    </div>
                    {m.status === "sending" && <div className="msg-thinking"><span className="msg-thinking__dot">●</span> {receiver?.name} is thinking...</div>}
                    {m.response && (
                      <div className="msg-row--reply">
                        <div className="msg-avatar" style={{ background: (rRole?.color || "#555") + "20", border: `1px solid ${rRole?.color || "#555"}30` }}>{rRole?.icon}</div>
                        <div className="msg-content">
                          <div className="msg-sender" style={{ color: rRole?.color }}>{receiver?.name} <span className={`msg-sender__status${m.status === "no-prompt" ? " msg-sender__status--no-prompt" : " msg-sender__status--response"}`}>{m.status === "no-prompt" ? "no prompt" : "response"}</span></div>
                          <FormattedMessage content={m.response} className={`chat-md msg-bubble--received${m.status === "no-prompt" ? " msg-bubble--no-prompt" : ""}`} style={m.status !== "no-prompt" ? { background: (rRole?.color || "#555") + "08", border: `1px solid ${(rRole?.color || "#555")}15` } : undefined} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Group Broadcast Messages */}
              {broadcastGroup && !selectedBridge && (() => {
                const group = groups.find((g) => g.id === broadcastGroup);
                if (!group) return null;
                const bMsgs = messages.filter((m) => m.content.includes(`[GROUP BROADCAST — ${group.name}]`) && group.members.includes(m.toId));
                if (bMsgs.length === 0) return (
                  <div className="msg-thread__empty">
                    <GradientIcon icon={Hexagon} size={24} gradient={["#f472b6", "#fb7185"]} />
                    <div className="msg-thread__empty-text">No broadcasts yet.</div>
                  </div>
                );
                return bMsgs.map((m) => {
                  const receiver = agents.find((a) => a.id === m.toId);
                  const rRole = receiver ? ROLES.find(r => r.id === receiver.role) : null;
                  const isChecked = bulk.has(m.id);
                  return (
                    <div key={m.id} className={`msg-item msg-item--broadcast${isChecked ? " msg-item--checked" : ""}`}>
                      <BulkCheckbox checked={isChecked} onChange={() => bulk.toggle(m.id)} color="#fbbf24" />
                      <div className="msg-avatar" style={{ background: (rRole?.color || "#555") + "20", border: `1px solid ${rRole?.color || "#555"}30` }}>{rRole?.icon}</div>
                      <div className="msg-content">
                        <div className="msg-sender" style={{ color: rRole?.color }}>{receiver?.name}</div>
                        {m.response && <FormattedMessage content={m.response} className="chat-md msg-bubble--broadcast" style={{ background: (rRole?.color || "#555") + "08", border: `1px solid ${(rRole?.color || "#555")}15` }} />}
                        {m.status === "sending" && <div className="msg-thinking--broadcast">● thinking...</div>}
                      </div>
                    </div>
                  );
                });
              })()}
              {/* Bridge Messages */}
              {isBridgeMode && selBridgeFrom && selBridgeTo && (() => {
                const bMsgs = bridgeMessages.filter((m) => m.bridgeId === selectedBridge);
                if (bMsgs.length === 0) return (
                  <div className="msg-thread__empty">
                    <GradientIcon icon={Link2} size={24} gradient={["#38bdf8", "#818cf8"]} />
                    <div className="msg-thread__empty-text--gap">Send a message across the bridge.</div>
                  </div>
                );
                return bMsgs.map((m) => {
                  const sRole = ROLES.find((r) => r.id === selBridgeFrom.role);
                  const rRole = ROLES.find((r) => r.id === selBridgeTo.role);
                  return (
                    <div key={m.id} className="msg-item">
                      <div className="msg-row">
                        <div className="msg-avatar" style={{ background: (sRole?.color || "#555") + "20", border: `1px solid ${sRole?.color || "#555"}30` }}>{sRole?.icon}</div>
                        <div className="msg-content">
                          <div className="msg-sender" style={{ color: sRole?.color }}>{selBridgeFrom.name} <span className="msg-sender__net">({selBridgeFromNet?.name})</span> <span className="msg-sender__timestamp">{new Date(m.ts).toLocaleTimeString()}</span></div>
                          <FormattedMessage content={m.content} className="chat-md msg-bubble--sent" />
                        </div>
                      </div>
                      {m.status === "sending" && <div className="msg-thinking--bridge"><span className="msg-thinking__dot">●</span> {selBridgeTo.name} is thinking…</div>}
                      {m.response && (
                        <div className="msg-row--reply">
                          <div className="msg-avatar" style={{ background: (rRole?.color || "#555") + "20", border: `1px solid ${rRole?.color || "#555"}30` }}>{rRole?.icon}</div>
                          <div className="msg-content">
                            <div className="msg-sender" style={{ color: rRole?.color }}>{selBridgeTo.name} <span className="msg-sender__net">({selBridgeToNet?.name})</span> <span className={`msg-sender__status${m.status === "no-prompt" ? " msg-sender__status--no-prompt" : " msg-sender__status--response"}`}>{m.status === "no-prompt" ? "no prompt" : "response"}</span></div>
                            <FormattedMessage content={m.response} className={`chat-md msg-bubble--received msg-bubble--bridge-response${m.status === "no-prompt" ? " msg-bubble--no-prompt" : ""}`} style={m.status !== "no-prompt" ? { background: (rRole?.color || "#555") + "08", border: `1px solid ${(rRole?.color || "#555")}15` } : undefined} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
              <div ref={msgEndRef} />
            </div>
            {/* Input area */}
            <div className="msg-input-bar">
              {bulk.count > 0 ? (
                <BulkActionBar
                  count={bulk.count}
                  total={visibleMessages.length}
                  onSelectAll={() => bulk.selectAll(visibleMessages.map(m => m.id))}
                  onClear={bulk.clearSelection}
                  onDelete={handleBulkDelete}
                  allSelected={bulk.isAllSelected(visibleMessages.map(m => m.id))}
                  entityName="message"
                />
              ) : (
                <>
                  {activeChannel && !broadcastGroup && !selectedBridge && (
                    <div className="msg-input-row">
                      <input placeholder={`Message ${acTo?.name || "agent"}...`} value={msgInput} onChange={(e) => setMsgInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()} disabled={sending} className={`input msg-input--p2p${sending ? " msg-input--sending" : ""}`} />
                      <button onClick={sendMessage} disabled={sending || !msgInput.trim()} className="msg-send-btn">{sending ? "…" : "Send"}</button>
                    </div>
                  )}
                  {broadcastGroup && !selectedBridge && (
                    <div className="msg-input-row">
                      <input placeholder="Broadcast to all members..." value={broadcastInput} onChange={(e) => setBroadcastInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendBroadcast()} disabled={broadcasting} className={`input${broadcasting ? " msg-input--sending" : ""}`} style={{ borderColor: (groups.find(g => g.id === broadcastGroup)?.color || "#f472b6") + "25" }} />
                      <button onClick={sendBroadcast} disabled={broadcasting || !broadcastInput.trim()} className="msg-send-btn" style={!broadcasting ? { background: groups.find(g => g.id === broadcastGroup)?.color || "#f472b6" } : undefined}>{broadcasting ? "…" : "Broadcast"}</button>
                    </div>
                  )}
                  {isBridgeMode && selBridgeTo && (
                    <div className="msg-input-row">
                      <input placeholder={`Message ${selBridgeTo.name} across bridge...`} value={bridgeMsgInput} onChange={(e) => setBridgeMsgInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendBridgeMessage()} disabled={bridgeSending} className={`input msg-input--bridge${bridgeSending ? " msg-input--sending" : ""}`} />
                      <button onClick={sendBridgeMessage} disabled={bridgeSending || !bridgeMsgInput.trim()} className="msg-send-btn msg-send-btn--bridge">{bridgeSending ? "…" : "Send"}</button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <div className="msg-thread__placeholder">
            <div className="msg-thread__placeholder-inner">
              <GradientIcon icon={MessageSquare} size={32} gradient={["#fbbf24", "#fb923c"]} />
              <div className="msg-thread__placeholder-text">Select a channel, group, or bridge.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
