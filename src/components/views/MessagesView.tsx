import type { RefObject } from "react";
import type { Agent, Channel, Group, Message } from "../../types";
import { MessageSquare, ArrowLeftRight, Hexagon, X } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import { ROLES, CHANNEL_TYPES } from "../../constants";
import { inputStyle, SectionTitle, BulkCheckbox, BulkActionBar } from "../shared/ui";
import { useBulkSelect } from "../../hooks/useBulkSelect";

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
}

import { marked } from "marked";
import { useMemo } from "react";

// Configure marked
marked.setOptions({
  breaks: true,
  gfm: true,
});

const FormattedMessage = ({ content, className, style }: { content: string, className?: string, style?: React.CSSProperties }) => {
  const html = useMemo(() => {
    try {
      return marked.parse(content) as string;
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
}: MessagesViewProps) {
  const bulk = useBulkSelect();

  const visibleMessages = activeChannel && !broadcastGroup
    ? channelMessages
    : broadcastGroup
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
    <div style={{ display: "flex", gap: 16, height: "calc(100vh - 120px)" }}>
      {/* Channel list sidebar */}
      <div style={{ width: 240, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}><GradientIcon icon={MessageSquare} size={18} gradient={["#fbbf24", "#fb923c"]} /> Messages</h2>
        <SectionTitle text="P2P Channels" />
        {channels.length === 0 && <div style={{ fontSize: 10, color: "#3f3f46", padding: 8 }}>No channels</div>}
        {channels.map((ch) => {
          const from = agents.find((a) => a.id === ch.from);
          const to = agents.find((a) => a.id === ch.to);
          const msgCount = messages.filter((m) => m.channelId === ch.id).length;
          if (!from || !to) return null;
          const isAc = activeChannel === ch.id && !broadcastGroup;
          return (
            <button key={ch.id} onClick={() => { setActiveChannel(ch.id); setBroadcastGroup(null); bulk.clearSelection(); }} style={{ background: isAc ? "rgba(251,191,36,0.08)" : "rgba(255,255,255,0.02)", border: `1px solid ${isAc ? "rgba(251,191,36,0.25)" : "rgba(255,255,255,0.05)"}`, borderRadius: 8, padding: "10px 12px", cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "block", width: "100%" }}>
              <div style={{ fontSize: 11, color: isAc ? "#fbbf24" : "#a1a1aa", display: "flex", alignItems: "center", gap: 4 }}>{from.name} <ArrowLeftRight size={10} /> {to.name}</div>
              <div style={{ fontSize: 9, color: "#52525b", marginTop: 3 }}>
                {CHANNEL_TYPES.find((t) => t.id === ch.type)?.icon} {CHANNEL_TYPES.find((t) => t.id === ch.type)?.label}
                {msgCount > 0 && <span style={{ marginLeft: 8, color: "#fbbf24" }}>{msgCount} msgs</span>}
              </div>
            </button>
          );
        })}
        {groups.length > 0 && (
          <>
            <div style={{ marginTop: 8 }}><SectionTitle text="Group Broadcast" /></div>
            {groups.map((g) => {
              const isAc = broadcastGroup === g.id;
              return (
                <button key={g.id} onClick={() => { setBroadcastGroup(g.id); setActiveChannel(null); bulk.clearSelection(); }} style={{ background: isAc ? g.color + "12" : "rgba(255,255,255,0.02)", border: `1px solid ${isAc ? g.color + "30" : "rgba(255,255,255,0.05)"}`, borderRadius: 8, padding: "10px 12px", cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "block", width: "100%" }}>
                  <div style={{ fontSize: 11, color: isAc ? g.color : "#a1a1aa", display: "flex", alignItems: "center", gap: 4 }}><Hexagon size={10} /> {g.name}</div>
                  <div style={{ fontSize: 9, color: "#52525b", marginTop: 3 }}>{g.members.length} members</div>
                </button>
              );
            })}
          </>
        )}
      </div>

      {/* Message thread */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "rgba(0,0,0,0.2)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)", overflow: "hidden" }}>
        {(activeChannel || broadcastGroup) ? (
          <>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                {activeChannel && !broadcastGroup && acFrom && acTo && (
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      <span style={{ color: ROLES.find(r => r.id === acFrom.role)?.color }}>{acFrom.name}</span>
                      <span style={{ color: "#52525b", margin: "0 8px" }}>→</span>
                      <span style={{ color: ROLES.find(r => r.id === acTo.role)?.color }}>{acTo.name}</span>
                    </div>
                    <div style={{ fontSize: 9, color: "#52525b", marginTop: 4 }}>{acTo.prompt ? `${acTo.name} will respond using its prompt` : `${acTo.name} has no prompt`}</div>
                  </div>
                )}
                {broadcastGroup && (
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: groups.find(g => g.id === broadcastGroup)?.color, display: "flex", alignItems: "center", gap: 6 }}><Hexagon size={12} /> {groups.find(g => g.id === broadcastGroup)?.name} — Broadcast</div>
                  </div>
                )}
              </div>
              {visibleMessages.length > 0 && (
                <BulkCheckbox
                  checked={bulk.isAllSelected(visibleMessages.map(m => m.id))}
                  onChange={() => bulk.toggleAll(visibleMessages.map(m => m.id))}
                  color="#fbbf24"
                />
              )}
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: 18 }}>
              {activeChannel && !broadcastGroup && channelMessages.length === 0 && (
                <div style={{ textAlign: "center", padding: 40, color: "#3f3f46" }}>
                  <GradientIcon icon={MessageSquare} size={24} gradient={["#fbbf24", "#fb923c"]} />
                  <div style={{ fontSize: 11 }}>No messages yet.</div>
                </div>
              )}
              {activeChannel && !broadcastGroup && channelMessages.map((m) => {
                const sender = agents.find((a) => a.id === m.fromId);
                const receiver = agents.find((a) => a.id === m.toId);
                const sRole = sender ? ROLES.find(r => r.id === sender.role) : null;
                const rRole = receiver ? ROLES.find(r => r.id === receiver.role) : null;
                const isChecked = bulk.has(m.id);
                return (
                  <div key={m.id} style={{ marginBottom: 20, background: isChecked ? "rgba(239,68,68,0.04)" : "transparent", borderRadius: 8, padding: isChecked ? "8px" : 0, border: isChecked ? "1px solid rgba(239,68,68,0.15)" : "1px solid transparent", transition: "all 0.2s" }}>
                    <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                      <BulkCheckbox checked={isChecked} onChange={() => bulk.toggle(m.id)} color="#fbbf24" />
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: (sRole?.color || "#555") + "20", border: `1px solid ${sRole?.color || "#555"}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>{sRole?.icon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, color: sRole?.color, marginBottom: 4 }}>{sender?.name} <span style={{ color: "#3f3f46", fontSize: 9 }}>{new Date(m.ts).toLocaleTimeString()}</span></div>
                        <FormattedMessage content={m.content} className="chat-md" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "2px 10px 10px 10px", padding: "10px 14px", fontSize: 12, lineHeight: 1.6, color: "#d4d4d8" }} />
                      </div>
                    </div>
                    {m.status === "sending" && <div style={{ paddingLeft: 56, fontSize: 11, color: "#fbbf24" }}><span style={{ animation: "pulse 1.5s infinite" }}>●</span> {receiver?.name} is thinking...</div>}
                    {m.response && (
                      <div style={{ display: "flex", gap: 10, paddingLeft: 38 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 6, background: (rRole?.color || "#555") + "20", border: `1px solid ${rRole?.color || "#555"}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>{rRole?.icon}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 10, color: rRole?.color, marginBottom: 4 }}>{receiver?.name} <span style={{ color: m.status === "no-prompt" ? "#ef4444" : "#3f3f46", fontSize: 9 }}>{m.status === "no-prompt" ? "no prompt" : "response"}</span></div>
                          <FormattedMessage content={m.response} className="chat-md" style={{ background: m.status === "no-prompt" ? "rgba(239,68,68,0.05)" : (rRole?.color || "#555") + "08", border: `1px solid ${m.status === "no-prompt" ? "rgba(239,68,68,0.15)" : (rRole?.color || "#555") + "15"}`, borderRadius: "10px 2px 10px 10px", padding: "10px 14px", fontSize: 12, lineHeight: 1.6, color: m.status === "no-prompt" ? "#71717a" : "#d4d4d8" }} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {broadcastGroup && (() => {
                const group = groups.find((g) => g.id === broadcastGroup);
                if (!group) return null;
                const bMsgs = messages.filter((m) => m.content.includes(`[GROUP BROADCAST — ${group.name}]`) && group.members.includes(m.toId));
                if (bMsgs.length === 0) return (
                  <div style={{ textAlign: "center", padding: 40, color: "#3f3f46" }}>
                    <GradientIcon icon={Hexagon} size={24} gradient={["#f472b6", "#fb7185"]} />
                    <div style={{ fontSize: 11 }}>No broadcasts yet.</div>
                  </div>
                );
                return bMsgs.map((m) => {
                  const receiver = agents.find((a) => a.id === m.toId);
                  const rRole = receiver ? ROLES.find(r => r.id === receiver.role) : null;
                  const isChecked = bulk.has(m.id);
                  return (
                    <div key={m.id} style={{ marginBottom: 14, display: "flex", gap: 10, background: isChecked ? "rgba(239,68,68,0.04)" : "transparent", borderRadius: 8, padding: isChecked ? "8px" : 0, border: isChecked ? "1px solid rgba(239,68,68,0.15)" : "1px solid transparent", transition: "all 0.2s" }}>
                      <BulkCheckbox checked={isChecked} onChange={() => bulk.toggle(m.id)} color="#fbbf24" />
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: (rRole?.color || "#555") + "20", border: `1px solid ${rRole?.color || "#555"}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>{rRole?.icon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, color: rRole?.color, marginBottom: 4 }}>{receiver?.name}</div>
                        {m.response && <FormattedMessage content={m.response} className="chat-md" style={{ background: (rRole?.color || "#555") + "08", border: `1px solid ${(rRole?.color || "#555")}15`, borderRadius: 8, padding: "10px 14px", fontSize: 12, lineHeight: 1.6, color: "#d4d4d8" }} />}
                        {m.status === "sending" && <div style={{ fontSize: 11, color: "#fbbf24" }}>● thinking...</div>}
                      </div>
                    </div>
                  );
                });
              })()}
              <div ref={msgEndRef} />
            </div>
            {/* Input area */}
            <div style={{ padding: "14px 18px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.15)" }}>
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
                  {activeChannel && !broadcastGroup && (
                    <div style={{ display: "flex", gap: 10 }}>
                      <input placeholder={`Message ${acTo?.name || "agent"}...`} value={msgInput} onChange={(e) => setMsgInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()} disabled={sending} style={{ ...inputStyle, border: "1px solid rgba(251,191,36,0.15)", opacity: sending ? 0.5 : 1 }} />
                      <button onClick={sendMessage} disabled={sending || !msgInput.trim()} style={{ background: sending ? "#3f3f46" : "#fbbf24", color: "#0a0a0f", border: "none", padding: "10px 18px", borderRadius: 6, cursor: sending ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 500, flexShrink: 0 }}>{sending ? "…" : "Send"}</button>
                    </div>
                  )}
                  {broadcastGroup && (
                    <div style={{ display: "flex", gap: 10 }}>
                      <input placeholder="Broadcast to all members..." value={broadcastInput} onChange={(e) => setBroadcastInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendBroadcast()} disabled={broadcasting} style={{ ...inputStyle, border: `1px solid ${groups.find(g => g.id === broadcastGroup)?.color || "#f472b6"}25`, opacity: broadcasting ? 0.5 : 1 }} />
                      <button onClick={sendBroadcast} disabled={broadcasting || !broadcastInput.trim()} style={{ background: broadcasting ? "#3f3f46" : groups.find(g => g.id === broadcastGroup)?.color || "#f472b6", color: "#0a0a0f", border: "none", padding: "10px 18px", borderRadius: 6, cursor: broadcasting ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 500, flexShrink: 0 }}>{broadcasting ? "…" : "Broadcast"}</button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#3f3f46" }}>
            <div style={{ textAlign: "center" }}>
              <GradientIcon icon={MessageSquare} size={32} gradient={["#fbbf24", "#fb923c"]} />
              <div style={{ fontSize: 12 }}>Select a channel or group.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
