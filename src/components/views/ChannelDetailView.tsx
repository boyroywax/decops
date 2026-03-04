import type { Agent, Channel, Message, Network, ViewId, NavContext } from "@/types";
import { CHANNEL_TYPES, ROLES } from "@/constants";
import { Radio, Calendar, ArrowLeftRight, MessageSquare, Globe, Zap, Users, Clock, Trash2 } from "lucide-react";
import { GradientIcon } from "@/components/shared/GradientIcon";
import { CopyableId } from "@/components/shared/CopyableId";
import { MarkdownContent } from "@/components/shared/MarkdownContent";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { DeleteConfirmInline } from "@/components/shared/DeleteConfirmInline";
import "../../styles/components/channel-detail.css";

interface ChannelDetailViewProps {
  channelId: string;
  networkId?: string;
  agents: Agent[];
  channels: Channel[];
  messages: Message[];
  ecosystems: Network[];
  navigateTo: (view: ViewId, ctx: NavContext) => void;
  removeChannel: (id: string) => void;
  setActiveChannel: (id: string) => void;
  setView: (v: ViewId) => void;
}

export function ChannelDetailView({
  channelId, networkId, agents, channels, messages, ecosystems,
  navigateTo, removeChannel, setActiveChannel, setView,
}: ChannelDetailViewProps) {
  const channel = channels.find(c => c.id === channelId);
  if (!channel) {
    return (
      <div className="channel-detail__empty-root">
        Channel not found. It may have been removed.
      </div>
    );
  }

  const fromAgent = agents.find(a => a.id === channel.from);
  const toAgent = agents.find(a => a.id === channel.to);
  const channelMessages = messages.filter(m => m.channelId === channelId);
  const network = ecosystems.find(n => n.id === (channel.networkId || networkId));
  const chType = CHANNEL_TYPES.find(t => t.id === channel.type);
  const fromRole = ROLES.find(r => r.id === fromAgent?.role);
  const toRole = ROLES.find(r => r.id === toAgent?.role);
  const delConfirm = useDeleteConfirm();

  const handleOpenMessages = () => {
    setActiveChannel(channelId);
    setView("messages");
  };

  const handleDelete = () => {
    removeChannel(channelId);
    // Navigate back to network or channels list
    if (network) {
      navigateTo("networks", { networkId: network.id });
    } else {
      navigateTo("channels", {});
    }
  };

  return (
    <div className="channel-detail">
      {/* Header */}
      <div className="channel-detail__header">
        <div className="channel-detail__title-row">
          <div className="channel-detail__icon">
            <Radio size={22} color="#a78bfa" />
          </div>
          <div>
            <h2 className="channel-detail__title">
              {fromAgent?.name || "Unknown"} <ArrowLeftRight size={16} className="channel-detail__arrow" /> {toAgent?.name || "Unknown"}
            </h2>
            <div className="channel-detail__did"><CopyableId value={channel.id} label="ID" /></div>
          </div>
        </div>
        <div className="channel-detail__meta">
          <span><Calendar size={11} /> Created {new Date(channel.createdAt).toLocaleDateString()}</span>
          {channel.mode && <span className="channel-detail__mode-badge">{channel.mode}</span>}
        </div>
      </div>

      {/* Stats bar */}
      <div className="channel-detail__stats">
        <div className="channel-detail__stat">
          {chType?.icon || <Radio size={13} />}
          <span className="channel-detail__stat-value">{chType?.label || channel.type}</span> Type
        </div>
        <div className="channel-detail__stat">
          <MessageSquare size={13} />
          <span className="channel-detail__stat-value">{channelMessages.length}</span> Messages
        </div>
        <div className="channel-detail__stat">
          <Zap size={13} />
          <span className="channel-detail__stat-value">{channel.mode || "p2p"}</span> Mode
        </div>
        {network && (
          <div className="channel-detail__stat channel-detail__stat--clickable"
            onClick={() => navigateTo("networks", { networkId: network.id })}>
            <Globe size={13} color={network.color} />
            <span className="channel-detail__stat-value" style={{ color: network.color }}>{network.name}</span> Network
          </div>
        )}
      </div>

      {/* Endpoints section */}
      <div className="channel-detail__section">
        <div className="channel-detail__section-title">Endpoints</div>
        <div className="channel-detail__endpoints">
          {/* From Agent */}
          {fromAgent && (
            <div className="cd-endpoint"
              onClick={() => navigateTo("networks", {
                networkId: fromAgent.networkId || networkId || "",
                agentId: fromAgent.id,
              })}>
              <div className="cd-endpoint__icon"
                style={{ background: `${fromRole?.color || "#555"}10`, border: `1px solid ${fromRole?.color || "#555"}20` }}>
                {fromRole?.icon || <Users size={14} />}
              </div>
              <div className="cd-endpoint__info">
                <div className="cd-endpoint__name">{fromAgent.name}</div>
                <div className="cd-endpoint__role">{fromRole?.label || "Agent"}</div>
                <div className="cd-endpoint__label">Source</div>
              </div>
            </div>
          )}

          <div className="cd-endpoint__arrow">
            <ArrowLeftRight size={18} />
            <div className="cd-endpoint__arrow-label">{chType?.label || channel.type}</div>
          </div>

          {/* To Agent */}
          {toAgent && (
            <div className="cd-endpoint"
              onClick={() => navigateTo("networks", {
                networkId: toAgent.networkId || networkId || "",
                agentId: toAgent.id,
              })}>
              <div className="cd-endpoint__icon"
                style={{ background: `${toRole?.color || "#555"}10`, border: `1px solid ${toRole?.color || "#555"}20` }}>
                {toRole?.icon || <Users size={14} />}
              </div>
              <div className="cd-endpoint__info">
                <div className="cd-endpoint__name">{toAgent.name}</div>
                <div className="cd-endpoint__role">{toRole?.label || "Agent"}</div>
                <div className="cd-endpoint__label">Destination</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent Messages */}
      <div className="channel-detail__section">
        <div className="channel-detail__section-title">
          Recent Messages ({channelMessages.length})
        </div>
        {channelMessages.length > 0 ? (
          <div className="channel-detail__messages">
            {channelMessages.slice(-10).reverse().map(msg => {
              const sender = agents.find(a => a.id === msg.fromId);
              const senderRole = ROLES.find(r => r.id === sender?.role);
              return (
                <div key={msg.id} className="cd-message">
                  <div className="cd-message__header">
                    <span className="cd-message__sender" style={{ color: senderRole?.color }}>
                      {sender?.name || "Unknown"}
                    </span>
                    <span className="cd-message__time">
                      <Clock size={9} /> {new Date(msg.ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className={`cd-message__status cd-message__status--${msg.status}`}>
                      {msg.status}
                    </span>
                  </div>
                  <MarkdownContent content={msg.content} className="cd-message__content" />
                  {msg.response && (
                    <div className="cd-message__response">
                      <span className="cd-message__response-label">Response:</span>
                      <MarkdownContent content={msg.response} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="channel-detail__empty">
            No messages exchanged on this channel yet.
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="channel-detail__actions">
        <button className="channel-detail__action-btn channel-detail__action-btn--primary" onClick={handleOpenMessages}>
          <MessageSquare size={13} /> Open Messages
        </button>
        {delConfirm.isPending(channelId) ? (
          <DeleteConfirmInline
            entityName="Channel"
            onConfirm={() => delConfirm.confirm(() => handleDelete())}
            onCancel={delConfirm.cancel}
            compact
          />
        ) : (
          <button className="channel-detail__action-btn channel-detail__action-btn--danger" onClick={() => delConfirm.requestDelete(channelId)}>
            <Trash2 size={13} /> Remove Channel
          </button>
        )}
      </div>
    </div>
  );
}
