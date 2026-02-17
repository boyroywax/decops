import type { Agent, Channel, ChannelForm, ViewId, Message, Network } from "../../types";
import { CHANNEL_TYPES, ROLES } from "../../constants";
import { inputStyle, SectionTitle, BulkCheckbox, BulkActionBar, PillButton } from "../shared/ui";
import { ArrowLeftRight, X, Globe } from "lucide-react";
import { GradientIcon } from "../shared/GradientIcon";
import { useBulkSelect } from "../../hooks/useBulkSelect";
import "../../styles/components/channels.css";

interface ChannelsViewProps {
  agents: Agent[];
  channels: Channel[];
  messages: Message[];
  ecosystems: Network[];
  channelForm: ChannelForm;
  setChannelForm: (v: ChannelForm) => void;
  createChannel: () => void;
  removeChannel: (id: string) => void;
  removeChannels: (ids: Set<string>) => void;
  setActiveChannel: (id: string) => void;
  setView: (v: ViewId) => void;
}

export function ChannelsView({
  agents, channels, messages, ecosystems,
  channelForm, setChannelForm,
  createChannel, removeChannel, removeChannels, setActiveChannel, setView,
}: ChannelsViewProps) {
  const bulk = useBulkSelect();

  const getNetworkName = (networkId?: string) => {
    if (!networkId) return null;
    const net = ecosystems.find(n => n.id === networkId);
    return net ? { name: net.name, color: net.color } : null;
  };

  const handleBulkDelete = () => {
    removeChannels(bulk.selected);
    bulk.clearSelection();
  };

  return (
    <div>
      <div className="channels-header">
        <h2 className="channels-title"><GradientIcon icon={ArrowLeftRight} size={18} gradient={["#a78bfa", "#c084fc"]} /> P2P Channels</h2>
        {channels.length > 0 && (
          <BulkCheckbox
            checked={bulk.isAllSelected(channels.map(c => c.id))}
            onChange={() => bulk.toggleAll(channels.map(c => c.id))}
            color="#a78bfa"
          />
        )}
      </div>

      {ecosystems.length === 0 ? (
        <div className="channels-empty-state">
          <Globe size={24} className="channels-empty-icon" />
          <div className="channels-empty-title">No networks available</div>
          <div className="channels-empty-subtitle">Create a network first before adding channels.</div>
        </div>
      ) : (
        <div className="channel-form">
          <SectionTitle text="Establish Channel" />
          <div className="channel-form-row">
            <select 
              value={channelForm.networkId} 
              onChange={(e) => setChannelForm({ ...channelForm, networkId: e.target.value, from: "", to: "" })} 
              className="input input-channel channel-form-select"
            >
              <option value="">Select network...</option>
              {ecosystems.map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
          </div>
          {channelForm.networkId && (() => {
            const networkAgents = agents.filter(a => a.networkId === channelForm.networkId);
            if (networkAgents.length < 2) {
              return (
                <div className="channel-form-notice">
                  Need at least 2 agents in this network to create a channel.
                </div>
              );
            }
            return (
              <div className="channel-form-agents-row">
                <select value={channelForm.from} onChange={(e) => setChannelForm({ ...channelForm, from: e.target.value })} className="input input-channel channel-form-agent-select">
                  <option value="">From…</option>
                  {networkAgents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <ArrowLeftRight size={10} className="channel-arrow-icon" />
                <select value={channelForm.to} onChange={(e) => setChannelForm({ ...channelForm, to: e.target.value })} className="input input-channel channel-form-agent-select">
                  <option value="">To…</option>
                  {networkAgents.filter((a) => a.id !== channelForm.from).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <div className="channel-type-pills">
                  {CHANNEL_TYPES.map((t) => (
                    <PillButton key={t.id} active={channelForm.type === t.id} activeColor="#a78bfa" onClick={() => setChannelForm({ ...channelForm, type: t.id })}>
                      {t.icon} {t.label}
                    </PillButton>
                  ))}
                </div>
                <button 
                  onClick={createChannel} 
                  disabled={!channelForm.from || !channelForm.to}
                  className={`channel-submit-btn ${channelForm.from && channelForm.to ? 'channel-submit-btn--enabled' : 'channel-submit-btn--disabled'}`}
                >
                  Connect
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {channels.map((ch) => {
        const from = agents.find((a) => a.id === ch.from);
        const to = agents.find((a) => a.id === ch.to);
        const cType = CHANNEL_TYPES.find((t) => t.id === ch.type);
        const msgCount = messages.filter((m) => m.channelId === ch.id).length;
        const network = getNetworkName(ch.networkId);
        const isChecked = bulk.has(ch.id);
        if (!from || !to) return null;
        return (
          <div key={ch.id} className={`channel-item ${isChecked ? 'channel-item--checked' : ''}`}>
            <div className="channel-item-left">
              <BulkCheckbox checked={isChecked} onChange={() => bulk.toggle(ch.id)} color="#a78bfa" />
              <span style={{ color: ROLES.find(r => r.id === from.role)?.color }}>{from.name}</span>
              <ArrowLeftRight size={10} className="channel-arrow-icon" />
              <span style={{ color: ROLES.find(r => r.id === to.role)?.color }}>{to.name}</span>
              <span className="channel-item-type-badge">{cType?.icon} {cType?.label}</span>
              {network && <span className="channel-item-network-badge" style={{ color: network.color, background: network.color + '15' }}><Globe size={9} /> {network.name}</span>}
              {msgCount > 0 && <span className="channel-item-msg-badge">{msgCount} msgs</span>}
            </div>
            <div className="channel-item-actions">
              <button onClick={() => { setActiveChannel(ch.id); setView("messages"); }} className="btn btn-sm btn-message">Message</button>
              <button onClick={() => removeChannel(ch.id)} className="btn btn-sm btn-ghost"><X size={10} /></button>
            </div>
          </div>
        );
      })}

      <BulkActionBar
        count={bulk.count}
        total={channels.length}
        onSelectAll={() => bulk.selectAll(channels.map(c => c.id))}
        onClear={bulk.clearSelection}
        onDelete={handleBulkDelete}
        allSelected={bulk.isAllSelected(channels.map(c => c.id))}
        entityName="channel"
      />
    </div>
  );
}
