import React from "react";
import type { RefObject } from "react";
import { useState, useMemo, useCallback } from "react";
import type { Agent, Channel, Group, Message, Network, Bridge, BridgeMessage, JobArtifact, ViewId } from "@/types";
import { MessageSquare, ArrowLeftRight, Hexagon, X, Link2, Globe, FileText, FileJson, FileCode, Image, FileSpreadsheet, File, Eye, EyeOff } from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import { MarkdownContent } from "@/components/shared/MarkdownContent";
import { ROLES, CHANNEL_TYPES } from "@/constants";
import { SectionTitle, BulkCheckbox, BulkActionBar } from "@/components/shared/ui";
import { useBulkSelect } from "@/hooks/useBulkSelect";
import { extractArtifactRefs, buildArtifactMap } from "@/utils/artifactRefs";
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
  // Read/unread tracking
  unreadCounts?: Record<string, number>;
  markChannelRead?: (channelId: string) => void;
  // Bridge messaging props
  networks: Network[];
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
  // Artifact reference support
  allArtifacts: JobArtifact[];
  onNavigateToArtifact?: (artifact: JobArtifact) => void;
}

export function MessagesView({
  agents, channels, groups, messages,
  activeChannel, setActiveChannel, msgInput, setMsgInput, sending,
  broadcastGroup, setBroadcastGroup, broadcastInput, setBroadcastInput, broadcasting,
  msgEndRef, channelMessages, acFrom, acTo,
  sendMessage, sendBroadcast, removeMessages,
  unreadCounts, markChannelRead,
  networks, bridges, bridgeMessages,
  selectedBridge, setSelectedBridge, bridgeMsgInput, setBridgeMsgInput,
  bridgeSending, selBridgeFrom, selBridgeTo, selBridgeFromNet, selBridgeToNet,
  sendBridgeMessage,
  allArtifacts, onNavigateToArtifact,
}: MessagesViewProps) {
  const bulk = useBulkSelect();
  const [ecosystemOverview, setEcosystemOverview] = useState(false);

  // Build artifact lookup map for reference detection
  const artifactMap = useMemo(() => buildArtifactMap(allArtifacts), [allArtifacts]);

  /** Icon for artifact type */
  const artIcon = useCallback((type: string) => {
    switch (type) {
      case "markdown": return <FileText size={10} />;
      case "json": return <FileJson size={10} />;
      case "yaml": return <FileCode size={10} />;
      case "code": return <FileCode size={10} />;
      case "csv": return <FileSpreadsheet size={10} />;
      case "image": return <Image size={10} />;
      default: return <File size={10} />;
    }
  }, []);

  /** Render clickable artifact chips for a text block */
  const renderArtifactChips = useCallback((text: string) => {
    const refs = extractArtifactRefs(text, artifactMap);
    if (refs.length === 0) return null;
    return (
      <div className="msg-artifact-chips">
        {refs.map((ref) => {
          const art = artifactMap.get(ref.id);
          return (
            <button
              key={ref.id}
              className="msg-artifact-chip"
              onClick={(e) => { e.stopPropagation(); if (art && onNavigateToArtifact) onNavigateToArtifact(art); }}
              title={`Open artifact: ${ref.label}`}
            >
              {artIcon(ref.type)}
              <span className="msg-artifact-chip__name">{ref.label}</span>
              <span className="msg-artifact-chip__type">{ref.type}</span>
            </button>
          );
        })}
      </div>
    );
  }, [artifactMap, artIcon, onNavigateToArtifact]);

  // Determine which messaging mode is active
  const isBridgeMode = !!selectedBridge && !activeChannel && !broadcastGroup && !ecosystemOverview;

  const visibleMessages = activeChannel && !broadcastGroup && !selectedBridge && !ecosystemOverview
    ? channelMessages
    : broadcastGroup && !selectedBridge && !ecosystemOverview
      ? (() => {
        const group = groups.find((g) => g.id === broadcastGroup);
        if (!group) return [];
        return messages.filter((m) => m.content.includes(`[GROUP BROADCAST — ${group.name}]`) && group.members.includes(m.toId));
      })()
      : [];

  // ── Ecosystem Overview: merge ALL message sources chronologically ──
  const allAgentsMap = useMemo(() => {
    const map = new Map<string, Agent>();
    agents.forEach(a => map.set(a.id, a));
    networks.forEach(net => net.agents?.forEach(a => { if (!map.has(a.id)) map.set(a.id, a); }));
    return map;
  }, [agents, networks]);

  type UnifiedMsg = {
    id: string;
    fromId: string;
    toId: string;
    content: string;
    response: string | null;
    status: string;
    ts: number;
    source: "p2p" | "broadcast" | "bridge" | "network";
    channelId?: string;
    networkName?: string;
    networkColor?: string;
  };

  const ecosystemMessages = useMemo<UnifiedMsg[]>(() => {
    if (!ecosystemOverview) return [];
    const unified: UnifiedMsg[] = [];

    // 1) Workspace-level P2P messages
    messages.forEach(m => {
      unified.push({ ...m, source: "p2p" });
    });

    // 2) Bridge messages
    bridgeMessages.forEach(bm => {
      unified.push({
        id: bm.id,
        fromId: bm.fromId,
        toId: bm.toId,
        content: bm.content,
        response: bm.response,
        status: bm.status,
        ts: bm.ts,
        source: "bridge",
      });
    });

    // 3) Network-internal messages (from each ecosystem network)
    networks.forEach(net => {
      (net.messages || []).forEach(m => {
        // Avoid duplicates if already in workspace messages
        if (!unified.some(u => u.id === m.id)) {
          unified.push({
            ...m,
            source: "network",
            networkName: net.name,
            networkColor: net.color,
          });
        }
      });
    });

    // Sort chronologically
    unified.sort((a, b) => a.ts - b.ts);
    return unified;
  }, [ecosystemOverview, messages, bridgeMessages, networks]);

  const handleBulkDelete = () => {
    removeMessages(bulk.selected);
    bulk.clearSelection();
  };

  return (
    <div className="messages-layout">
      {/* Channel list sidebar */}
      <div className="messages-sidebar">
        <h2 className="messages-sidebar__title"><GradientIcon icon={MessageSquare} size={18} gradient={["#fbbf24", "#fb923c"]} /> Messages</h2>

        {/* Ecosystem Overview */}
        <SectionTitle text="Ecosystem Overview" />
        <button
          onClick={() => { setEcosystemOverview(true); setActiveChannel(null); setBroadcastGroup(null); setSelectedBridge(null); bulk.clearSelection(); }}
          className={`channel-btn${ecosystemOverview ? " channel-btn--active-eco" : ""}`}
        >
          <div className="channel-btn__label"><Globe size={10} /> All Messages</div>
          <div className="channel-btn__meta">{messages.length + bridgeMessages.length + networks.reduce((s, n) => s + (n.messages?.length || 0), 0)} total</div>
        </button>

        <div className="messages-sidebar__section-gap"><SectionTitle text="P2P Channels" /></div>
        {channels.length === 0 && <div className="messages-sidebar__empty">No channels</div>}
        {channels.map((ch) => {
          const from = agents.find((a) => a.id === ch.from);
          const to = agents.find((a) => a.id === ch.to);
          const msgCount = messages.filter((m) => m.channelId === ch.id).length;
          const unread = unreadCounts?.[ch.id] || 0;
          if (!from || !to) return null;
          const isAc = activeChannel === ch.id && !broadcastGroup && !selectedBridge;
          return (
            <button key={ch.id} onClick={() => { setActiveChannel(ch.id); setBroadcastGroup(null); setSelectedBridge(null); setEcosystemOverview(false); bulk.clearSelection(); if (markChannelRead) markChannelRead(ch.id); }} className={`channel-btn${isAc ? " channel-btn--active-p2p" : ""}${unread > 0 ? " channel-btn--unread" : ""}`}>
              <div className="channel-btn__label">
                {from.name} <ArrowLeftRight size={10} /> {to.name}
                {unread > 0 && <span className="channel-btn__unread-badge">{unread}</span>}
              </div>
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
              const isAc = broadcastGroup === g.id && !selectedBridge && !ecosystemOverview;
              return (
                <button key={g.id} onClick={() => { setBroadcastGroup(g.id); setActiveChannel(null); setSelectedBridge(null); setEcosystemOverview(false); bulk.clearSelection(); }} className={`channel-btn${isAc ? " channel-btn--active-group" : ""}`} style={isAc ? { background: g.color + "12", borderColor: g.color + "30" } : undefined}>
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
              const fNet = networks.find((n) => n.id === b.fromNetworkId);
              const tNet = networks.find((n) => n.id === b.toNetworkId);
              const fA = agents.find((a) => a.id === b.fromAgentId) || fNet?.agents.find((a) => a.id === b.fromAgentId);
              const tA = agents.find((a) => a.id === b.toAgentId) || tNet?.agents.find((a) => a.id === b.toAgentId);
              const bmCount = bridgeMessages.filter((m) => m.bridgeId === b.id).length;
              const isAc = selectedBridge === b.id;
              return (
                <button key={b.id} onClick={() => { setSelectedBridge(isAc ? null : b.id); setActiveChannel(null); setBroadcastGroup(null); setEcosystemOverview(false); bulk.clearSelection(); }} className={`channel-btn${isAc ? " channel-btn--active-bridge" : ""}`}>
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
        {/* ── Ecosystem Overview Feed ── */}
        {ecosystemOverview ? (
          <>
            <div className="msg-thread__header">
              <div>
                <div className="msg-thread__header-title msg-thread__header-title--eco">
                  <Globe size={14} /> Ecosystem Overview
                </div>
                <div className="msg-thread__header-subtitle">
                  All messages across channels, groups, bridges & networks · {ecosystemMessages.length} messages
                </div>
              </div>
            </div>
            <div className="msg-thread__body">
              {ecosystemMessages.length === 0 ? (
                <div className="msg-thread__empty">
                  <GradientIcon icon={Globe} size={24} gradient={["#38bdf8", "#818cf8"]} />
                  <div className="msg-thread__empty-text">No messages in the ecosystem yet.</div>
                </div>
              ) : (
                ecosystemMessages.map(m => {
                  const sender = allAgentsMap.get(m.fromId);
                  const receiver = allAgentsMap.get(m.toId);
                  const sRole = sender ? ROLES.find(r => r.id === sender.role) : null;
                  const rRole = receiver ? ROLES.find(r => r.id === receiver.role) : null;
                  const sourceLabel = m.source === "bridge" ? "bridge" : m.source === "network" ? m.networkName : m.source === "broadcast" ? "broadcast" : undefined;
                  const sourceColor = m.source === "bridge" ? "#38bdf8" : m.source === "network" ? (m.networkColor || "#818cf8") : m.source === "broadcast" ? "#f472b6" : undefined;
                  return (
                    <div key={m.id} className="msg-item msg-item--eco">
                      <div className="msg-row">
                        <div className="msg-avatar" style={{ background: (sRole?.color || "#555") + "20", border: `1px solid ${sRole?.color || "#555"}30` }}>{sRole?.icon}</div>
                        <div className="msg-content">
                          <div className="msg-sender" style={{ color: sRole?.color }}>
                            {sender?.name || m.fromId.slice(0, 8)}
                            <span className="msg-sender__arrow">→</span>
                            <span style={{ color: rRole?.color }}>{receiver?.name || m.toId.slice(0, 8)}</span>
                            <span className="msg-sender__timestamp">{new Date(m.ts).toLocaleString()}</span>
                            {sourceLabel && <span className="msg-sender__source" style={{ color: sourceColor, borderColor: sourceColor + "30" }}>{sourceLabel}</span>}
                          </div>
                          <MarkdownContent content={m.content} className="msg-bubble--sent" />
                          {renderArtifactChips(m.content)}
                        </div>
                      </div>
                      {m.status === "sending" && <div className="msg-thinking"><span className="msg-thinking__dot">●</span> {receiver?.name} is thinking...</div>}
                      {m.response && (
                        <div className="msg-row--reply">
                          <div className="msg-avatar" style={{ background: (rRole?.color || "#555") + "20", border: `1px solid ${rRole?.color || "#555"}30` }}>{rRole?.icon}</div>
                          <div className="msg-content">
                            <div className="msg-sender" style={{ color: rRole?.color }}>
                              {receiver?.name || m.toId.slice(0, 8)}
                              <span className={`msg-sender__status${m.status === "no-prompt" ? " msg-sender__status--no-prompt" : " msg-sender__status--response"}`}>{m.status === "no-prompt" ? "no prompt" : "response"}</span>
                            </div>
                            <MarkdownContent content={m.response} className={`msg-bubble--received${m.status === "no-prompt" ? " msg-bubble--no-prompt" : ""}`} style={m.status !== "no-prompt" ? { background: (rRole?.color || "#555") + "08", border: `1px solid ${(rRole?.color || "#555")}15` } : undefined} />
                            {renderArtifactChips(m.response)}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={msgEndRef} />
            </div>
            {/* No input bar for ecosystem overview — read-only */}
            <div className="msg-input-bar msg-input-bar--eco">
              <div className="msg-eco-footer">
                <Globe size={12} /> Read-only ecosystem feed
              </div>
            </div>
          </>
        ) : (activeChannel || broadcastGroup || isBridgeMode) ? (
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
              {activeChannel && !broadcastGroup && !selectedBridge && (() => {
                const firstUnreadIdx = channelMessages.findIndex(m => !m.readAt && m.response !== null && m.status !== "sending");
                return channelMessages.map((m, idx) => {
                const sender = agents.find((a) => a.id === m.fromId);
                const receiver = agents.find((a) => a.id === m.toId);
                const sRole = sender ? ROLES.find(r => r.id === sender.role) : null;
                const rRole = receiver ? ROLES.find(r => r.id === receiver.role) : null;
                const isChecked = bulk.has(m.id);
                const isUnread = !m.readAt && m.response !== null && m.status !== "sending";
                return (
                  <React.Fragment key={m.id}>
                    {idx === firstUnreadIdx && firstUnreadIdx > 0 && (
                      <div className="msg-new-divider">
                        <span className="msg-new-divider__line" />
                        <span className="msg-new-divider__label">New</span>
                        <span className="msg-new-divider__line" />
                      </div>
                    )}
                    <div className={`msg-item${isChecked ? " msg-item--checked" : ""}${isUnread ? " msg-item--unread" : ""}`}>
                    {isUnread && <div className="msg-unread-dot" title="New" />}
                    <div className="msg-row">
                      <BulkCheckbox checked={isChecked} onChange={() => bulk.toggle(m.id)} color="#fbbf24" />
                      <div className="msg-avatar" style={{ background: (sRole?.color || "#555") + "20", border: `1px solid ${sRole?.color || "#555"}30` }}>{sRole?.icon}</div>
                      <div className="msg-content">
                        <div className="msg-sender" style={{ color: sRole?.color }}>
                          {sender?.name} <span className="msg-sender__timestamp">{new Date(m.ts).toLocaleTimeString()}</span>
                          {m.readAt ? <span title={`Read ${new Date(m.readAt).toLocaleString()}`}><Eye size={9} className="msg-sender__read-icon" /></span> : m.response !== null && m.status !== "sending" ? <span title="Unread"><EyeOff size={9} className="msg-sender__unread-icon" /></span> : null}
                        </div>
                        <MarkdownContent content={m.content} className="msg-bubble--sent" />
                        {renderArtifactChips(m.content)}
                      </div>
                    </div>
                    {m.status === "sending" && <div className="msg-thinking"><span className="msg-thinking__dot">●</span> {receiver?.name} is thinking...</div>}
                    {m.response && (
                      <div className="msg-row--reply">
                        <div className="msg-avatar" style={{ background: (rRole?.color || "#555") + "20", border: `1px solid ${rRole?.color || "#555"}30` }}>{rRole?.icon}</div>
                        <div className="msg-content">
                          <div className="msg-sender" style={{ color: rRole?.color }}>{receiver?.name} <span className={`msg-sender__status${m.status === "no-prompt" ? " msg-sender__status--no-prompt" : " msg-sender__status--response"}`}>{m.status === "no-prompt" ? "no prompt" : "response"}</span></div>
                          <MarkdownContent content={m.response} className={`msg-bubble--received${m.status === "no-prompt" ? " msg-bubble--no-prompt" : ""}`} style={m.status !== "no-prompt" ? { background: (rRole?.color || "#555") + "08", border: `1px solid ${(rRole?.color || "#555")}15` } : undefined} />
                          {renderArtifactChips(m.response)}
                        </div>
                      </div>
                    )}
                  </div>
                  </React.Fragment>
                );
              });
              })()}
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
                        {m.response && <MarkdownContent content={m.response} className="msg-bubble--broadcast" style={{ background: (rRole?.color || "#555") + "08", border: `1px solid ${(rRole?.color || "#555")}15` }} />}
                        {m.response && renderArtifactChips(m.response)}
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
                          <MarkdownContent content={m.content} className="msg-bubble--sent" />
                          {renderArtifactChips(m.content)}
                        </div>
                      </div>
                      {m.status === "sending" && <div className="msg-thinking--bridge"><span className="msg-thinking__dot">●</span> {selBridgeTo.name} is thinking…</div>}
                      {m.response && (
                        <div className="msg-row--reply">
                          <div className="msg-avatar" style={{ background: (rRole?.color || "#555") + "20", border: `1px solid ${rRole?.color || "#555"}30` }}>{rRole?.icon}</div>
                          <div className="msg-content">
                            <div className="msg-sender" style={{ color: rRole?.color }}>{selBridgeTo.name} <span className="msg-sender__net">({selBridgeToNet?.name})</span> <span className={`msg-sender__status${m.status === "no-prompt" ? " msg-sender__status--no-prompt" : " msg-sender__status--response"}`}>{m.status === "no-prompt" ? "no prompt" : "response"}</span></div>
                            <MarkdownContent content={m.response} className={`msg-bubble--received msg-bubble--bridge-response${m.status === "no-prompt" ? " msg-bubble--no-prompt" : ""}`} style={m.status !== "no-prompt" ? { background: (rRole?.color || "#555") + "08", border: `1px solid ${(rRole?.color || "#555")}15` } : undefined} />
                            {renderArtifactChips(m.response)}
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
              <div className="msg-thread__placeholder-text">Select a channel, group, bridge, or ecosystem overview.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
